import { DocumentType } from '@prisma/client';
import { runModularExtraction, toExtractedData } from './extractors/index';

/**
 * Per-field extraction from raw OCR text. Kept deliberately as a pure,
 * dependency-free module so it can be unit-tested in isolation.
 *
 * These heuristics target the well-known layouts of Indian identity/address
 * documents (Aadhaar, PAN, driving licence, utility bills). The pattern-based
 * approach is a first accuracy pass — see `docs/ocr/ocr-accuracy-roadmap.md`
 * for the structured-parser roadmap (PaddleOCR + local VLM) that supersedes it.
 */

export interface ExtractedData {
  extractedAadhaar?: string | undefined;
  extractedPan?: string | undefined;
  extractedName?: string | undefined;
  extractedDob?: string | undefined;
  extractedFatherName?: string | undefined;
  extractedLicenseNumber?: string | undefined;
  extractedAddress?: string | undefined;
  extractedValidity?: string | undefined;
  /** Gender, when present in a QR payload (not persisted — informational). */
  extractedGender?: string | undefined;
  /** Year of birth, when a QR payload carries only a year (not a full date). */
  extractedYearOfBirth?: string | undefined;

  // ── Expanded fields (added for richer extraction) ───────────────────
  extractedPinCode?: string | undefined;
  extractedState?: string | undefined;
  extractedDistrict?: string | undefined;
  extractedIssueDate?: string | undefined;
  extractedExpiryDate?: string | undefined;
  extractedIssuingAuthority?: string | undefined;
  extractedBloodGroup?: string | undefined;
  extractedAuthorizationToDrive?: string | undefined;
  extractedPermanentAddress?: string | undefined;
  extractedDownloadDate?: string | undefined;
  extractedEnrolmentNumber?: string | undefined;

  /**
   * Per-field provenance: `'qr'` when the value came from a decoded QR payload
   * (authoritative), `'ocr'` when from the OCR pass. Populated by the QR-first
   * merge; empty for plain OCR-only results. Kept so extraction provenance is
   * auditable/debuggable per field.
   */
  fieldSources?: Record<string, 'qr' | 'ocr'> | undefined;
  /** Per-field confidence scores (0–100) from the modular extractors. */
  fieldConfidences?: Record<string, number> | undefined;
  isUnreadable: boolean;
  /**
   * True when OCR was not confident enough to trust the result silently —
   * either because confidence was low AND at most half the expected fields
   * for the document type were extracted, or because a specific field was
   * flagged as implausible (see `lowConfidenceFields`). The UI should prompt
   * "please verify" rather than present the data as reliable.
   */
  needsReview?: boolean | undefined;
  /** Keys of `EXTRACTED_FIELD_KEYS` whose value is likely a misread (e.g. an
   *  impossible DOB year) and should be verified manually. */
  lowConfidenceFields?: string[] | undefined;
}

/** Keys of `ExtractedData` that correspond to editable user-facing fields. */
export const EXTRACTED_FIELD_KEYS = [
  'extractedAadhaar',
  'extractedPan',
  'extractedName',
  'extractedDob',
  'extractedFatherName',
  'extractedLicenseNumber',
  'extractedAddress',
  'extractedValidity',
  'extractedPinCode',
  'extractedState',
  'extractedDistrict',
  'extractedIssueDate',
  'extractedExpiryDate',
  'extractedIssuingAuthority',
  'extractedBloodGroup',
  'extractedAuthorizationToDrive',
  'extractedPermanentAddress',
] as const;

/** Number of fields a well-OCR'd example of each document type should yield. */
export const EXPECTED_FIELDS: Record<DocumentType, number> = {
  AADHAAR_CARD: 3, // name, dob, aadhaar
  PAN_CARD: 4, // pan, name, father's name, dob
  ADDRESS_PROOF: 5, // licence number, validity, name, dob, address
  OWNERSHIP_PROOF: 5,
  PASSPORT_PHOTO: 2,
  AFFIDAVIT: 3,
  OTHER: 3,
};

/**
 * The keys a QR payload can authoritatively provide for each document type.
 * Used to decide when a QR read is complete (skip OCR) vs partial (fall back
 * to OCR for the gaps). Kept separate from `EXPECTED_FIELDS` (which drives the
 * OCR confidence review) because a QR can only ever yield the keys we model.
 */
export const EXPECTED_FIELD_KEYS: Record<DocumentType, readonly (keyof ExtractedData)[]> = {
  AADHAAR_CARD: ['extractedName', 'extractedDob', 'extractedAadhaar'],
  PAN_CARD: ['extractedPan', 'extractedName', 'extractedFatherName', 'extractedDob'],
  ADDRESS_PROOF: ['extractedLicenseNumber', 'extractedName', 'extractedDob', 'extractedAddress', 'extractedValidity'],
  OWNERSHIP_PROOF: ['extractedName', 'extractedAddress'],
  PASSPORT_PHOTO: ['extractedName'],
  AFFIDAVIT: ['extractedName', 'extractedDob'],
  OTHER: ['extractedName'],
};

/** OCR results below this confidence are treated as unreadable outright. */
export const UNREADABLE_CONFIDENCE = 30;
/** Text shorter than this (after trim) is treated as unreadable outright. */
export const UNREADABLE_MIN_CHARS = 10;
/** Below this confidence a partially-extracted document is "needs review". */
export const REVIEW_CONFIDENCE_THRESHOLD = 60;

/** Normalizes OCR noise: line endings, dashes, smart quotes, whitespace. */
const normalize = (text: string): string =>
  text
    .replace(/\r/g, '\n')
    .replace(/[\u2013\u2014\u2015]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const DATE_STRICT = /(\d{2})[/\-.](\d{2})[/\-.](\d{4})/;

const labelValue = (text: string, label: RegExp): string | undefined => {
  const match = text.match(label);
  return match?.[1]?.trim() || undefined;
};/** Collapses consecutive whitespace inside a captured value. */
const tidy = (value: string): string => value.replace(/\s{2,}/g, ' ').trim();

export const extractAadhaar = (text: string): string | undefined => {
  // 4-4-4 or 12 contiguous digits, not part of a longer number and not
  // spanning line breaks (otherwise a DOB like 15/08/1990 + a following
  // number could be misread as an aadhaar).
  const match = text.match(/(?<!\d)(?:\d{4}[ \t]\d{4}[ \t]\d{4}|\d{12})(?!\d)/);
  return match?.[0]?.replace(/[\s-]/g, '') ?? undefined;
};

export const extractPan = (text: string): string | undefined => {
  const match = text.match(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/);
  return match ? match[0] : undefined;
};

const DOB_LINE_RE =
  /(?:Date\s*of\s*Birth|DOB|D\.?\s?O\.?\s?B\.?)\s*:?\s*\d{2}[/\-.]\d{2}[/\-.]\d{4}/i;

export const extractDob = (text: string): string | undefined => {
  // Prefer a date explicitly labelled Date of Birth / DOB.
  const labelled = labelValue(text, DOB_LINE_RE);
  if (labelled) return labelled;
  const match = text.match(DATE_STRICT);
  return match?.[0] ?? undefined;
};

/** Plausible birth-year window: nobody alive was born before 1930 or is <18. */
const MIN_DOB_YEAR = 1930;
const MIN_AGE_YEARS = 18;
const MAX_DOB_YEAR = new Date().getFullYear() - MIN_AGE_YEARS;

/** True when the extracted date is actually possible as a date of birth. */
export const validateDob = (value: string): { valid: boolean; reason?: string } => {
  const match = value.match(/(\d{2})[/\-.](\d{2})[/\-.](\d{4})/);
  if (!match) return { valid: false, reason: `not a date: ${value}` };
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < MIN_DOB_YEAR || year > MAX_DOB_YEAR) {
    return { valid: false, reason: `year ${year} outside plausible range ${MIN_DOB_YEAR}-${MAX_DOB_YEAR}` };
  }
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false, reason: `invalid date ${value}` };
  }
  return { valid: true };
};

const NAME_CHARS = "[A-Z][A-Z .'\\-]{1,}";
const BANNED_NAME_LABELS = /father|mother|guardian|spouse|husband|wife/i;

/** "Name : RAJESH KUMAR" — but never the Father/Mother/Guardian lines. */
export const extractName = (text: string): string | undefined => {
  const lines = text.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (BANNED_NAME_LABELS.test(line)) continue;
    const match = line.match(
      new RegExp(
        `^(?:Name|Consumer Name|Applicant Name|Full Name|Customer Name|As Per Aadhaar)\\s*:?\\s*(${NAME_CHARS})$`,
        'i',
      ),
    );
    if (match && match[1]) return tidy(match[1]);
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Aadhaar name extraction (positional)
//
// Aadhaar cards print the name as a bare line — the Devanagari name above,
// the English name on its own line, then "जन्म तिथि / DOB : …" and a gender
// line below — with NO "Name:" label anywhere on the card. A label-based
// matcher can never see it, so we locate the DOB line and take the nearest
// English-alphabet name line above it.
// ---------------------------------------------------------------------------

const DEVIANAGARI_RE = /[\u0900-\u097F]/;
const NAME_TOKEN_RE = /\b[A-Z][A-Za-z.'-]{1,}\b/g;
/** Words OCR throws into name position that are never a person's name. */
const NAME_STOP_WORDS = /^(government|india|aadhaar|male|female|dob|date|birth|signature|authority|address|of|the|and|name|uidai)$/i;

/** Extracts a run of consecutive English name tokens from a line. */
const nameRun = (line: string): string | undefined => {
  const tokens = (line.match(NAME_TOKEN_RE) ?? []).filter((t) => !NAME_STOP_WORDS.test(t));
  if (tokens.length === 0) return undefined;
  const name = tokens.join(' ').trim();
  if (name.length < 3) return undefined;
  // Single-token results must actually look like a name (vowel-bearing).
  if (tokens.length === 1 && !/[AEIOU]/i.test(name)) return undefined;
  return name;
};

const NAME_LABEL_PREFIX_RE =
  /^(?:Name|Consumer Name|Applicant Name|Full Name|Customer Name|As Per Aadhaar)\s*:?\s*/i;

export const extractAadhaarName = (text: string): string | undefined => {
  const lines = text.split('\n');
  const dobIndex = lines.findIndex((l) => DOB_LINE_RE.test(l));
  if (dobIndex < 0) return undefined;

  // Walk upward from the DOB line for the nearest English-only name line,
  // skipping Devanagari-script lines (the Hindi name above the English one).
  for (let i = dobIndex - 1; i >= 0 && i >= dobIndex - 4; i--) {
    const line = lines[i]?.trim() ?? '';
    if (!line || DEVIANAGARI_RE.test(line)) continue;
    // Label-based cards ("Name : X") still print the name above the DOB line.
    const name = nameRun(line.replace(NAME_LABEL_PREFIX_RE, ''));
    if (name) return name;
  }
  return undefined;
};

// ---------------------------------------------------------------------------
// Father's name (PAN cards): the value can span the label line AND the
// following OCR line(s), and must pass a "looks like a name" sanity check so
// fragments like "SERRA bb" are never surfaced as a clean extraction.
// ---------------------------------------------------------------------------

const FATHER_LABEL_RE =
  /(?:Father(?:'|'s|s)?\s*Name|F\/N?ame|Father)\s*:?\s*(.*)$/i;
const NON_NAME_NEXT_LINE_RE =
  /(\d{4}|DOB|Date|Validity|Permanent Account|Address|Signature|Father|Mother|Spouse|Guardian)/i;

export const extractFatherName = (text: string): string | undefined => {
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const match = (lines[i] ?? '').match(FATHER_LABEL_RE);
    if (!match) continue;

    const tokens: string[] = [];
    const labelCapture = match[1] ?? '';
    // OCR garble like "Father's Name SERRA bb" leaves lowercase noise right
    // after the label — the real name usually continues on the next line.
    const hadGarbage = /[a-z]/.test(labelCapture);
    const addFrom = (segment: string): void => {
      const found = segment.match(/\b[A-Z]{2,}\b/g);
      if (found) tokens.push(...found);
    };

    addFrom(labelCapture);

    // A garble like "Father's Name SERRA bb" often splits the real name onto
    // the next OCR line ("AFZAL ANISH."), so keep consuming following lines
    // while they are made of uppercase words only.
    for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
      const next = (lines[j] ?? '').trim();
      if (!next || NON_NAME_NEXT_LINE_RE.test(next)) break;
      const found = next.match(/\b[A-Z]{2,}\b/g);
      const residue = next.replace(/\b[A-Z]{2,}\b/g, '').replace(/[^A-Za-z.,' -]/g, '').trim();
      // Stop if the line has lowercase/unknown text (likely a new field, not
      // a continuation) — allow only a trailing period (". " end of name).
      if (!found || (residue.length > 0 && !/^\.+$/.test(residue))) break;
      tokens.push(...found);
    }

    // If the label line itself was garbled, only accept the result when the
    // following line actually continued the name (2+ tokens).
    if (hadGarbage && tokens.length < 2) continue;

    const name = tokens.join(' ').trim();
    if (name.length < 4) continue;
    // Reject fragments contaminated by OCR noise: any lowercase token or a
    // value with no vowel anywhere cannot be a real name.
    if (/[a-z]/.test(name)) continue;
    if (!/[AEIOU]/i.test(name)) continue;
    return name.replace(/\b(\w+)\s+\1\b/gi, '$1');
  }

  return undefined;
};

// ---------------------------------------------------------------------------
// PAN name + father's name extraction (positional)
//
// PAN cards print the name and father's name as BARE uppercase lines directly
// under the "INCOME TAX DEPARTMENT GOVT. OF INDIA" header — there is usually
// no "Name:" / "Father's Name" label on the card for OCR to latch onto. A
// label-based matcher can never see them, so we locate the header and the
// "Permanent Account Number" row and read the uppercase name lines in between:
// first = name, second = father's name. Same class of positional fix as the
// Aadhaar name extractor above.
// ---------------------------------------------------------------------------

const PAN_HEADER_RE = /INCOME\s*TAX\s*DEPARTMENT|GOVT\.?\s*OF\s*INDIA/i;
const PAN_ACCOUNT_LABEL_RE = /Permanen?\s*Account\s*Number|Account\s*Number/i;
/** Uppercase run of 3+ letters with a vowel — a plausible name token. */
const PAN_NAME_TOKEN_RE = /\b[A-Z]{2,}\b/g;

/** A plausible name line from a PAN card region, or undefined. */
const panNameFromLine = (line: string): string | undefined => {
  const tokens = (line.match(PAN_NAME_TOKEN_RE) ?? []).filter(
    (t) => t.length >= 3 && /[AEIOU]/.test(t) && !NAME_STOP_WORDS.test(t),
  );
  if (tokens.length === 0) return undefined;
  const name = tokens.join(' ');
  return name.length >= 3 ? name : undefined;
};

/** Reads name + father's name positionally from a PAN card's OCR text. */
export const extractPanPositionalNames = (
  text: string,
): { name?: string; father?: string } => {
  const lines = text.split('\n');
  const headerIndex = lines.findIndex((l) => PAN_HEADER_RE.test(l));
  if (headerIndex < 0) return {};
  const accountIndex = lines.findIndex(
    (l, i) => i > headerIndex && PAN_ACCOUNT_LABEL_RE.test(l),
  );
  const end = accountIndex < 0 ? lines.length : accountIndex;

  const names: string[] = [];
  for (let i = headerIndex + 1; i < end; i++) {
    const name = panNameFromLine(lines[i] ?? '');
    if (name) {
      names.push(name);
      if (names.length === 2) break;
    }
  }
  const result: { name?: string; father?: string } = {};
  if (names[0]) result.name = names[0];
  if (names[1]) result.father = names[1];
  return result;
};

/** Indian driving licence: `DL-09-2024-1234567` / `KA 03 2007 0012345`. */
export const extractLicenseNumber = (text: string): string | undefined => {
  const match = text.match(/\b[A-Z]{2}[\s-]?\d{2}[\s-]?\d{4}[\s-]?\d{5,7}\b/);
  return match?.[0]?.trim() ?? undefined;
};

/** "Valid Till: 30/12/2030" — the licence expiry date. */
export const extractValidity = (text: string): string | undefined => {
  const match = text.match(
    /(?:Valid\s*(?:Till|Up\s*To|Upto|From|To)?\s*:?\s*)(\d{2}[/\-.]\d{2}[/\-.]\d{4})/i,
  );
  return match?.[1] ?? undefined;
};

export const extractAddress = (text: string): string | undefined => {
  const match = text.match(
    /(?:Address|Residential Address|Permanent Address|Correspondence Address)\s*:?\s*([A-Z0-9][^\n]{5,})/i,
  );
  return match?.[1] ? tidy(match[1]) : undefined;
};

/** Counts how many editable fields currently hold a value. */
const countExtracted = (d: ExtractedData): number =>
  EXTRACTED_FIELD_KEYS.reduce((n, k) => n + (d[k] ? 1 : 0), 0);

/**
 * Decides whether the document needs manual review: low OCR confidence AND
 * at most half the expected fields for its type, or any field that was
 * individually flagged as implausible (e.g. an impossible DOB year).
 */
export const assessNeedsReview = (
  docType: DocumentType,
  confidence: number | undefined,
  extracted: ExtractedData,
): boolean => {
  if (confidence === undefined || extracted.isUnreadable) return false;
  const got = countExtracted(extracted);
  const atMostHalf = got * 2 <= (EXPECTED_FIELDS[docType] ?? 0);
  if (confidence < REVIEW_CONFIDENCE_THRESHOLD && atMostHalf) return true;
  return (extracted.lowConfidenceFields?.length ?? 0) > 0;
};

/** Runs the full extraction + assessment path for a single OCR result. */
export const buildExtractedResult = (
  text: string,
  confidence: number,
  docType: DocumentType,
): ExtractedData => {
  const unreadable = confidence < UNREADABLE_CONFIDENCE || text.trim().length < UNREADABLE_MIN_CHARS;
  if (unreadable) return { isUnreadable: true };
  return extractFields(text, docType, confidence);
};

/** One candidate OCR pass over the same image (e.g. deskewed vs straight). */
export interface OcrCandidateResult {
  text: string;
  confidence: number;
  extracted: ExtractedData;
}

/** Picks the OCR candidate that produced the best structured extraction,
 *  preferring more extracted fields, then higher recognition confidence.
 *  The caller guarantees at least one candidate. */
export const selectBestCandidate = (results: OcrCandidateResult[]): OcrCandidateResult => {
  const score = (r: OcrCandidateResult): number => countExtracted(r.extracted) * 1000 + r.confidence;
  return results.reduce((best, cur) => (score(cur) > score(best) ? cur : best));
};

/**
 * Routes extraction by document type using modular extractors.
 */
export const extractFields = (
  text: string,
  docType: DocumentType,
  confidence?: number,
): ExtractedData => {
  const result = runModularExtraction(text, docType, confidence);
  return toExtractedData(result);
};

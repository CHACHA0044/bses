import zlib from 'zlib';
import {
  ExtractedData,
  extractAadhaar,
  extractPan,
  extractName,
  extractFatherName,
  extractLicenseNumber,
  extractValidity,
  extractAddress,
  extractDob,
} from './extractors';

/**
 * Defensive parser for QR payloads found on Indian identity documents.
 *
 * UIDAI Aadhaar QR codes ship in several families, and we deliberately do not
 * assume which one a card carries:
 *
 *   - **PrintLetterBarcodeData** — `<?xml …?><PrintLetterBarcodeData
 *     uid="…" name="…" dob="…" yob="…" gender="…" co=… state="…" pc="…" />`.
 *     The current UIDAI offline QR format (plain XML attribute payload).
 *   - **Secure QR** — `<?xml ...?><Signature>…</Signature><Data>base64</Data>`
 *     where the base64 blob is (usually) zlib-compressed JSON of the eKYC
 *     fields (`name`, `dob`/`yob`, `gender`, `co`…`pc`, `uid`, `photo`).
 *   - **Legacy numeric** — a long decimal-digit payload that decodes to
 *     gzip/deflate-compressed bytes whose text fields are `0xFF`-separated:
 *     `V2<FF>3<FF>enrolmentNo<FF>name<FF>dob<FF>gender<FF>address…<FF>photo`.
 *   - **Legacy XML** — plain `<?xml …?><Uid><Name><Dob>…` element payload.
 *   - **Legacy text** — pipe-delimited plain text fields.
 *
 * PAN and driving-licence QRs are not publicly specified, so for any other
 * document type we run the generic extractors over the raw payload text and
 * treat whatever they find as authoritative QR data.
 *
 * Security posture (mirrors `utils/file-safety.ts`):
 *   - The payload is treated as fully untrusted. Only regex tag extraction and
 *     `JSON.parse` are used — never eval, never arbitrary deserialization.
 *   - Decompression is bounded with `maxOutputLength` so a decompression bomb
 *     cannot OOM the process; the cap is generous for a legitimate Aadhaar
 *     photo (~3 KB compressed) but still finite. The legacy numeric decoder
 *     also bounds the big-int → byte conversion (digit length checked first).
 *   - Any embedded photo base64 is detected and dropped from `raw` before it
 *     is logged/stored — the blob itself is never retained.
 *   - Malformed payloads fail cleanly to a `generic` result, never a throw.
 */

export type QrPayloadFormat =
  | 'aadhaar-print-letter'
  | 'aadhaar-secure'
  | 'aadhaar-legacy-numeric'
  | 'aadhaar-legacy-xml'
  | 'aadhaar-legacy-text'
  | 'generic';

export interface QrPayload {
  format: QrPayloadFormat;
  /** Payload text with any embedded photo blob removed (safe to log/store). */
  raw: string;
  hasPhoto: boolean;
  /** Any fields that could be read from the payload (all `source: 'qr'`). */
  fields: ExtractedData;
  /** Non-fatal parse notes (e.g. "expected zlib, got plain JSON"). */
  errors: string[];
}

/** Bounded decompression output cap (legit photo ~3 KB compressed). */
const MAX_DECOMPRESSED_BYTES = 8 * 1024 * 1024;
/** Base64 runs longer than this inside a payload are treated as a photo. */
const PHOTO_BASE64_MIN_LENGTH = 2000;

const ADDRESS_JSON_KEYS = ['co', 'house', 'loc', 'vtc', 'po', 'dist', 'subdist', 'state', 'pc'] as const;

/**
 * Produces the report/storage-safe form of a payload: the embedded photo never
 * leaves the parser. The secure wrapper's whole `<Data>` blob (which is the
 * base64/compressed JSON, including any photo) is replaced with a marker — the
 * fields are already extracted from the original text before this runs — and
 * any other long bare base64 run is treated as a photo blob. The wrapped
 * structure stays readable for debugging.
 */
const sanitizeRaw = (raw: string): string =>
  raw
    .replace(/(<Data[^>]*>)[\s\S]*?(<\/Data>)/gi, '$1[data omitted]$2')
    .replace(new RegExp(`[A-Za-z0-9+/]{${PHOTO_BASE64_MIN_LENGTH},}={0,2}`, 'g'), '[base64 blob omitted]')
    .trim();

const safeJsonParse = (input: string): unknown => {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Tries the byte payload as plain UTF-8 JSON, then zlib/gzip-inflated JSON. */
const decodeToJson = (bytes: Buffer): { record: Record<string, unknown>; via: string } | null => {
  const plain = safeJsonParse(bytes.toString('utf8'));
  if (isRecord(plain)) return { record: plain, via: 'plain' };

  const inflaters = [
    { name: 'zlib', run: () => zlib.inflateSync(bytes, { maxOutputLength: MAX_DECOMPRESSED_BYTES }) },
    { name: 'raw', run: () => zlib.inflateRawSync(bytes, { maxOutputLength: MAX_DECOMPRESSED_BYTES }) },
    { name: 'gzip', run: () => zlib.gunzipSync(bytes, { maxOutputLength: MAX_DECOMPRESSED_BYTES }) },
  ] as const;

  for (const { name, run } of inflaters) {
    let out: Buffer;
    try {
      out = run();
    } catch {
      continue;
    }
    if (out.length > MAX_DECOMPRESSED_BYTES) continue;
    const parsed = safeJsonParse(out.toString('utf8'));
    if (isRecord(parsed)) return { record: parsed, via: name };
  }
  return null;
};

const decodeBase64 = (text: string): Buffer | null => {
  const cleaned = text.replace(/\s+/g, '');
  if (!cleaned || !/^[A-Za-z0-9+/]+={0,2}$/.test(cleaned)) return null;
  const buf = Buffer.from(cleaned, 'base64');
  if (buf.length === 0) return null;
  return buf;
};

const normalizeDob = (value: string): string => {
  const iso = value.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const dmy = value.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/);
  if (dmy) return `${dmy[1]}/${dmy[2]}/${dmy[3]}`;
  return value.trim();
};

const normalizeAadhaar = (value: string): string | undefined => {
  const digits = value.replace(/\s+/g, '');
  if (/^\d{12}$/.test(digits)) return digits;
  // Masked reference ids ("XXXX XXXX 1234") are kept verbatim for reference.
  if (/^[Xx0-9 ]+$/.test(value) && /[0-9]/.test(value)) return digits;
  return undefined;
};

const normalizeGender = (value: string): string | undefined => {
  const g = value.trim().toUpperCase();
  if (g === 'M' || g === 'MALE') return 'Male';
  if (g === 'F' || g === 'FEMALE') return 'Female';
  if (g === 'T' || g === 'TRANSGENDER') return 'Transgender';
  return value.trim() || undefined;
};

const composeAddress = (parts: Array<string | undefined>): string | undefined => {
  const joined = parts.map((p) => p?.trim()).filter((p): p is string => !!p).join(', ');
  return joined.length > 0 ? joined : undefined;
};

/** The modeled extraction keys that can carry a value. */
const FIELD_KEYS = [
  'extractedName',
  'extractedDob',
  'extractedYearOfBirth',
  'extractedGender',
  'extractedAadhaar',
  'extractedPan',
  'extractedFatherName',
  'extractedLicenseNumber',
  'extractedValidity',
  'extractedAddress',
] as const;

const hasUsableFields = (fields: ExtractedData): boolean =>
  FIELD_KEYS.some((k) => !!fields[k]);

const buildFieldsFromJson = (obj: Record<string, unknown>): { fields: ExtractedData; hasPhoto: boolean } => {
  const str = (k: string): string | undefined => (typeof obj[k] === 'string' ? obj[k].trim() : undefined);
  const fields: ExtractedData = { isUnreadable: false, fieldSources: {} };

  const hasPhoto = typeof obj['photo'] === 'string' && (obj['photo'] as string).length > 0;

  const name = str('name') ?? (str('gname') && str('lname') ? `${str('gname')} ${str('lname')}`.trim() : undefined);
  if (name) fields.extractedName = name;

  const dob = str('dob') ?? str('DOB');
  const yob = str('yob') ?? str('YOB');
  if (dob) fields.extractedDob = normalizeDob(dob);
  else if (yob && /^\d{4}$/.test(yob)) fields.extractedYearOfBirth = yob;

  const gender = str('gender') ?? str('Gender');
  const g = normalizeGender(gender ?? '');
  if (g) fields.extractedGender = g;

  const aadhaar = str('uid') ?? str('Uid');
  if (aadhaar) {
    const normalized = normalizeAadhaar(aadhaar);
    if (normalized) fields.extractedAadhaar = normalized;
  }

  const address = composeAddress(ADDRESS_JSON_KEYS.map((k) => str(k)));
  if (address) fields.extractedAddress = address;

  return { fields, hasPhoto };
};

const parseSecureFormat = (text: string): { fields: ExtractedData; hasPhoto: boolean } | null => {
  // Preferred: the `<Data>base64</Data>` element of the signed XML wrapper.
  const dataMatch = text.match(/<Data[^>]*>\s*([A-Za-z0-9+/=\s]+?)\s*<\/Data>/i);
  const encoded = dataMatch?.[1] ?? (looksLikeBareBase64(text) ? text : undefined);
  if (!encoded) return null;

  const bytes = decodeBase64(encoded);
  if (!bytes) return null;

  const decoded = decodeToJson(bytes);
  if (!decoded) return null;

  const { fields, hasPhoto } = buildFieldsFromJson(decoded.record);
  return hasUsableFields(fields) ? { fields, hasPhoto } : null;
};

const looksLikeBareBase64 = (text: string): boolean => {
  const t = text.trim();
  return t.length > 100 && /^[A-Za-z0-9+/=\s]+$/.test(t) && (t.includes('=') || t.length % 4 === 0);
};

const parseLegacyXml = (text: string): ExtractedData | null => {
  const tag = (name: string): string | undefined => {
    const match = text.match(new RegExp(`<${name}[^>]*>\\s*([\\s\\S]*?)\\s*<\\/${name}>`, 'i'));
    const value = match?.[1]?.trim();
    return value ? value : undefined;
  };

  const fields: ExtractedData = { isUnreadable: false, fieldSources: {} };

  const name = tag('Name');
  if (name) fields.extractedName = name;

  const dob = tag('Dob') ?? tag('DOB') ?? tag('DateofBirth');
  const yob = tag('Yob') ?? tag('YOB');
  if (dob) fields.extractedDob = normalizeDob(dob);
  else if (yob && /^\d{4}$/.test(yob)) fields.extractedYearOfBirth = yob;

  const gender = normalizeGender(tag('Gender') ?? '');
  if (gender) fields.extractedGender = gender;

  const aadhaar = normalizeAadhaar(tag('Uid') ?? tag('Aadhaar') ?? '');
  if (aadhaar) fields.extractedAadhaar = aadhaar;

  const address = composeAddress(ADDRESS_JSON_KEYS.map((k) => tag(k))) ?? tag('Address');
  if (address) fields.extractedAddress = address;

  return hasUsableFields(fields) ? fields : null;
};

const GENDER_TOKEN_RE = /^(?:M|F|T|Male|Female|Transgender)$/i;
const DATE_ANY_RE = /(\d{4}[/-]\d{2}[/-]\d{2}|\d{2}[/-]\d{2}[/-]\d{4})/;

/**
 * Pipe-delimited legacy payloads have no reliable field order across card
 * generations, so fields are located semantically rather than positionally:
 * the name is the first alpha-only multi-token segment, gender/date/aadhaar
 * are matched by shape, and everything unused becomes the address.
 */
const parseLegacyText = (text: string): ExtractedData | null => {
  const parts = text
    .split(/[|]+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  if (parts.length < 2) return null;

  const fields: ExtractedData = { isUnreadable: false, fieldSources: {} };
  const used = new Set<number>();

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    if (!fields.extractedAadhaar) {
      const a = part.replace(/\s+/g, '');
      if (/^\d{12}$/.test(a)) {
        fields.extractedAadhaar = a;
        used.add(i);
        continue;
      }
    }
    if (!fields.extractedDob) {
      const m = part.match(DATE_ANY_RE);
      if (m) {
        fields.extractedDob = normalizeDob(m[1] ?? '');
        used.add(i);
        continue;
      }
    }
    if (!fields.extractedGender && GENDER_TOKEN_RE.test(part)) {
      const g = normalizeGender(part);
      if (g) {
        fields.extractedGender = g;
        used.add(i);
        continue;
      }
    }
    if (!fields.extractedName && /^[A-Z][A-Za-z .'-]{2,}$/.test(part)) {
      const tokens = part.split(/\s+/);
      if (tokens.length >= 1 && tokens.length <= 5 && !/\d/.test(part)) {
        fields.extractedName = part;
        used.add(i);
      }
    }
  }

  const address = composeAddress(parts.filter((_, i) => !used.has(i)));
  if (address) fields.extractedAddress = address;

  return hasUsableFields(fields) ? fields : null;
};

/** Runs the generic OCR extractors over the raw payload (any doc type). */
const scanGeneric = (text: string): ExtractedData => {
  const fields: ExtractedData = { isUnreadable: false, fieldSources: {} };
  const name = extractName(text);
  if (name) fields.extractedName = name;
  const dob = extractDob(text);
  if (dob) fields.extractedDob = dob;
  const aadhaar = extractAadhaar(text);
  if (aadhaar) fields.extractedAadhaar = aadhaar;
  const pan = extractPan(text);
  if (pan) fields.extractedPan = pan;
  const father = extractFatherName(text);
  if (father) fields.extractedFatherName = father;
  const licence = extractLicenseNumber(text);
  if (licence) fields.extractedLicenseNumber = licence;
  const validity = extractValidity(text);
  if (validity) fields.extractedValidity = validity;
  const address = extractAddress(text);
  if (address) fields.extractedAddress = address;
  const genderMatch = text.match(/\b(MALE|FEMALE|Transgender)\b/i);
  if (genderMatch && genderMatch[1]) fields.extractedGender = normalizeGender(genderMatch[1]) ?? genderMatch[1];
  return fields;
};

const mergeFields = (primary: ExtractedData | null, generic: ExtractedData): ExtractedData => {
  if (!primary) return generic;
  const merged: ExtractedData = { isUnreadable: false, fieldSources: {} };
  for (const key of [
    'extractedName',
    'extractedDob',
    'extractedYearOfBirth',
    'extractedGender',
    'extractedAadhaar',
    'extractedAddress',
  ] as const) {
    merged[key] = primary[key] ?? generic[key];
  }
  for (const key of ['extractedPan', 'extractedFatherName', 'extractedLicenseNumber', 'extractedValidity'] as const) {
    merged[key] = generic[key];
  }
  return merged;
};

/**
 * Current UIDAI offline QR: `<?xml …?><PrintLetterBarcodeData uid="…" name="…"
 * dob="…" yob="…" gender="…" co="…" house="…" loc="…" vtc="…" po="…"
 * dist="…" subdist="…" state="…" pc="…" />`. Maps straight onto the JSON
 * keys `buildFieldsFromJson` already understands.
 */
const parsePrintLetterBarcodeData = (text: string): { fields: ExtractedData; hasPhoto: boolean } | null => {
  const match = text.match(/<PrintLetterBarcodeData\s+([^>]*?)\/>/i);
  const inner = match?.[1];
  if (!inner) return null;
  const obj: Record<string, unknown> = {};
  const attrRe = /([A-Za-z]+)\s*=\s*"([^"]*)"/g;
  let attr: RegExpExecArray | null;
  while ((attr = attrRe.exec(inner)) !== null) {
    const key = attr[1];
    const value = attr[2];
    if (key && value !== undefined) obj[key] = value;
  }
  if (!obj['name'] && !obj['uid'] && !obj['dob']) return null;
  const { fields, hasPhoto } = buildFieldsFromJson(obj);
  return hasUsableFields(fields) ? { fields, hasPhoto } : null;
};

// ---------------------------------------------------------------------------
// Legacy numeric QR (V1/V2/V3)
//
// Old-style Aadhaar cards encode the payload as a numeric-mode QR: a very long
// decimal string that is the big-endian byte representation of a
// gzip/deflate-compressed text record. The decompressed record is fields
// separated by byte 0xFF:
//
//   V2 <FF> 3 <FF> <enrolment number> <FF> <name> <FF> <dob> <FF> <gender>
//   <FF> <address fields…> <FF> <photo bytes (JPEG2000)>
//
// Field order within the address was never a stable public spec across card
// eras, so we extract only what is unambiguous (name/dob/gender) and keep the
// remaining printable text as the address, stopping at the first binary field
// (the photo). The old format does NOT carry the 12-digit UID, so Aadhaar is
// left to OCR for these cards.
// ---------------------------------------------------------------------------

const LEGACY_NUMERIC_MIN_DIGITS = 100;
const LEGACY_FIELD_SEPARATOR = 0xff;

const digitsToBytes = (digits: string): Buffer | null => {
  try {
    const big = BigInt(digits);
    let hex = big.toString(16);
    if (hex.length % 2 !== 0) hex = `0${hex}`;
    return hex ? Buffer.from(hex, 'hex') : null;
  } catch {
    return null;
  }
};

/** True when a 0xFF-delimited field is printable text (not the photo blob). */
const legacyFieldText = (buf: Buffer): string | null => {
  const text = buf.toString('utf8');
  if (text.length === 0) return '';
  let printable = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x20 && cp !== 0xfffd) printable++;
  }
  return printable / text.length >= 0.9 ? text.trim() : null;
};

const LEGACY_NAME_RE = /^[A-Za-z][A-Za-z .'\-]{1,}$/;
const LEGACY_DATE_RE = /^\d{1,2}[/\-.]\d{1,2}[/\-.]\d{4}$/;
const LEGACY_GENDER_RE = /^(M|F|MALE|FEMALE|Transgender)$/i;

const parseLegacyNumeric = (text: string): { fields: ExtractedData; hasPhoto: boolean } | null => {
  if (!new RegExp(`^\\d{${LEGACY_NUMERIC_MIN_DIGITS},}$`).test(text)) return null;
  const bytes = digitsToBytes(text);
  if (!bytes || bytes.length === 0) return null;

  const inflaters = [
    { name: 'gzip', run: () => zlib.gunzipSync(bytes, { maxOutputLength: MAX_DECOMPRESSED_BYTES }) },
    { name: 'deflate-raw', run: () => zlib.inflateRawSync(bytes, { maxOutputLength: MAX_DECOMPRESSED_BYTES }) },
    { name: 'deflate', run: () => zlib.inflateSync(bytes, { maxOutputLength: MAX_DECOMPRESSED_BYTES }) },
  ] as const;

  for (const { run } of inflaters) {
    let out: Buffer;
    try {
      out = run();
    } catch {
      continue;
    }
    if (out.length > MAX_DECOMPRESSED_BYTES) continue;

    // Split the decompressed bytes on 0xFF, decoding each field as text until
    // we hit the binary photo block.
    const rawFields: Buffer[] = [];
    let current: number[] = [];
    let photoFound = false;
    for (const byte of out) {
      if (byte === LEGACY_FIELD_SEPARATOR) {
        rawFields.push(Buffer.from(current));
        current = [];
      } else {
        current.push(byte);
      }
    }
    rawFields.push(Buffer.from(current));

    const values: string[] = [];
    for (let i = 0; i < rawFields.length; i++) {
      const field = rawFields[i];
      if (!field) continue;
      const v = legacyFieldText(field);
      if (v === null) {
        photoFound = true;
        break;
      }
      values.push(v);
    }
    if (values.length === 0) continue;

    const header = values[0] ?? '';
    if (!/^V[123]$/i.test(header)) continue;

    const fields: ExtractedData = { isUnreadable: false, fieldSources: {} };

    const nameIdx = values.findIndex((v) => LEGACY_NAME_RE.test(v));
    const dobIdx = values.findIndex((v) => LEGACY_DATE_RE.test(v));
    const genderIdx = values.findIndex((v) => LEGACY_GENDER_RE.test(v) && normalizeGender(v) !== undefined);

    const nameValue = nameIdx !== -1 ? values[nameIdx] : undefined;
    const dobValue = dobIdx !== -1 ? values[dobIdx] : undefined;
    const genderValue = genderIdx !== -1 ? values[genderIdx] : undefined;

    if (nameValue) fields.extractedName = nameValue;
    if (dobValue) {
      const normalized = normalizeDob(dobValue);
      if (normalized) fields.extractedDob = normalized;
    }
    if (genderValue) fields.extractedGender = normalizeGender(genderValue) ?? genderValue;

    // Address = printable fields after the last of name/dob/gender, excluding
    // the V/header and enrolment number fields that precede the name. Keep
    // every non-empty field verbatim (text lines and numeric fields alike —
    // PIN, sub-district codes — since the old field order was never stable).
    const lastIdField = Math.max(nameIdx, dobIdx, genderIdx);
    const addressParts = values
      .slice(lastIdField + 1)
      .map((v) => v.trim())
      .filter((v) => v.length >= 2);
    const address = composeAddress([...addressParts]);
    if (address && address.length >= 3) fields.extractedAddress = address;

    if (!hasUsableFields(fields)) continue;
    return { fields, hasPhoto: photoFound };
  }
  return null;
};

/**
 * Parses a decoded QR payload into extractable fields. Never throws; returns a
 * `generic` (possibly empty) result for anything malformed or unrecognised.
 */
export const parseQrPayload = (raw: string): QrPayload => {
  // The original text is parsed for fields; `raw` is the sanitized variant
  // (photo/embedded blobs removed) that is safe to log or persist.
  const rawText = raw;
  const errors: string[] = [];

  if (!rawText.trim()) return { format: 'generic', raw: sanitizeRaw(rawText), hasPhoto: false, fields: { isUnreadable: false, fieldSources: {} }, errors: ['empty payload'] };

  const text = rawText;
  const isXml = /<\?xml|<\w+[^>]*>[\s\S]*<\/\w+>/i.test(text);

  // 1) Legacy numeric QR — decimal digits, not XML. Bounded, never throws.
  const legacyNumeric = parseLegacyNumeric(text);
  if (legacyNumeric) {
    const numericRaw = `[legacy numeric payload: ${text.length} digits, photo omitted]`;
    return { format: 'aadhaar-legacy-numeric', raw: numericRaw, hasPhoto: legacyNumeric.hasPhoto, fields: mergeFields(legacyNumeric.fields, scanGeneric(text)), errors };
  }

  // 2) Current UIDAI offline QR — PrintLetterBarcodeData attributes.
  const printLetter = parsePrintLetterBarcodeData(text);
  if (printLetter) {
    return { format: 'aadhaar-print-letter', raw: sanitizeRaw(rawText), hasPhoto: printLetter.hasPhoto, fields: mergeFields(printLetter.fields, scanGeneric(text)), errors };
  }

  // 3) Secure QR — signed XML wrapper whose <Data> is base64(zlib?/json).
  if (isXml || looksLikeBareBase64(text)) {
    const secure = parseSecureFormat(text);
    if (secure) {
      return {
        format: 'aadhaar-secure',
        raw: sanitizeRaw(rawText),
        hasPhoto: secure.hasPhoto,
        fields: mergeFields(secure.fields, scanGeneric(text)),
        errors,
      };
    }
    if (isXml) {
      errors.push('secure wrapper present but <Data> failed to parse');
    }
  }

  // 4) Legacy XML payload without a base64 <Data> element.
  if (isXml) {
    const legacy = parseLegacyXml(text);
    if (legacy) {
      return { format: 'aadhaar-legacy-xml', raw: sanitizeRaw(rawText), hasPhoto: false, fields: mergeFields(legacy, scanGeneric(text)), errors };
    }
  }

  // 5) Pipe-delimited legacy plain text.
  if (text.includes('|') && !isXml && !looksLikeBareBase64(text)) {
    const legacy = parseLegacyText(text);
    if (legacy) {
      return { format: 'aadhaar-legacy-text', raw: sanitizeRaw(rawText), hasPhoto: false, fields: mergeFields(legacy, scanGeneric(text)), errors };
    }
  }

  // 6) Unknown payload — generic extractors over the raw text.
  return { format: 'generic', raw: sanitizeRaw(rawText), hasPhoto: /"photo"\s*:/i.test(text), fields: scanGeneric(text), errors };
};

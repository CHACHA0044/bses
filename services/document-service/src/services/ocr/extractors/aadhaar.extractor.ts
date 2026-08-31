/**
 * Aadhaar card / e-Aadhaar PDF extractor.
 *
 * Handles both:
 *   - Native text PDFs from DigiLocker (high-quality structured text)
 *   - OCR'd scanned/image Aadhaar cards (noisier, positional heuristics)
 *
 * Supports English and common Hindi/Devanagari labels.
 */

import {
  DocumentExtractor,
  ExtractionResult,
  FieldResult,
  normalize,
  DATE_RE,
  tidy,
  validateDob,
  validatePin,
  fieldConfidence,
  buildResult,
  multiLineLabelValue,
} from './base.extractor';

const DEVANAGARI_RE = /[\u0900-\u097F]/;

// ── Detection ───────────────────────────────────────────────────────────────

const AADHAAR_DETECT_RE =
  /Aadhaar|आधार|UIDAI|Unique\s*Identification|Enrolment\s*No|नामांकन/i;

// ── Field-specific patterns ─────────────────────────────────────────────────

// Masked Aadhaar: XXXX XXXX 8299 or xxxx xxxx 1234 or full 12-digit
const MASKED_AADHAAR_RE = /(?:X{4}[\s-]?X{4}[\s-]?\d{4})/i;
const FULL_AADHAAR_RE = /(?<!\d)(\d{4}[\s-]\d{4}[\s-]\d{4}|\d{12})(?!\d)/;

// DOB with label: English or Hindi
const DOB_LABEL_RE =
  /(?:जन्म\s*(?:तिथि|￸त￱थ)?|Date\s*of\s*Birth|DOB|D\.?\s?O\.?\s?B\.?)\s*[:/]?\s*(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})/i;

// Gender
const GENDER_EN_RE = /\b(MALE|FEMALE|TRANSGENDER)\b/i;
const GENDER_HI_RE = /(?:पुरुष|पु\s*ष|महिला|ट्रांसजेंडर)/;

// Father/Guardian (C/O pattern from DigiLocker)
const CARE_OF_RE = /(?:C\/O|S\/O|D\/O|W\/O|Care\s*of)\s+(.+)/i;
const FATHER_LABEL_RE = /(?:Father(?:'s)?\s*Name|पिता(?:\s*का\s*नाम)?)\s*:?\s*(.+)/i;

// Address
const ADDRESS_EN_LABEL_RE = /^Address\s*:\s*(.*)/im;
const ADDRESS_HI_LABEL_RE = /^पता\s*(?:पता)?\s*:?\s*(.*)/im;

// PIN code
const PIN_RE = /\b([1-9]\d{5})\b/;
// District / State
const DISTRICT_RE = /(?:District|Dist|जिला)\s*:?\s*([A-Za-z\s]+)/i;
const STATE_RE = /(?:State|राज्य)\s*:?\s*([A-Za-z\s]+)/i;

// Issue/Download dates
const ISSUE_DATE_RE = /Issue\s*Date\s*:?\s*(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})/i;
const DOWNLOAD_DATE_RE = /Download\s*Date\s*:?\s*(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})/i;

// Enrolment number
const ENROLMENT_RE = /(?:Enrolment\s*No\.?|नामांकन\s*(?:क्रमांक|मांक))\s*:?\s*([\dX\/]+)/i;

// Name detection helpers
const NAME_TOKEN_RE = /\b[A-Z][A-Za-z.'\-]{1,}\b/g;
const NAME_STOP_WORDS =
  /^(government|india|aadhaar|male|female|dob|date|birth|signature|authority|address|of|the|and|name|uidai|enrolment|download|issue|pin|code|district|state|to|po|vtc|unique|identification)$/i;

// Labels that signal the end of an address block
const ADDRESS_STOP_RE =
  /^(XXXX|Download|Issue|Enrolment|नामांकन|Aadhaar|आधार|Note:|--|\d{4}\s+\d{4}\s+\d{4})/i;

export class AadhaarExtractor implements DocumentExtractor {
  readonly name = 'Aadhaar';

  detect(text: string): boolean {
    return AADHAAR_DETECT_RE.test(text);
  }

  extract(text: string, rawOcrConfidence?: number): ExtractionResult {
    const norm = normalize(text);
    const lines = norm.split('\n');
    const fields: Record<string, FieldResult> = {};
    const conf = rawOcrConfidence ?? 90;

    // ── Masked/Full Aadhaar ─────────────────────────────────────────────
    const maskedMatch = norm.match(MASKED_AADHAAR_RE);
    const fullMatch = norm.match(FULL_AADHAAR_RE);
    if (maskedMatch) {
      fields.extractedAadhaar = {
        value: maskedMatch[0].replace(/[\s-]/g, ' ').trim(),
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'regex',
      };
    } else if (fullMatch) {
      // Mask for display safety: show only last 4 digits
      const raw = fullMatch[0].replace(/[\s-]/g, '');
      const masked = `XXXX XXXX ${raw.slice(-4)}`;
      fields.extractedAadhaar = {
        value: masked,
        confidence: fieldConfidence({ labelMatched: false, formatValid: raw.length === 12, rawConfidence: conf }),
        source: 'regex',
      };
    }

    // ── DOB ─────────────────────────────────────────────────────────────
    const dobMatch = norm.match(DOB_LABEL_RE);
    if (dobMatch?.[1]) {
      const dob = dobMatch[1];
      fields.extractedDob = {
        value: dob,
        confidence: fieldConfidence({ labelMatched: true, formatValid: validateDob(dob), rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Gender ──────────────────────────────────────────────────────────
    const genderEnMatch = norm.match(GENDER_EN_RE);
    const genderHiMatch = norm.match(GENDER_HI_RE);
    if (genderEnMatch) {
      fields.extractedGender = {
        value: genderEnMatch[1]!.toUpperCase(),
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    } else if (genderHiMatch) {
      const hindi = genderHiMatch[0];
      const mapped = /पुरुष|पु\s*ष/.test(hindi) ? 'MALE' : /महिला/.test(hindi) ? 'FEMALE' : 'TRANSGENDER';
      fields.extractedGender = {
        value: mapped,
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Name (positional: English name line above DOB) ──────────────────
    const dobLineIdx = lines.findIndex((l) => DOB_LABEL_RE.test(l));
    if (dobLineIdx >= 0) {
      for (let i = dobLineIdx - 1; i >= 0 && i >= dobLineIdx - 5; i--) {
        const line = (lines[i] ?? '').trim();
        if (!line || DEVANAGARI_RE.test(line)) continue;
        // Skip label prefixes
        const cleaned = line.replace(/^(?:Name|Consumer Name|Full Name)\s*:?\s*/i, '');
        const tokens = (cleaned.match(NAME_TOKEN_RE) ?? []).filter((t) => !NAME_STOP_WORDS.test(t));
        if (tokens.length >= 1) {
          const name = tokens.join(' ').trim();
          if (name.length >= 3) {
            fields.extractedName = {
              value: tidy(name),
              confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
              source: 'positional',
            };
            break;
          }
        }
      }
    }
    // Fallback: label-based name (Name : X)
    if (!fields.extractedName) {
      for (const line of lines) {
        const trimmed = line.trim();
        if (/(?:father|mother|guardian|spouse|husband|wife|S\/W\/D)/i.test(trimmed)) continue;
        const match = trimmed.match(
          /^(?:Name|Consumer Name|Full Name)\s*:?\s*([A-Z][A-Z .'\-]{2,})$/i,
        );
        if (match?.[1]) {
          fields.extractedName = {
            value: tidy(match[1]),
            confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
            source: 'label',
          };
          break;
        }
      }
    }

    // ── Father/Guardian Name ────────────────────────────────────────────
    for (const line of lines) {
      const careOfMatch = line.match(CARE_OF_RE);
      if (careOfMatch?.[1]) {
        fields.extractedFatherName = {
          value: tidy(careOfMatch[1]),
          confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
          source: 'label',
        };
        break;
      }
      const fatherMatch = line.match(FATHER_LABEL_RE);
      if (fatherMatch?.[1]) {
        fields.extractedFatherName = {
          value: tidy(fatherMatch[1]),
          confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
          source: 'label',
        };
        break;
      }
    }

    // ── Address (multi-line) ────────────────────────────────────────────
    for (let i = 0; i < lines.length; i++) {
      const enMatch = lines[i]?.match(ADDRESS_EN_LABEL_RE);
      const hiMatch = lines[i]?.match(ADDRESS_HI_LABEL_RE);
      if (enMatch || hiMatch) {
        const firstPart = (enMatch?.[1] ?? hiMatch?.[1] ?? '').trim();
        const addr = multiLineLabelValue(lines, i, firstPart, ADDRESS_STOP_RE);
        if (addr.length >= 10) {
          fields.extractedAddress = {
            value: addr,
            confidence: fieldConfidence({ labelMatched: true, formatValid: addr.length >= 15, rawConfidence: conf }),
            source: 'label',
          };
          break;
        }
      }
    }

    // ── PIN Code ────────────────────────────────────────────────────────
    // Prefer labeled PIN (e.g. "PIN Code: 226017")
    const pinLabelMatch = norm.match(/(?:PIN\s*Code|पिन\s*कोड)\s*:?\s*(\d{6})/i);
    if (pinLabelMatch?.[1] && validatePin(pinLabelMatch[1])) {
      fields.extractedPinCode = {
        value: pinLabelMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    } else {
      // Fallback: last 6-digit number in address area
      const addrText = fields.extractedAddress?.value ?? '';
      const pinFallback = addrText.match(/\b(\d{6})\b/);
      if (pinFallback?.[1] && validatePin(pinFallback[1])) {
        fields.extractedPinCode = {
          value: pinFallback[1],
          confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
          source: 'regex',
        };
      }
    }

    // ── District ────────────────────────────────────────────────────────
    const distMatch = norm.match(DISTRICT_RE);
    if (distMatch?.[1]) {
      const cleaned = distMatch[1].split('\n')[0]?.trim() ?? '';
      fields.extractedDistrict = {
        value: tidy(cleaned),
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── State ───────────────────────────────────────────────────────────
    const stateMatch = norm.match(STATE_RE);
    if (stateMatch?.[1]) {
      const cleaned = stateMatch[1].split('\n')[0]?.trim() ?? '';
      fields.extractedState = {
        value: tidy(cleaned),
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Issue Date / Download Date ──────────────────────────────────────
    const issueMatch = norm.match(ISSUE_DATE_RE);
    if (issueMatch?.[1]) {
      fields.extractedIssueDate = {
        value: issueMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }
    const dlMatch = norm.match(DOWNLOAD_DATE_RE);
    if (dlMatch?.[1]) {
      fields.extractedDownloadDate = {
        value: dlMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Enrolment Number ────────────────────────────────────────────────
    const enrolMatch = norm.match(ENROLMENT_RE);
    if (enrolMatch?.[1]) {
      fields.extractedEnrolmentNumber = {
        value: enrolMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    return buildResult('AADHAAR', fields);
  }
}

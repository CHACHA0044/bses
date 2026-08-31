/**
 * PAN card extractor.
 *
 * Extracts: PAN number, name, father's name, DOB.
 * Supports both label-based ("Name : X") and positional extraction
 * (bare uppercase lines between INCOME TAX header and PAN number row).
 */

import {
  DocumentExtractor,
  ExtractionResult,
  FieldResult,
  normalize,
  tidy,
  validateDob,
  fieldConfidence,
  buildResult,
} from './base.extractor';

// ── Detection ───────────────────────────────────────────────────────────────

const PAN_DETECT_RE =
  /INCOME\s*TAX\s*DEPARTMENT|Permanent\s*Account\s*Number|PAN\s*(?:Card|Number|No)/i;

// ── Field-specific patterns ─────────────────────────────────────────────────

const PAN_RE = /\b([A-Z]{5}\d{4}[A-Z])\b/;
const DOB_RE =
  /(?:Date\s*of\s*Birth|DOB|D\.?\s?O\.?\s?B\.?)\s*:?\s*(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})/i;
const NAME_RE =
  /^(?:Name|Consumer Name|Full Name)\s*:?\s*([A-Z][A-Z .'\-]{2,})$/im;
const FATHER_RE =
  /(?:Father(?:'s?)?\s*Name|F\/Name)\s*:?\s*([A-Z][A-Z .'\-]{2,})/i;

// Positional: INCOME TAX header → bare uppercase name lines → PAN number
const PAN_HEADER_RE = /INCOME\s*TAX\s*DEPARTMENT|GOVT\.?\s*OF\s*INDIA/i;
const PAN_ACCOUNT_RE = /Permanen?t?\s*Account\s*Number/i;
const PAN_NAME_TOKEN_RE = /\b[A-Z]{2,}\b/g;
const NAME_STOP_WORDS =
  /^(GOVERNMENT|INDIA|INCOME|TAX|DEPARTMENT|PERMANENT|ACCOUNT|NUMBER|SIGNATURE|DATE|BIRTH|OF|THE|AND|CARD|AADHAAR)$/i;

export class PanExtractor implements DocumentExtractor {
  readonly name = 'PAN';

  detect(text: string): boolean {
    return PAN_DETECT_RE.test(text) && PAN_RE.test(text);
  }

  extract(text: string, rawOcrConfidence?: number): ExtractionResult {
    const norm = normalize(text);
    const lines = norm.split('\n');
    const fields: Record<string, FieldResult> = {};
    const conf = rawOcrConfidence ?? 90;

    // ── PAN Number ──────────────────────────────────────────────────────
    const panMatch = norm.match(PAN_RE);
    if (panMatch?.[1]) {
      fields.extractedPan = {
        value: panMatch[1],
        confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
        source: 'regex',
      };
    }

    // ── DOB ─────────────────────────────────────────────────────────────
    const dobMatch = norm.match(DOB_RE);
    if (dobMatch?.[1]) {
      fields.extractedDob = {
        value: dobMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: validateDob(dobMatch[1]), rawConfidence: conf }),
        source: 'label',
      };
    } else {
      // Fallback: match any DD/MM/YYYY or DD-MM-YYYY plausible DOB date
      const dateMatch = norm.match(/\b(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})\b/);
      if (dateMatch?.[1] && validateDob(dateMatch[1])) {
        fields.extractedDob = {
          value: dateMatch[1],
          confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
          source: 'regex',
        };
      }
    }

    // ── Name (label-based) ──────────────────────────────────────────────
    const nameMatch = norm.match(NAME_RE);
    if (nameMatch?.[1]) {
      fields.extractedName = {
        value: tidy(nameMatch[1]),
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Father's Name (label-based) ─────────────────────────────────────
    const fatherMatch = norm.match(FATHER_RE);
    if (fatherMatch?.[1]) {
      fields.extractedFatherName = {
        value: tidy(fatherMatch[1]),
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Positional name extraction (bare uppercase lines between headers)
    if (!fields.extractedName || !fields.extractedFatherName) {
      const headerIdx = lines.findIndex((l) => PAN_HEADER_RE.test(l));
      const accountIdx = lines.findIndex(
        (l, i) => i > headerIdx && PAN_ACCOUNT_RE.test(l),
      );
      if (headerIdx >= 0) {
        const end = accountIdx >= 0 ? accountIdx : lines.length;
        const positionalNames: string[] = [];
        for (let i = headerIdx + 1; i < end; i++) {
          const line = (lines[i] ?? '').trim();
          const tokens = (line.match(PAN_NAME_TOKEN_RE) ?? []).filter(
            (t) => t.length >= 3 && /[AEIOU]/.test(t) && !NAME_STOP_WORDS.test(t),
          );
          if (tokens.length > 0) {
            positionalNames.push(tokens.join(' '));
            if (positionalNames.length === 2) break;
          }
        }
        if (!fields.extractedName && positionalNames[0]) {
          fields.extractedName = {
            value: positionalNames[0],
            confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
            source: 'positional',
          };
        }
        if (!fields.extractedFatherName && positionalNames[1]) {
          fields.extractedFatherName = {
            value: positionalNames[1],
            confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
            source: 'positional',
          };
        }
      }
    }

    return buildResult('PAN', fields);
  }
}

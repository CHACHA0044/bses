/**
 * Generic / fallback document extractor.
 *
 * Used for utility bills, affidavits, ownership proofs, and any document
 * that none of the specialized extractors detect. Extracts whatever
 * structured fields it can find via label-matching and regex.
 */

import {
  DocumentExtractor,
  ExtractionResult,
  FieldResult,
  normalize,
  tidy,
  validateDob,
  validatePin,
  fieldConfidence,
  buildResult,
  multiLineLabelValue,
} from './base.extractor';

const NAME_RE =
  /^(?:Name|Consumer Name|Applicant Name|Full Name|Customer Name)\s*:?\s*([A-Z][A-Z .'\-]{2,})$/im;
const DOB_RE =
  /(?:Date\s*of\s*Birth|DOB)\s*:?\s*(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})/i;
const ADDRESS_RE =
  /(?:Address|Residential Address|Permanent Address|Correspondence Address)\s*:?\s*(.+)/i;
const AADHAAR_RE = /(?<!\d)(\d{4}[\s-]\d{4}[\s-]\d{4}|\d{12})(?!\d)/;
const PAN_RE = /\b([A-Z]{5}\d{4}[A-Z])\b/;
const LICENCE_RE = /\b([A-Z]{2}[\s\-]?\d{2}[\s\-]?\d{4}[\s\-]?\d{5,7})\b/;
const VALIDITY_RE =
  /(?:Valid\s*(?:Till|Up\s*To|Upto|To)\s*:?\s*)(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})/i;

const ADDR_STOP_RE = /^(Note:|Download|Issue|Name|DOB|--)/i;

export class GenericIdExtractor implements DocumentExtractor {
  readonly name = 'GenericID';

  /** Always matches as the fallback. */
  detect(_text: string): boolean {
    return true;
  }

  extract(text: string, rawOcrConfidence?: number): ExtractionResult {
    const norm = normalize(text);
    const lines = norm.split('\n');
    const fields: Record<string, FieldResult> = {};
    const conf = rawOcrConfidence ?? 80;

    // Name
    const nameMatch = norm.match(NAME_RE);
    if (nameMatch?.[1]) {
      fields.extractedName = {
        value: tidy(nameMatch[1]),
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    // DOB
    const dobMatch = norm.match(DOB_RE);
    if (dobMatch?.[1]) {
      fields.extractedDob = {
        value: dobMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: validateDob(dobMatch[1]), rawConfidence: conf }),
        source: 'label',
      };
    }

    // Address (multi-line)
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i]?.match(ADDRESS_RE);
      if (match) {
        const addr = multiLineLabelValue(lines, i, match[1] ?? '', ADDR_STOP_RE);
        if (addr.length >= 10) {
          fields.extractedAddress = {
            value: addr,
            confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
            source: 'label',
          };
          const pinMatch = addr.match(/\b(\d{6})\b/);
          if (pinMatch?.[1] && validatePin(pinMatch[1])) {
            fields.extractedPinCode = {
              value: pinMatch[1],
              confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
              source: 'regex',
            };
          }
          break;
        }
      }
    }

    // Aadhaar number
    const aadhaarMatch = norm.match(AADHAAR_RE);
    if (aadhaarMatch?.[1]) {
      fields.extractedAadhaar = {
        value: aadhaarMatch[1].replace(/[\s-]/g, ' ').trim(),
        confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
        source: 'regex',
      };
    }

    // PAN
    const panMatch = norm.match(PAN_RE);
    if (panMatch?.[1]) {
      fields.extractedPan = {
        value: panMatch[1],
        confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
        source: 'regex',
      };
    }

    // Driving licence number
    const licMatch = norm.match(LICENCE_RE);
    if (licMatch?.[1]) {
      fields.extractedLicenseNumber = {
        value: tidy(licMatch[1]),
        confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
        source: 'regex',
      };
    }

    // Validity
    const validityMatch = norm.match(VALIDITY_RE);
    if (validityMatch?.[1]) {
      fields.extractedValidity = {
        value: validityMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    return buildResult('GENERIC', fields);
  }
}

/**
 * Driving Licence / DL extractor.
 *
 * Handles:
 *   - DigiLocker DL PDFs (native text, tab-separated label:value)
 *   - Scanned/photographed physical DL cards (OCR text)
 *
 * Extracts: licence number, name, DOB, father/spouse/guardian (S/W/D),
 * issuing authority, issue date, expiry date, authorization classes,
 * blood group, present address, permanent address.
 */

import {
  DocumentExtractor,
  ExtractionResult,
  FieldResult,
  normalize,
  tidy,
  validateDob,
  validateDocDate,
  validatePin,
  fieldConfidence,
  buildResult,
  multiLineLabelValue,
} from './base.extractor';

// ── Detection ───────────────────────────────────────────────────────────────

const DL_DETECT_RE =
  /Driving\s*Licen[sc]e|License\s*No|Licence\s*No|DL\s*No|Issuing\s*Authority|Authorization\s*to\s*Drive/i;

// ── Field-specific patterns ─────────────────────────────────────────────────

// Licence number: state code (2 letters) + district (2 digits) + year (4) + serial (5-7)
// e.g. UP32 20220046117, DL-09-2024-1234567, KA03 20070012345
const LICENCE_NUM_RE =
  /(?:Licen[sc]e\s*No\.?\s*|DL\s*No\.?\s*)[:\t\s]*([A-Z]{2}[\s\-]?\d{2}[\s\-]?\d{4,}[\s\-]?\d{3,7})/i;
const LICENCE_NUM_BARE_RE =
  /\b([A-Z]{2}[\s\-]?\d{2}[\s\-]?\d{4}[\s\-]?\d{5,7})\b/;

// Name
const NAME_RE = /(?:Name)\s*[:\t]+\s*(.+)/i;

// DOB
const DOB_RE =
  /(?:DOB|Date\s*of\s*Birth|D\.?\s?O\.?\s?B\.?)\s*[:\t]+\s*(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})/i;

// Father/Spouse/Guardian: S/W/D label
const SWD_RE = /(?:S\/?W\/?D|Son|Wife|Daughter|Father(?:'?s?\s*Name)?|Guardian)\s*[:\t]+\s*(.+)/i;

// Issuing Authority
const AUTHORITY_RE = /(?:Issuing\s*Authority)\s*[:\t]+\s*(.+)/i;

// Date of Issue
const ISSUE_DATE_RE =
  /(?:Date\s*of\s*Issue|Issue\s*Date)\s*[:\t]+\s*(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})/i;

// Date of Expiry / Validity
const EXPIRY_DATE_RE =
  /(?:Date\s*of\s*Expiry|Expiry\s*Date|Valid\s*(?:Till|Up\s*To|Upto|To))\s*[:\t]+\s*(\d{2}[/\-\.]\d{2}[/\-\.]\d{4})/i;

// Authorization to Drive
const AUTH_DRIVE_RE =
  /(?:Authorization\s*to\s*Drive|Class\s*of\s*Vehicle|Authorized\s*to\s*Drive|COV\s*Category)\s*[:\t]+\s*(.+?)(?:\t|$)/i;

// Blood Group
const BLOOD_RE =
  /(?:Blood\s*Group)\s*[:\t]+\s*([A-Za-z0-9+\-]+)/i;

// Present Address
const PRESENT_ADDR_RE = /(?:Present\s*Address)\s*[:\t]+\s*(.*)/i;
// Permanent Address
const PERM_ADDR_RE = /(?:Permanent\s*Address)\s*[:\t]*\s*(.*)/i;

// Labels that stop address continuation
const ADDR_STOP_RE =
  /^(Note:|Powered|This|Digital|Download|Issuing|Authorization|Licen[sc]e|Date\s*of|DOB|Blood|S\/W\/D|Name|--)/i;

export class DrivingLicenseExtractor implements DocumentExtractor {
  readonly name = 'DrivingLicense';

  detect(text: string): boolean {
    return DL_DETECT_RE.test(text);
  }

  extract(text: string, rawOcrConfidence?: number): ExtractionResult {
    const norm = normalize(text);
    const lines = norm.split('\n');
    const fields: Record<string, FieldResult> = {};
    const conf = rawOcrConfidence ?? 90;

    // ── Licence Number ──────────────────────────────────────────────────
    const licMatch = norm.match(LICENCE_NUM_RE);
    if (licMatch?.[1]) {
      const num = tidy(licMatch[1]);
      fields.extractedLicenseNumber = {
        value: num,
        confidence: fieldConfidence({ labelMatched: true, formatValid: num.length >= 10, rawConfidence: conf }),
        source: 'label',
      };
    } else {
      const bareMatch = norm.match(LICENCE_NUM_BARE_RE);
      if (bareMatch?.[1]) {
        fields.extractedLicenseNumber = {
          value: tidy(bareMatch[1]),
          confidence: fieldConfidence({ labelMatched: false, formatValid: true, rawConfidence: conf }),
          source: 'regex',
        };
      }
    }

    // ── Name ────────────────────────────────────────────────────────────
    const nameMatch = norm.match(NAME_RE);
    if (nameMatch?.[1]) {
      // Clean trailing tab-separated fields that might appear on same line
      const cleaned = nameMatch[1].split('\t')[0]?.trim() ?? '';
      if (cleaned.length >= 2) {
        fields.extractedName = {
          value: tidy(cleaned),
          confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
          source: 'label',
        };
      }
    }

    // ── DOB ─────────────────────────────────────────────────────────────
    const dobMatch = norm.match(DOB_RE);
    if (dobMatch?.[1]) {
      fields.extractedDob = {
        value: dobMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: validateDob(dobMatch[1]), rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── S/W/D (Father/Spouse/Guardian) ──────────────────────────────────
    const swdMatch = norm.match(SWD_RE);
    if (swdMatch?.[1]) {
      const cleaned = swdMatch[1].split('\t')[0]?.trim() ?? '';
      if (cleaned.length >= 2) {
        fields.extractedFatherName = {
          value: tidy(cleaned),
          confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
          source: 'label',
        };
      }
    }

    // ── Issuing Authority ───────────────────────────────────────────────
    const authMatch = norm.match(AUTHORITY_RE);
    if (authMatch?.[1]) {
      fields.extractedIssuingAuthority = {
        value: tidy(authMatch[1]),
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Date of Issue ───────────────────────────────────────────────────
    const issueMatch = norm.match(ISSUE_DATE_RE);
    if (issueMatch?.[1]) {
      fields.extractedIssueDate = {
        value: issueMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: validateDocDate(issueMatch[1]), rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Date of Expiry / Validity ───────────────────────────────────────
    const expiryMatch = norm.match(EXPIRY_DATE_RE);
    if (expiryMatch?.[1]) {
      fields.extractedValidity = {
        value: expiryMatch[1],
        confidence: fieldConfidence({ labelMatched: true, formatValid: validateDocDate(expiryMatch[1]), rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Authorization to Drive ──────────────────────────────────────────
    const authDriveMatch = norm.match(AUTH_DRIVE_RE);
    if (authDriveMatch?.[1]) {
      // Strip any trailing date fields that might be on the same tab line
      const cleaned = authDriveMatch[1].replace(/Date\s*of\s*(Issue|Expiry)\s*:.*$/i, '').trim();
      if (cleaned.length >= 2) {
        fields.extractedAuthorizationToDrive = {
          value: tidy(cleaned),
          confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
          source: 'label',
        };
      }
    }

    // ── Blood Group ─────────────────────────────────────────────────────
    const bloodMatch = norm.match(BLOOD_RE);
    if (bloodMatch?.[1] && bloodMatch[1].toLowerCase() !== 'unknown') {
      fields.extractedBloodGroup = {
        value: bloodMatch[1].toUpperCase(),
        confidence: fieldConfidence({ labelMatched: true, formatValid: true, rawConfidence: conf }),
        source: 'label',
      };
    }

    // ── Present Address (multi-line) ────────────────────────────────────
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i]?.match(PRESENT_ADDR_RE);
      if (match) {
        const firstPart = (match[1] ?? '').trim();
        const addr = multiLineLabelValue(lines, i, firstPart, ADDR_STOP_RE);
        if (addr.length >= 5) {
          fields.extractedAddress = {
            value: addr,
            confidence: fieldConfidence({ labelMatched: true, formatValid: addr.length >= 10, rawConfidence: conf }),
            source: 'label',
          };

          // Extract PIN from present address
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

    // ── Permanent Address (multi-line) ──────────────────────────────────
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i]?.match(PERM_ADDR_RE);
      if (match) {
        const firstPart = (match[1] ?? '').trim();
        // "Permanent\nAddress\n: ..." is a common split in DigiLocker PDFs
        let addr = multiLineLabelValue(lines, i, firstPart, ADDR_STOP_RE);
        if (addr.length >= 5) {
          fields.extractedPermanentAddress = {
            value: addr,
            confidence: fieldConfidence({ labelMatched: true, formatValid: addr.length >= 10, rawConfidence: conf }),
            source: 'label',
          };
          break;
        }
      }
    }

    // ── Cross-field validation ──────────────────────────────────────────
    // If issue and expiry dates are both present, expiry should be after issue
    if (fields.extractedIssueDate && fields.extractedValidity) {
      const issueYear = parseInt(fields.extractedIssueDate.value.split(/[/\-.]/).pop() ?? '0');
      const expiryYear = parseInt(fields.extractedValidity.value.split(/[/\-.]/).pop() ?? '0');
      if (expiryYear < issueYear) {
        fields.extractedValidity.confidence = Math.max(10, fields.extractedValidity.confidence - 30);
      }
    }

    return buildResult('DRIVING_LICENSE', fields);
  }
}

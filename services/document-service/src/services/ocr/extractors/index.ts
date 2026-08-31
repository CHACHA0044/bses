/**
 * Extractor registry — routes incoming OCR text through the priority-ordered
 * list of document-type extractors and converts the result into the existing
 * `ExtractedData` shape consumed by `ocr.service.ts` and the rest of the stack.
 *
 * Priority:
 *   1. AadhaarExtractor (if text looks like Aadhaar)
 *   2. DrivingLicenseExtractor (if text looks like a DL)
 *   3. PanExtractor (if text looks like PAN)
 *   4. GenericIdExtractor (always matches — fallback)
 */

import { DocumentType } from '@prisma/client';
import { AadhaarExtractor } from './aadhaar.extractor';
import { DrivingLicenseExtractor } from './driving-license.extractor';
import { PanExtractor } from './pan.extractor';
import { GenericIdExtractor } from './generic-id.extractor';
import type { DocumentExtractor, ExtractionResult, FieldResult } from './base.extractor';
import type { ExtractedData } from '../extractors';

// ── Registry ────────────────────────────────────────────────────────────────

const extractors: DocumentExtractor[] = [
  new AadhaarExtractor(),
  new DrivingLicenseExtractor(),
  new PanExtractor(),
  new GenericIdExtractor(), // always last — matches everything
];

/**
 * Selects the first extractor whose `detect()` matches and runs extraction.
 * Falls back to GenericIdExtractor (which always matches).
 */
export const runModularExtraction = (
  text: string,
  docType: DocumentType,
  rawOcrConfidence?: number,
): ExtractionResult => {
  // Prefer the extractor that matches the document type hint when possible
  const typeHint = DOC_TYPE_MAP[docType];
  if (typeHint) {
    const preferred = extractors.find((e) => e.name === typeHint && e.detect(text));
    if (preferred) return preferred.extract(text, rawOcrConfidence);
  }

  // Auto-detect: try each extractor in priority order
  for (const extractor of extractors) {
    if (extractor.detect(text)) {
      return extractor.extract(text, rawOcrConfidence);
    }
  }

  // Should never reach here (GenericIdExtractor always matches)
  return extractors[extractors.length - 1]!.extract(text, rawOcrConfidence);
};

/** Maps Prisma DocumentType to preferred extractor name. */
const DOC_TYPE_MAP: Partial<Record<DocumentType, string>> = {
  AADHAAR_CARD: 'Aadhaar',
  PAN_CARD: 'PAN',
  ADDRESS_PROOF: 'DrivingLicense',
};

// ── Conversion bridge ───────────────────────────────────────────────────────

/**
 * Converts a modular `ExtractionResult` back into the legacy `ExtractedData`
 * shape that `ocr.service.ts` and the Prisma persistence layer consume.
 *
 * The new extractors produce richer per-field data (confidence, source),
 * which is preserved in `fieldConfidences` and `fieldSources` for the
 * database. The flat `extracted*` string fields are filled for backward
 * compatibility with the existing encrypted persistence columns.
 */
export const toExtractedData = (result: ExtractionResult): ExtractedData & {
  fieldConfidences: Record<string, number>;
} => {
  const f = (key: string): string => result.fields[key]?.value ?? '';
  const sources: Record<string, 'qr' | 'ocr'> = {};
  const confidences: Record<string, number> = {};
  for (const [key, field] of Object.entries(result.fields)) {
    if (field.value) {
      sources[key] = field.source === 'qr' ? 'qr' : 'ocr';
      confidences[key] = field.confidence;
    }
  }

  return {
    extractedAadhaar: f('extractedAadhaar'),
    extractedPan: f('extractedPan'),
    extractedName: f('extractedName'),
    extractedDob: f('extractedDob'),
    extractedFatherName: f('extractedFatherName'),
    extractedLicenseNumber: f('extractedLicenseNumber'),
    extractedAddress: f('extractedAddress'),
    extractedValidity: f('extractedValidity'),
    extractedGender: f('extractedGender'),
    extractedYearOfBirth: f('extractedYearOfBirth'),

    // New expanded fields
    extractedPinCode: f('extractedPinCode'),
    extractedState: f('extractedState'),
    extractedDistrict: f('extractedDistrict'),
    extractedIssueDate: f('extractedIssueDate'),
    extractedExpiryDate: f('extractedValidity') || f('extractedExpiryDate'),
    extractedIssuingAuthority: f('extractedIssuingAuthority'),
    extractedBloodGroup: f('extractedBloodGroup'),
    extractedAuthorizationToDrive: f('extractedAuthorizationToDrive'),
    extractedPermanentAddress: f('extractedPermanentAddress'),
    extractedDownloadDate: f('extractedDownloadDate'),
    extractedEnrolmentNumber: f('extractedEnrolmentNumber'),

    fieldSources: sources,
    fieldConfidences: confidences,
    isUnreadable: result.isUnreadable,
    needsReview: result.needsReview,
    lowConfidenceFields: result.lowConfidenceFields,
  };
};

// Re-export for convenience
export type { DocumentExtractor, ExtractionResult, FieldResult } from './base.extractor';
export { AadhaarExtractor } from './aadhaar.extractor';
export { DrivingLicenseExtractor } from './driving-license.extractor';
export { PanExtractor } from './pan.extractor';
export { GenericIdExtractor } from './generic-id.extractor';

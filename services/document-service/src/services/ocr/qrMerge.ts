import { DocumentType } from '@prisma/client';
import { ExtractedData, EXTRACTED_FIELD_KEYS, EXPECTED_FIELD_KEYS } from './extractors';

/**
 * QR-first, OCR-fallback merge (generic across document types).
 *
 * A decoded QR payload is authoritative, deterministic data straight from the
 * issuer's own encoding — so when both sources produce a value for the same
 * field the QR value wins and the OCR value is dropped (a garbled OCR read can
 * never override a clean QR read). Fields the QR does not provide fall back to
 * OCR exactly as before. Every field's provenance is recorded in
 * `fieldSources` so the decision is auditable/debuggable per field.
 */

/** All modeled extraction keys that can be tracked by source. */
export const TRACKED_FIELD_KEYS = [
  ...EXTRACTED_FIELD_KEYS,
  'extractedGender',
  'extractedYearOfBirth',
] as const;

export type FieldSource = 'qr' | 'ocr';

export interface MergedExtraction extends ExtractedData {
  fieldSources: Record<string, FieldSource>;
}

export interface MergeInput {
  qr?: ExtractedData | null | undefined;
  ocr?: ExtractedData | null | undefined;
  docType: DocumentType;
}

/**
 * Merges a (possibly null) QR extraction with the OCR extraction.
 *
 * - `qr === null/empty` → the pure-OCR result, every present field sourced
 *   `'ocr'`, OCR's needsReview/lowConfidence kept intact.
 * - QR present → QR wins on conflicts; OCR fills gaps. `needsReview` is
 *   cleared when the QR covers every expected field for the document type;
 *   otherwise OCR's assessment survives (minus any field the QR now supplies).
 */
export const mergeQrAndOcr = (input: MergeInput): MergedExtraction => {
  const qrFields: Partial<ExtractedData> = input.qr ?? {};
  const ocrFields: Partial<ExtractedData> = input.ocr ?? {};

  const sources: Record<string, FieldSource> = {};
  const merged: ExtractedData = {
    isUnreadable: false,
    lowConfidenceFields: [],
    needsReview: false,
    fieldSources: sources,
  };

  for (const key of TRACKED_FIELD_KEYS) {
    const qv = qrFields[key];
    const ov = ocrFields[key];
    if (qv) {
      merged[key] = qv;
      sources[key] = 'qr';
    } else if (ov) {
      merged[key] = ov;
      sources[key] = 'ocr';
    }
  }

  const qrHasFields = TRACKED_FIELD_KEYS.some((k) => !!qrFields[k]);
  const qrCoversExpected = EXPECTED_FIELD_KEYS[input.docType].every((k) => !!qrFields[k]);

  if (!qrHasFields) {
    // Plain OCR path — keep the OCR assessment verbatim.
    merged.isUnreadable = ocrFields.isUnreadable ?? true;
    merged.needsReview = ocrFields.needsReview ?? false;
    merged.lowConfidenceFields = ocrFields.lowConfidenceFields ?? [];
    return merged as MergedExtraction;
  }

  merged.isUnreadable = !TRACKED_FIELD_KEYS.some((k) => !!merged[k]);

  if (qrCoversExpected) {
    // QR is authoritative and complete — nothing to review.
    merged.needsReview = false;
    merged.lowConfidenceFields = [];
  } else if (ocrFields.isUnreadable) {
    // Partial QR read, OCR gave nothing usable — needs manual review.
    merged.needsReview = true;
    merged.lowConfidenceFields = (ocrFields.lowConfidenceFields ?? []).filter((k) => !qrFields[k as keyof ExtractedData]);
  } else {
    merged.needsReview = ocrFields.needsReview ?? false;
    merged.lowConfidenceFields = (ocrFields.lowConfidenceFields ?? []).filter((k) => !qrFields[k as keyof ExtractedData]);
  }

  return merged as MergedExtraction;
};

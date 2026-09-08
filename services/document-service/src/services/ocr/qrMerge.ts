import { DocumentType } from '@prisma/client';
import { ExtractedData, EXTRACTED_FIELD_KEYS, EXPECTED_FIELD_KEYS } from './extractors';

/**
 * QR-first, OCR-fallback merge (generic across document types).
 *
 * TRUST MODEL (security-critical):
 *  - A CRYPTOGRAPHICALLY VERIFIED QR payload (`qrTrusted: true`) is
 *    authoritative issuer data — it wins every conflict with OCR.
 *  - An UNVERIFIED QR (decoded but not signature-verified, or a format that
 *    cannot be verified) is NOT authoritative. On conflict the value OCR read
 *    from the actual document image wins, and the disagreement is surfaced by
 *    the decision engine (QR_OCR_CONFLICT risk). An unverified QR may still
 *    FILL GAPS the OCR could not read, but never overrides it.
 *
 * Every field's provenance is recorded in `fieldSources` so the decision is
 * auditable/debuggable per field.
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
  /**
   * True ONLY when the QR payload passed cryptographic signature verification
   * (`verifyQrSignature` → SIGNED_VERIFIED). Omitted/false means unverified:
   * the QR may fill OCR gaps but never wins a conflict.
   */
  qrTrusted?: boolean;
}

/**
 * Merges a (possibly null) QR extraction with the OCR extraction.
 *
 * - `qr === null/empty` → the pure-OCR result, every present field sourced
 *   `'ocr'`, OCR's needsReview/lowConfidence kept intact.
 * - Verified QR → QR wins on conflicts; OCR fills gaps. `needsReview` is
 *   cleared when the QR covers every expected field for the document type.
 * - Unverified QR → OCR wins on conflicts (see trust model above); QR fills
 *   gaps; OCR's review assessment survives even when the QR "looks complete".
 */
export const mergeQrAndOcr = (input: MergeInput): MergedExtraction => {
  const qrFields: Partial<ExtractedData> = input.qr ?? {};
  const ocrFields: Partial<ExtractedData> = input.ocr ?? {};
  const qrTrusted = input.qrTrusted === true;

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
      if (ov && ov !== qv && !qrTrusted) {
        // Unverified QR conflicts with the document image — OCR wins and the
        // disagreement is surfaced downstream by the decision engine.
        merged[key] = ov;
        sources[key] = 'ocr';
      } else {
        merged[key] = qv;
        sources[key] = 'qr';
      }
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
    merged.detectedType = ocrFields.detectedType;
    return merged as MergedExtraction;
  }

  merged.isUnreadable = !TRACKED_FIELD_KEYS.some((k) => !!merged[k]);
  merged.detectedType = ocrFields.detectedType;

  if (qrCoversExpected && qrTrusted) {
    // Verified QR is authoritative and complete — nothing to review.
    merged.needsReview = false;
    merged.lowConfidenceFields = [];
  } else if (ocrFields.isUnreadable) {
    // Partial QR read, OCR gave nothing usable — needs manual review.
    merged.needsReview = true;
    merged.lowConfidenceFields = (ocrFields.lowConfidenceFields ?? []).filter((k) => !qrFields[k as keyof ExtractedData]);
  } else {
    merged.needsReview = ocrFields.needsReview ?? false;
    // Only fields the QR actually WON (value taken from the QR) are resolved
    // by the QR read. Fields where OCR won the conflict keep their
    // low-confidence flag — the OCR value may be garbled and must stay
    // surfaced for review even though the QR "also had something there".
    const qrWon = (k: string) => sources[k] === 'qr';
    merged.lowConfidenceFields = (ocrFields.lowConfidenceFields ?? []).filter((k) => !qrWon(k));
  }

  return merged as MergedExtraction;
};

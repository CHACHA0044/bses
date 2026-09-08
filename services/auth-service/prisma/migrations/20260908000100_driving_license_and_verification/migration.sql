-- DRIVING_LICENSE document type + multi-signal OCR verification metadata.
--
-- Both changes are non-destructive:
--   * DocumentType gains the DRIVING_LICENSE enum value (new DL uploads get a
--     proper type instead of being forced into ADDRESS_PROOF).
--   * documents gains nullable columns that record the QR verification
--     outcome, image-quality gate score, risk score, conflicts and warnings
--     from the multi-signal decision engine.

ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'DRIVING_LICENSE';

ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ocr_qr_status" VARCHAR(30);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ocr_qr_format" VARCHAR(40);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ocr_quality_score" DECIMAL(5, 2);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ocr_risk_score" DECIMAL(5, 2);
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ocr_conflicts" JSONB;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ocr_warnings" JSONB;
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "ocr_detected_source" VARCHAR(30);
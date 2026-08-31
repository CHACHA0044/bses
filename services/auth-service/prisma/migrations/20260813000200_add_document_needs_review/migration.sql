-- Flag documents whose OCR result should not be trusted silently:
-- `needs_review` when confidence was low and/or a field was flagged implausible,
-- `ocr_low_confidence_fields` lists the specific field keys to verify manually.
ALTER TABLE "documents" ADD COLUMN "needs_review" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "ocr_low_confidence_fields" JSONB;

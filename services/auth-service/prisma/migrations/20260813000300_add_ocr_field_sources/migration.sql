-- Per-field extraction provenance (QR vs OCR) so QR-assisted reads are
-- auditable/debuggable per field. Stores a JSONB map like
-- {"extractedName":"qr","extractedDob":"qr","extractedAadhaar":"ocr"}.
ALTER TABLE "documents" ADD COLUMN "ocr_field_sources" JSONB;

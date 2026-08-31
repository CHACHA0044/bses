-- Extend OCR extraction with father's name, driving-licence number, address and
-- validity dates (all stored encrypted, mirroring the existing *Encrypted fields),
-- plus a JSONB set of the field names the consumer has edited/corrected.
ALTER TABLE "documents" ADD COLUMN "extracted_father_name_encrypted" TEXT,
ADD COLUMN "extracted_license_number_encrypted" TEXT,
ADD COLUMN "extracted_address_encrypted" TEXT,
ADD COLUMN "extracted_validity_encrypted" TEXT,
ADD COLUMN "extracted_fields_edited" JSONB;

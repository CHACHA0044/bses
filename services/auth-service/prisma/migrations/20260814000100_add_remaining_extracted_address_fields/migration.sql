-- Add the remaining OCR-extraction columns declared in the Prisma schema but
-- never materialised in the database. The earlier migrations only added a
-- subset of the `extracted_*_encrypted` fields:
--
--   20260813000100_add_ocr_extraction_fields
--       extracted_father_name_encrypted
--       extracted_license_number_encrypted
--       extracted_address_encrypted
--       extracted_validity_encrypted
--       extracted_fields_edited
--
--   20260813000200_add_document_needs_review
--       needs_review
--       ocr_low_confidence_fields
--
--   20260813000300_add_ocr_field_sources
--       ocr_field_sources
--
-- The schema (services/auth-service/prisma/schema.prisma, model Document) also
-- declares the following, which were never migrated. Every query that
-- `include`s `documents` (admin list, admin user-detail, document metadata)
-- throws a 500 because Prisma emits a column that does not exist. All of these
-- are optional TEXT columns mirroring the existing `extracted_*_encrypted`
-- fields, so they are nullable and safe to add with no data migration.
ALTER TABLE "documents"
  ADD COLUMN "extracted_pin_code_encrypted"         TEXT,
  ADD COLUMN "extracted_state_encrypted"            TEXT,
  ADD COLUMN "extracted_district_encrypted"         TEXT,
  ADD COLUMN "extracted_issue_date_encrypted"       TEXT,
  ADD COLUMN "extracted_expiry_date_encrypted"      TEXT,
  ADD COLUMN "extracted_issuing_authority_encrypted" TEXT,
  ADD COLUMN "extracted_blood_group_encrypted"      TEXT,
  ADD COLUMN "extracted_authorization_encrypted"    TEXT,
  ADD COLUMN "extracted_permanent_addr_encrypted"   TEXT;

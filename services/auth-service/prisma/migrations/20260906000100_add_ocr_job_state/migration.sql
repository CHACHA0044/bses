-- Durable OCR job state.
--
-- Turns the document-service's in-memory-only `setTimeout` OCR dispatch into a
-- database-backed, restart-safe job. The database row is the source of truth:
-- PENDING/PROCESSING rows that never reached a terminal state are re-queued by
-- the boot-time recovery sweep; retries are bounded by `ocr_attempts` (see
-- OCR_MAX_ATTEMPTS env) and infrastructure failures are recorded as FAILED so
-- they stay distinguishable from documents that were genuinely unreadable.
--
-- All added columns are nullable or defaulted, so no destructive migration and
-- no data rewrite is required. Rows migrated earlier keep `ocr_status` =
-- PENDING, but the recovery sweep only re-queues rows whose `ocr_confidence`
-- IS NULL (i.e. OCR never completed), so already-processed documents are NOT
-- re-OCR'd on first deploy.
CREATE TYPE "OcrJobStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'EXTRACTED',
  'PARTIAL',
  'NEEDS_REVIEW',
  'UNREADABLE',
  'FAILED'
);

ALTER TABLE "documents"
  ADD COLUMN "ocr_status" "OcrJobStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "ocr_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "ocr_started_at" TIMESTAMPTZ,
  ADD COLUMN "ocr_completed_at" TIMESTAMPTZ,
  ADD COLUMN "ocr_next_attempt_at" TIMESTAMPTZ,
  ADD COLUMN "ocr_last_error" TEXT,
  ADD COLUMN "ocr_detected_type" VARCHAR(50),
  ADD COLUMN "ocr_languages" VARCHAR(50),
  ADD COLUMN "ocr_page_results" JSONB,
  ADD COLUMN "ocr_field_details" JSONB,
  ADD COLUMN "ocr_metrics" JSONB;

CREATE INDEX "documents_ocr_recovery_idx" ON "documents" ("ocr_status", "ocr_attempts", "ocr_started_at");
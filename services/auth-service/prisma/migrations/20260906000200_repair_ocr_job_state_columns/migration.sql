-- Idempotent repair for the durable OCR job-state columns.
--
-- Purpose: production databases that recorded the original
-- (20260906000100_add_ocr_job_state) migration as applied — but lost or never
-- received the actual columns (e.g. a stale branch/restore, or a migration
-- history copied from a primary that lacked the DDL) — report
-- "column documents.ocr_status does not exist" on every OCR recovery sweep
-- while `prisma migrate deploy` silently skips the already-recorded migration.
--
-- This migration converges that state deterministically. Every statement is
-- guarded so it is a no-op when the columns already exist; it is safe to run
-- on fresh databases, on the drifted state above, and to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OcrJobStatus') THEN
    CREATE TYPE "OcrJobStatus" AS ENUM (
      'PENDING',
      'PROCESSING',
      'EXTRACTED',
      'PARTIAL',
      'NEEDS_REVIEW',
      'UNREADABLE',
      'FAILED'
    );
  END IF;
END
$$;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "ocr_status" "OcrJobStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN IF NOT EXISTS "ocr_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "ocr_started_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "ocr_completed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "ocr_next_attempt_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "ocr_last_error" TEXT,
  ADD COLUMN IF NOT EXISTS "ocr_detected_type" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "ocr_languages" VARCHAR(50),
  ADD COLUMN IF NOT EXISTS "ocr_page_results" JSONB,
  ADD COLUMN IF NOT EXISTS "ocr_field_details" JSONB,
  ADD COLUMN IF NOT EXISTS "ocr_metrics" JSONB;

CREATE INDEX IF NOT EXISTS "documents_ocr_recovery_idx"
  ON "documents" ("ocr_status", "ocr_attempts", "ocr_started_at");
# OCR Pipeline Production-Hardening — Implementation Report

Date: 2026-09-06
Scope: `document-service` OCR pipeline, notification security, authz, Aadhaar data-integrity, frontend OCR status UX, golden accuracy harness, CI.

## Summary

The OCR pipeline was hardened end-to-end following the phase plan. All unit suites and type-checks pass; a golden accuracy harness measures extraction quality against hand-curated ground truth (73% field accuracy across the fixture set, with the known Devanagari-render limitation documented below).

| Check | Result |
| --- | --- |
| `document-service` tests | 13 files / 120 passed |
| `notification-service` tests | 2 files / 7 passed |
| Workspace type-check (8 packages) | all pass |
| `shared` / `document-service` / `notification-service` builds | pass |
| Frontend `tsc --noEmit` | pass |
| Golden harness (run with `GOLDEN_MIN_ACCURACY=0.7`) | PASS (72.7%) |

## 1. Durable, recovered, bounded OCR jobs

- **DB is the source of truth.** An `ocr_jobs` table tracks `PENDING → PROCESSING → EXTRACTED / PARTIAL / NEEDS_REVIEW / UNREADABLE / FAILED` (enum `OcrJobStatus`), with `ocr_attempts` for exhaustible retry.
- **Bounded concurrency.** A `pLimit(WORKER_COUNT)` (default 1) queue confines tesseract/pdf rejection to a fixed width; queue leftovers are drained in `finally` via `clearQueue()`.
- **Resilience.** Jobs orphaned in `PROCESSING` are reaped back to `PENDING` on boot and every 5 minutes. Infra/engine failures are separated from content-readable verdicts: retries back off `RETRY_BACKOFF_MS * 2^attempts` and land in `FAILED` once attempts are exhausted; low-quality-but-readable output lands in `UNREADABLE`/`NEEDS_REVIEW` (an honest verdict, not a silent failure).
- **Idempotency/legacy data.** Rows that already carry `ocr_confidence` (pre-existing state) are skipped. `status`/`needs_review` pure-function derivation from the stored flags prevents divergence.
- **Notifications fire once** on terminal/attention transitions only (`UNREADABLE`, `NEEDS_REVIEW`, `FAILED`) and never throw into the job loop.

### Implementation files
- `services/document-service/src/services/ocr.service.ts` — worker pool, boot + 5-min sweep, page/frame budget, honest confidence, notify-on-transition.
- `services/document-service/src/services/ocr/` — `qr.ts`, `qrPayload.ts`, `preprocess.ts`, `qrMerge.ts`, `extractors/` (modular registry).
- Migration `services/auth-service/prisma/migrations/20260906000100_add_ocr_job_state/` + `prisma generate` (Prisma v7.10.0).

### Config (document-service `.env` / `render.yaml`)
`OCR_WORKERS=1`, `OCR_MAX_ATTEMPTS=3`, `OCR_RETRY_BACKOFF_MS=30000`, `OCR_LANGUAGES=eng+hin` (default now includes Hindi; `assets/hin.traineddata.gz` committed), `OCR_PDF_MAX_PAGES=25`, `OCR_PDF_RENDER_DIMENSION=1500`.

## 2. Connection-attachment authorization (Phase 1)

`document.service.ts` now binds every document operation to the authenticated caller's own application:

- Upload requires the caller to own `connectionRequestId`, else `ForbiddenError`; a missing connection is `NotFoundError`. Rejected uploads produce **zero side effects** (no stream, no document row, no timeline, no OCR enqueue). Admins bypass (explicitly reviewed).
- `getDocumentStream` enforces the same ownership check (403 / admin bypass / 404).
- The correction API (`updateExtractedData`) enforces ownership as well.

### Tests
`services/document-service/test/services/document.service.spec.ts` — 12 tests covering forbids/admin-bypass/no-side-effect/own-success/no-`connectionRequestId`-skip/streams/corrections.

## 3. Aadhaar full-value storage & view masking (Phase 2 + data-loss bug)

- **Found & fixed a real extraction bug:** `FULL_AADHAAR_RE` previously used `[\s-]`, so a DOB year on its own line (`1990\n1234 5678 9012`) bled into the Aadhaar number (`199012345678`). All Aadhaar/generic-ID regexes now use `[ \t-]` and backref-anchor `(?<!\d)(?...)(?!\d)` (`aadhaar.extractor.ts`, `generic-id.extractor.ts`).
- **Round-trip integrity:** the full 12-digit number is encrypted at rest in `extractedAadhaarEncrypted`; the view layer decrypts to full value for the owning consumer and admin (`includeSensitive`), and emits `XXXX XXXX <last4>` for everyone else. The ciphertext column is never serialized.
- **Correction API cannot corrupt it:** `aadhaar` corrections are normalized to digits and must match `/^\d{12}$/`, otherwise `ValidationError`. Physically masked cards (`XXXX XXXX 9012`) round-trip safely and are excluded from correction payloads (frontend guard) rather than re-encrypted as garbage.
- Verified via `test/document.view.spec.ts` (4 tests) and the correction tests; the round-trip assertion decrypts the persisted ciphertext back to `123456789012`.

## 4. Honest confidence, statuses, and review UX

- `ocr_detected_type` is persisted for review/analytics and drive the status derivation; `needs_review`/`low_confidence_fields` per-field flags are stored.
- Frontend (`OcrStatusChip`, `DocumentCard`, connections/admin pages) renders all 7 states with pulse animation on PENDING/PROCESSING, includes PARTIAL in "has OCR", surfaces per-field corrections in a scrollable form (name, father, dob, aadhaar, pan, licence, validity, issue date, authority, pincode, state, district, address), and shows CFR-approved FAILED messaging distinct for consumer vs admin. The consumer and admin connection pages poll every 5 s while any doc is active.

## 5. Notification-service internal auth

- `INTERNAL_SERVICE_SECRET` (min 32 chars) was required config in 4 services but **never enforced**. New `requireInternalSecret` middleware
  (`services/notification-service/src/middleware/internal-auth.ts`) compares a SHA-256 digest via `crypto.timingSafeEqual` (constant-time, length-safe) and raises `AuthenticationError` on mismatch.
- Applied with `router.use(requireInternalSecret)` before `/sms` and `/whatsapp`; `notification.client.ts` now sends `x-internal-secret: config.INTERNAL_SERVICE_SECRET`.
- Tests: `test/internal-auth.spec.ts` (4 tests: no header → 401, wrong secret → 401, valid → 200, whatsapp guarded).

## 6. Golden accuracy harness + CI

- `scripts/ocr-golden.ts` runs the **production extraction path** (pdf-parse `getScreenshot`(1500px) → `prepareImage` → tesseract `lang=eng+hin` → `buildExtractedResult`) against fixtures with hand-curated ground truth (never auto-recorded). Emits `scripts/ocr-golden-report.md`, prints per-field accuracy, exits 1 below `GOLDEN_MIN_ACCURACY` (default 0.6).
- `scripts/ocr-dump-text.ts` — one-off ground-truth curation helper (dumps the authoritative text layer).
- `.github/workflows/ci.yml` — Node 20/22 matrix: `npm ci`, shared build, full turbo type-check, document + notification unit suites, frontend type-check; `ocr-golden` runs on `workflow_dispatch`.
- Real findings already fixed via the harness:
  - DL extractor missed `S/W/D` father name when OCR tokenizes ` : ` → `c ` or `: A` → `Ac` (now tolerated; 3-variant regression tests). `dl.pdf` golden: 7/7 fields.

## Current results & known limitations (honest)

- `dl.pdf` (DigiLocker DL): 7/7 fields, confidence 80.
- `ADHAR.pdf` (e-Aadhaar masked printout): 1/4 OCR-only — the Devanagari card renders with pdf.js font-face disabled, so Hindi glyphs become garbage and OCR loses name/DOB/pincode. **In production this card is rescued by the QR-first path**, which the harness deliberately does not exercise (it isolates the OCR leg). Masked cards can never yield the full 12-digit Aadhaar, by design.
- Overall 8/11 (72.7%). The harness exists to catch regressions and to quantify improvement when the structured-parser roadmap (PaddleOCR + local VLM) ships; per-field table is in the generated report.

## Commands

```powershell
# unit suites
cd services/document-service; npx vitest run
cd services/notification-service; npx vitest run

# type-checks / builds
npm run build -w shared
npm run build -w services/document-service
npm run build -w services/notification-service
npx turbo run type-check

# golden harness (needs assets/*.traineddata.gz, committed)
env:GOLDEN_MIN_ACCURACY="0.7"
node -r ..\..\node_modules\ts-node-dev\node_modules\ts-node\register scripts/ocr-golden.ts
```
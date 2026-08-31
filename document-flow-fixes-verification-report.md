# SRS document-workflow fixes — live verification report

**Date:** 2026-08-15
**Scope:** Verify the 5 fixes made in response to `workflow-verification-report.md` (2026-08-14) — auto `DOCUMENTS_PENDING`, per-field low-confidence admin surface, OCR-time "Document Verification Pending" notifications with real persistence, 2 MB upload cap, and in-browser image compression.
**Mode:** Verification against the running system (gateway 3000 → auth 3010 / consumer 3011 / document 3012 / notification 3013) with real data, real OCR, real Postgres + Mongo GridFS. Test data cleaned up afterwards; DB row counts match the pre-walkthrough baseline.

> Note: consumer-service, document-service, and notification-service were restarted before this walkthrough because the old processes were still serving a stale `@prisma/client` (its `ConnectionType` enum predated the current schema, so a valid zod reject surfaced as a 500 instead of a 400).

---

## 1. `DOCUMENTS_PENDING` auto-trigger on submit (SRS §4.4)

**Result: ✅ PASS — auto-held when required documents are missing/flagged; auto-advances when satisfied.**

- New `services/consumer-service/src/config/requiredDocuments.ts` defines required groups per connection type — Identity `[AADHAAR_CARD, PAN_CARD]` and Ownership/Address `[OWNERSHIP_PROOF, ADDRESS_PROOF]` — and `assessDocumentCompleteness()` (a group is satisfied only by an acceptable doc: present, readable, not flagged for review). The gate runs in `workflow.service.ts submitApplication`.
- **Live proof (missing docs):** applied with no documents → status `DOCUMENTS_PENDING`, timeline entry:
  `SUBMIT | DOCUMENTS_PENDING | "Submission held — document verification pending: Identity Proof (Aadhaar/PAN) is missing; Ownership / Address Proof is missing"` with `metadata: { autoHeld: true, documentIssues: [...] }`; `workflow_actions` row `SUBMIT DRAFT→DOCUMENTS_PENDING (CONSUMER)`; audit log `WORKFLOW_TRANSITION`.
- **Live proof (re-submit after uploads):** uploaded 7 docs (3 flagged `needsReview`, 4 acceptable), re-submitted → gate passed both groups → `SUBMIT DOCUMENTS_PENDING→UNDER_VERIFICATION` (existing re-submit rule), audit `APPLICATION_SUBMITTED`, SMS+WhatsApp "…has been submitted successfully…".
- **Regression:** plain submit from `DRAFT` with documents still goes to `SUBMITTED` (unchanged happy path); admin-only transitions still admin-gated (unit tests).

## 2. Admin detail page: per-field low-confidence list (SRS §4.4/§4.7 review surface)

**Result: ✅ PASS — `ocrLowConfidenceFields` now rendered per document on the admin page.**

- Two real uploads produced flagged fields: `pan_example_2.webp` (PAN, conf 33) and `aadhar_example_2.webp` (Aadhaar, conf 51) both stored `ocr_low_confidence_fields = ["extractedDob"]` (implausible DOB → `validateDob` fail → flag).
- Admin detail API (`GET /admin/connection-requests/:id`) returns them:
  `{"name":"pan_example_2.webp","type":"PAN_CARD","ocrStatus":"NEEDS_REVIEW","needsReview":true,"ocrConfidence":33,"ocrLowConfidenceFields":["extractedDob"]}`.
- New shared `frontend/src/components/ocr/OcrLowConfidenceFields.tsx` + `frontend/src/lib/ocrFields.ts` render amber "Verify manually: Date of Birth" chips inside every admin document card (`admin/connections/[id]/page.tsx:466`); renders nothing when the list is empty. Frontend `tsc --noEmit` clean.

## 3. OCR-time "Document Verification Pending" notification + persistence (SRS §4.7)

**Result: ✅ PASS — fires at upload/OCR time, uses the literal SRS wording, persists to `notification_logs`.**

- Literal message added (`notifyDocumentVerificationPending`): *"BSES: Document verification pending for your application X. One or more documents could not be read or need review — please re-upload clearer copies on the BSES portal."* (SMS + WhatsApp).
- **New trigger:** document-service `ocr.service.ts` calls `notifyIfVerificationNeeded()` after every OCR update and in the OCR-error catch (only when the doc is attached to a connection, so standalone profile uploads are not SMS'd). No exception can fail the upload (`try/catch`).
- **Live proof:** every `needsReview` OCR result produced new persisted rows in `notification_logs` (`user_id` FK set, `type`, `recipient`, `message`, `status=SIMULATED`), e.g. 23:50:20/23 (pan_example_2), 23:52:40/41 (aadhar_example_2) — distinct from the submit-time 23:42 rows.
- **Persistence:** notification-service now writes to Postgres `notification_logs` via a new `db/db.client.ts` (Prisma + `@prisma/adapter-pg`). Insert failures are logged but never fail dispatch.
- Notification client rewritten in consumer-service so every notify forwards `userId` (persistence key); `admin REQUEST_DOCUMENTS` message also updated to SRS-aligned wording.

## 4. 2 MB upload cap (both ends)

**Result: ✅ PASS — enforced server-side; client guidance updated.**

- `MAX_FILE_SIZE_MB` default 10→2 (config), `.env` 10→2, multer `fileSize` caps the buffer, `file-safety.ts` comment + `docs/ocr/ocr-upload-limits.md` updated.
- **Live proof:** 7.9 MB noise JPEG (real JPEG magic bytes, `image/jpeg`) → `400 UPLOAD_ERROR "File too large"` (multer `LIMIT_FILE_SIZE`).
- Frontend `documentUpload.ts` uses 2 MB for its own size gate with message *"…exceeds the 2 MB limit even after automatic optimization"*; upload guidance text mentions auto-optimization.

## 5. In-browser image compression

**Result: ⚠️ Logic verified by type-check + design; not exercised in a browser (no DOM/canvas in this environment).**

- New `frontend/src/lib/imageCompressor.ts`: JPEG/PNG/WebP only; triggers when file > ~1.5 MB **or** long edge > 2000 px; decodes via `createImageBitmap` (EXIF-aware), downsizes to a 2000 px max long edge, re-encodes JPEG at quality 0.8 stepping down 10% to a 0.5 floor until ≤ 2 MB; output renamed to `.jpg` so it satisfies the backend's extension↔magic-bytes check (a WebP/PNG re-encoded as JPEG keeps a misleading extension otherwise); returns the original unchanged on failure so the standard 2 MB error explains the rest. No bytes leave the device.
- Wired into both upload entry points (apply wizard + connection-detail re-upload) with an "Optimizing image…" state; validation now runs on the *optimized* file.
- Covered by `tsc --noEmit`; a browser-only runtime exercise is the remaining gap.

---

## Regression & build checks

- `consumer-service` `tsc --noEmit` ✓ · `vitest` **35/35** ✓ (incl. new transition + completeness-gate tests)
- `document-service` `tsc --noEmit` ✓ · `vitest` **92/92** ✓ (npm exits with code 0xC0000005 — native teardown crash of sharp/tesseract on Windows after all tests pass, not a test failure)
- `notification-service` `tsc --noEmit` ✓ · `vitest` **3/3** ✓
- `frontend` `tsc --noEmit` ✓

## Cleanup

All walkthrough data removed; row counts identical to baseline:

| Table | baseline | after cleanup |
|---|---|---|
| connection_requests | 1 | 1 (`BSES-2026-F0IMB7`) |
| documents | 2 | 2 |
| notification_logs | 0 | 0 |
| application_timeline | 2 | 2 |
| workflow_actions | 1 | 1 |
| application_assignments / verification_history | 0 | 0 |

Deleted: 1 test connection, 7 documents (+ 7 GridFS files + 8 chunks in Atlas), 10 timeline rows, 2 workflow actions, 3 walkthrough audit logs, 10 notification rows. Services left running.

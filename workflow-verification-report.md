# SRS workflow items — live verification report

**Date:** 2026-08-14
**Scope:** Verify the 4 SRS workflow items that touch documents with **real data** (live services, real DB, real OCR) per `SRS assignment 1-update.docx` §4.4 (statuses), §4.7 (notifications).
**Mode:** Verification against the running system (gateway 3000 → auth 3010 / consumer 3011 / document 3012 / notification 3013). One production bug found and fixed; test data cleaned up afterwards.

---

## 1. "Documents Pending" (DOCUMENTS_PENDING) auto-trigger

**SRS §4.4** lists `Documents Pending` among possible request statuses. Question: is it triggered when required documents are missing / unreadable (`needsReview=true` or missing expected doc types), or only as a manual admin status?

**Result: ❌ Manual-only — never auto-triggered by document state.**

- The only transition into `DOCUMENTS_PENDING` is the admin `REQUEST_DOCUMENTS` action (`services/consumer-service/src/config/connectionWorkflow.ts:13,31` → `workflow.service.ts:226`). It is reachable only from `UNDER_VERIFICATION`.
- **Live proof:** submitted an application whose only document was a genuinely unreadable DL (`DL_example.webp`, `needsReview=true`, `ocrConfidence=49`). Status went `DRAFT → SUBMITTED` (step 3 output: `SUBMIT: 200 {"status":"SUBMITTED"}`). No document-completeness gate fired; no `DOCUMENTS_PENDING` appeared.
- `DOCUMENTS_PENDING` only became reachable after an admin manually walked the workflow: `SUBMITTED → ASSIGNED → UNDER_VERIFICATION → DOCUMENTS_PENDING` (step 4 output, timeline shows all 7 events incl. `REQUEST_DOCUMENTS | DOCUMENTS_PENDING`).
- There is no "required document" config anywhere (searches for `requiredDoc*` / `expectedDoc*` in the codebase return nothing) and no gate on `submitApplication`/`updateConnection`.

**Implication:** a consumer can submit with missing/unreadable docs and the request proceeds to the normal admin queue; the "Documents Pending" state depends entirely on the admin noticing and requesting documents. Not wired as the SRS workflow suggests.

---

## 2. Admin connection-detail page: needsReview flag + low-confidence fields

**Question:** does the admin detail page display the `needsReview` flag and per-field low-confidence data per document?

**Result: ⚠️ Partial — needsReview flag shown, per-field low-confidence list not rendered.**

- **Admin page** (`frontend/src/app/(protected)/admin/connections/[id]/page.tsx:455-489`) renders:
  - `NEEDS_REVIEW` banner: *"Low OCR confidence — verify the extracted values below before approving."* (line 460)
  - `UNREADABLE` banner: *"OCR flagged this document as low quality / unreadable. Review manually."* (line 455)
  - extracted-field grid + `OCR confidence: 49%` + raw-text snippet.
  - **Live payload** (admin detail API): `{"name":"DL_example.webp","type":"ADDRESS_PROOF","status":"PENDING","ocrStatus":"NEEDS_REVIEW","needsReview":true,"ocrConfidence":49,...}` — the flag IS present and the page reflects it.
- **Missing:** the API returns `ocrLowConfidenceFields: []` and the admin page never renders the **list** of low-confidence fields (no reference to `doc.ocrLowConfidenceFields` in the admin page). Only the **consumer** profile view (`frontend/src/app/(protected)/profile/profile-view.tsx:562-604`) renders per-field "verify" badges. So an admin sees a generic banner + confidence number, but not *which fields* failed OCR.

---

## 3. "Document Verification Pending" notification trigger

**SRS §4.7** lists `Document Verification Pending` as a WhatsApp notification example.

**Result: ⚠️ Notification fires from the review flow, but (a) the literal SRS message doesn't exist, and (b) it was silently broken until a bug fix — see §5.**

- No "Document Verification Pending" string exists anywhere in the codebase. The closest is `notifyDocumentsRequested` → *"BSES: Additional documents are required for your application X. Please upload them on the BSES portal."* (`services/consumer-service/src/services/notification.client.ts:49-53`), triggered by the admin `REQUEST_DOCUMENTS` action that also sets `DOCUMENTS_PENDING` (`workflow.service.ts:248-250`).
- **Live proof (after fix):** during the walkthrough, the notification-service (port 3013) logged real SMS + WhatsApp simulator deliveries:
  - Submit → SMS+WhatsApp `...has been submitted successfully...`
  - Assign → SMS+WhatsApp `...has been assigned to officer Smoke Admin...`
  - Request documents → SMS+WhatsApp `Additional documents are required... Please upload them on the BSES portal.` (both at `To: 9876543210`).
- **Gap:** no notification fires at upload/OCR time when a document is flagged `needsReview`; the trigger is only the admin's request-documents action, and there is no document-service → notification hook at all.
- **Persistence gap:** the `notification_logs` table exists (schema + migration) but **no service writes to it** — delivery is simulator-only in dev (matches SRS §4.7 "simulate SMS and WhatsApp delivery by displaying success messages").

---

## 4. Full manual walkthrough (draft → low-quality DL → submit → admin review surface)

**Question:** create a draft, upload a genuinely low-quality DL sample (flags `needsReview`), submit, and confirm the admin side surfaces it with the right document linked.

**Result: ✅ PASS — end-to-end with real data.**

| Step | Evidence |
|---|---|
| Consumer login | `rajesh_sharma2026` / `ConsumerPass@2026!` → 200 |
| Create draft | `201 {"id":"cmssrjaof...","app":"BSES-2026-XZGO7G","status":"DRAFT"}` |
| Upload low-quality DL | `201`, `ADDRESS_PROOF`, `mime image/webp` (bytes from real `DL_example.jpg`, named `DL_example.webp`) |
| OCR completes | `{"status":"NEEDS_REVIEW","conf":49,"review":true}` |
| Submit | `200 {"status":"SUBMITTED"}` |
| Admin assign → verify → request docs | `ASSIGNED → UNDER_VERIFICATION → DOCUMENTS_PENDING`, each 200 |
| Admin detail | `status=DOCUMENTS_PENDING`; doc correctly linked: `{"name":"DL_example.webp","type":"ADDRESS_PROOF","ocrStatus":"NEEDS_REVIEW","needsReview":true,"ocrConfidence":49}` |
| Timeline | 7 events: `APPLICATION_CREATED → DOCUMENT_UPLOADED → SUBMIT → ASSIGN → START_VERIFICATION → REQUEST_DOCUMENTS` |

The right document is linked to the right application throughout; the admin detail payload exposes `ocrStatus`/`needsReview`/`ocrConfidence` per document.

---

## 5. Production bug found & fixed

**Bug:** *every workflow notification silently never fired.* `transition()` in `services/consumer-service/src/services/workflow.service.ts:69-72` returns `connectionRepository.update(...)`, a bare `ConnectionRequest` **without** the `user` relation, but `notifyConsumer` (line 54-57) reads `connection.user?.mobileEncrypted` → always `undefined` → `if (mobile)` is false → notification skipped with **no log line at all**. Confirmed empirically: the seed consumer has `mobileEncrypted` set and the notification-service worked (direct POST → `SIMULATED`), yet during the pre-fix walkthrough the notification-service received zero requests and the consumer log had no "SMS notification dispatched" / "Failed" lines.

**Fix:** `transition()` now returns `{ ...updated, user: input.connection.user }` (2 lines), preserving the loaded `user` relation so `notifyConsumer` gets the mobile.

**Verification after fix:** live walkthrough re-run → consumer log shows `SMS notification dispatched` / `WhatsApp notification dispatched` (`recipient 9876****`) and notification-service logged 3 SMS + 3 WhatsApp simulator deliveries (submit / assign / documents-requested) to `9876543210`.

**Regression checks:** consumer-service `npx vitest run` → 5 files, **26/26 pass** (incl. `workflow.spec.ts` 19/19); `npx tsc --noEmit` → **exit 0**.

---

## Summary

| # | Item | Status |
|---|---|---|
| 1 | `DOCUMENTS_PENDING` auto-triggered by missing/unreadable docs | ❌ Manual-only (admin `REQUEST_DOCUMENTS`); no doc gate or required-doc config |
| 2 | Admin detail shows needsReview + low-confidence fields | ⚠️ Banner + confidence shown; per-field `ocrLowConfidenceFields` list not rendered on admin page |
| 3 | "Document Verification Pending" notification fires from real event | ⚠️ Now fires (SMS+WhatsApp) on admin documents-request; no such literal message; nothing at upload/OCR time; `notification_logs` never written |
| 4 | Full walkthrough: draft → low-quality DL → submit → admin surface | ✅ PASS |

**Cleanup:** 4 test connections, 3 documents, 15 timeline rows, 8 workflow actions, 2 assignments, 8 today's workflow audit logs, and 3 GridFS files+chunks deleted. Smoke-admin user's soft-delete restored. Services stopped. Test data left for `rajesh_sharma2026`: 1 connection (`BSES-2026-F0IMB7`, pre-existing) + 2 pre-existing documents only.

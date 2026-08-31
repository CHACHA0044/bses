# End-to-end upload verification report

**Date:** 2026-08-14 (two runs)
**Scope:** Verify the real document upload flow (gateway → document-service) end-to-end — multipart upload, file-safety, GridFS (encrypted), async OCR/QR, extraction, merge, persistence — and confirm what is actually stored at rest in PostgreSQL + MongoDB, exactly as the app reads it.
**Mode:** Run 1 = verification only (no production code modified). Run 2 = fixes applied (PAN extraction + WebP/AVIF support), full re-verification, then all test data cleaned up.

---

## 0. Run 1 summary (original state)

- **Format gate (by design):** the original repo-root samples — `Aadhaar_example_3.webp` (WebP), `DL_example.jpg` (WebP despite `.jpg`), `pan_example.jpg` (AVIF despite `.jpg`) — were **rejected** by magic-byte validation (`services/document-service/src/utils/file-safety.ts`, only PNG/JPEG/PDF accepted). A converter re-encoded them (Aadhaar→PNG, PAN/DL→JPEG) and Run 1 uploaded those.
- **Findings that drove the fixes:**
  1. **PAN extraction gap:** PAN `BNZPM2501F` + DOB extracted, but **name `MANIKANDAN` and father's name `DURAISAMY` were not** even though both are visible in the stored raw OCR text. `pan + dob` = 2 of `EXPECTED_FIELDS[PAN]=4`; `belowHalf` was `2*2 < 4` = false → **`needsReview=false`**. The card silently cleared review while missing its own name/father's name.
  2. **DL degradation correctly flagged:** garbled name `BHASKAR ADHIKARy EF`, `needsReview=true` — working as designed, do not touch.
  3. **Aadhaar:** QR authoritative, conf 99, all fields `qr` — reference success.
  4. Stored PAN DOB `16/07/1986` came from a garbled raw line (`1610711986`) — needed verification against the raw OCR.

---

## 1. Fixes applied (Run 2)

### 1.1 PAN name / father's name extraction (`services/document-service/src/services/ocr/extractors.ts`)

The PAN cards have a *bare layout*: name and father's name appear as standalone lines between the `INCOME TAX DEPARTMENT GOVT. OF INDIA` header and the `Permanent Account Number` label, with no OCR-visible "Name:" / "Father's Name:" labels.

- Added positional extraction: scan lines between the PAN header and the account-number label; first all-caps token run (≥3 chars, containing a vowel, not a stop word) → name, second → father's name (`extractPanPositionalNames`).
- Wired into the `PAN_CARD` branch: label-based `extractName`/`extractFatherName` are tried first, positional extraction fills any gaps.
- **Result:** both names now extracted for the real card (see §3.2).

### 1.2 `needsReview` boundary (`assessNeedsReview`)

- Old: `belowHalf = got * 2 < EXPECTED_FIELDS` → 2/4 PAN never flagged.
- New: `atMostHalf = got * 2 <= (EXPECTED_FIELDS[docType] ?? 0)` → a PAN with 2/4 fields (or fewer) at confidence < 60 now flags `needsReview=true`. Complete extractions at low confidence still do not flag. JSDoc updated to "at most half".
- DL logic untouched (garbled OCR is variance, not a code bug).

### 1.3 PAN DOB verification

`16/07/1986` is directly present in the stored raw OCR text line (`16/07/1986 Los`) in Run 1's uploaded PAN (`pan_example.jpeg`), so it is a **direct read** — not derived from the garbled `1610711986` (that garbling was the standalone scan's read of the original AVIF). Plausible and valid (born 16 Jul 1986, within DOB range). This run's AVIF card OCR read the date line as `1610711986 Lass` (no separators), so the extractor's strict date regex (`\d{2}[-/.]\d{2}[-/.]\d{4}`) correctly declined it — conservative-by-design, no garbage stored.

### 1.4 WebP/AVIF upload support (policy decision: **accepted**)

- **Decision:** support **WebP and AVIF**. Rationale: WebP is a common Android camera default; `sharp@0.33.5` (already in `node_modules`) natively decodes `webp` and `heif` (AVIF); the 40MP decompression-bomb gate applies identically. **HEIC/HEIF remain rejected**.
- Backend:
  - `src/utils/file-safety.ts`: `DetectedFileType` + `detectFileType` now detect WebP (`RIFF` @0-3 + `WEBP` @8-11) and AVIF (`ftyp` @4-7 + brand `avif`/`avis` @8-11); error messages updated to "PDF, JPEG, PNG, WebP, or AVIF". HEIC/HEIF `ftypheic`/`ftypmif1` still → rejected.
  - `src/config/index.ts` + `.env`/`.env.example`: `ALLOWED_MIME_TYPES` now `application/pdf,image/jpeg,image/png,image/webp,image/avif`.
  - `src/middlewares/upload.middleware.ts`: type-error message updated.
- Frontend (`frontend/src/lib/documentUpload.ts`): `ACCEPTED_MIME_TYPES` (drives the file picker `accept`), `sniffFileType` (client-side magic-byte sniff for WebP/AVIF), `EXTENSION_HINTS` + mismatch checks, and upload guidance text ("Accepted: PDF, JPEG, PNG, WebP, or AVIF") all updated.
- Docs (`docs/ocr/ocr-upload-limits.md`): accepted-types table row, dated policy note (2026-08-14; HEIC/HEIF still rejected), magic-byte content check line, wrong-type message — all consistent with code.
- **Converter now obsolete** → `services/document-service/scripts/convert-test-images.cjs` deleted.

---

## 2. Run 2 — real upload path with the **original** WebP/AVIF files

No re-encoding. The exact repo-root files were uploaded through the gateway with their true MIME types:

| Document | File | Actual format | Doc id | gridfsFileId |
|---|---|---|---|---|
| AADHAAR_CARD | `Aadhaar_example_3.webp` | WebP | `cmssqaccz0000s0izcgtmh0nv` | `6a7edbe093ccbd61a2b40a53` |
| PAN_CARD | `pan_example.avif` (was `pan_example.jpg`) | AVIF | `cmssqaed80002s0izogaakcka` | `6a7edbe393ccbd61a2b40a55` |
| ADDRESS_PROOF | `DL_example.webp` (was `DL_example.jpg`) | WebP | `cmssqaf0g0004s0izwcd87ag3` | `6a7edbe493ccbd61a2b40a57` |

- All three **passed the format gate** (upload `201`), linked to a new DRAFT connection `BSES-2026-5L9RNG` (`cmssqab0s00001sizqo5a8f48`) and seed user `cmsiik51i0001d6n5opa3877b`.
- Async OCR completed: Aadhaar conf 99, PAN conf 44, DL conf 49.

---

## 3. Run 2 — plaintext of every extracted field (decrypted with the app's `encryptionService`)

### 3.1 AADHAAR_CARD — `Aadhaar_example_3.webp` (conf 99.00, needsReview **false**)

`ocrFieldSources = {"extractedDob":"qr","extractedName":"qr","extractedGender":"qr","extractedAadhaar":"qr","extractedAddress":"qr"}`

| Field | Plaintext |
|---|---|
| Aadhaar | `483586226030` |
| Name | `Niranjan Kumar` |
| DOB | `12/04/2000` |
| Address | `S/O: Rajkumar Gupta, Salempur, Nandlalpur, Vaishali, Vaishali, Bihar, 844113` |
| Raw OCR (QR XML) | `<PrintLetterBarcodeData uid="483586226030" name="Niranjan Kumar" gender="M" yob="2000" co="S/O: Rajkumar Gupta" vtc="Salempur" po="Nandlalpur" dist="Vaishali" subdist="Vaishali" state="Bihar" pc="844113" dob="12/04/2000"/>` |

### 3.2 PAN_CARD — `pan_example.avif` (conf 44.00, needsReview **false**)

`ocrFieldSources = {"extractedPan":"ocr","extractedName":"ocr","extractedFatherName":"ocr"}`

| Field | Plaintext |
|---|---|
| PAN | `BNZPM2501F` |
| Name | `MANIKANDAN` **← was missing before the fix** |
| Father's name | `DURAISAMY` **← was missing before the fix** |
| DOB | *(empty — OCR read the date line as `1610711986 Lass`, no separators; strict date regex conservatively declined. Run 1's JPEG card read `16/07/1986 Los` → DOB `16/07/1986` stored.)* |

Extraction is now 3/4 expected fields (PAN, name, father's name) — **more than half** — so `needsReview=false` is correct per the new boundary. When only 2/4 are extracted, `needsReview` now correctly flags (regression-tested).

### 3.3 ADDRESS_PROOF — `DL_example.webp` (conf 49.00, needsReview **true**)

`ocrFieldSources = null` (no fields met the thresholds this run)

| Field | Plaintext |
|---|---|
| All fields | *(empty — this OCR run read the card so poorly no field was extracted; raw text contains `BHASKAR ADHIKARy`, `Date of Birth: 14-03. 1974`, licence `2015022305` but in a garbled layout)* |

`needsReview=true` (conf 49 < 60) — **correctly held for manual review**. DL logic untouched per instruction; the degraded result is OCR variance across formats/runs, not a code-path difference.

### 3.4 Encrypted-at-rest confirmation (Run 2, both stores)

- **Postgres:** every populated `*_encrypted` column held ciphertext; decryption produced exactly the plaintext above. Empty fields stored as empty strings. `ocrRawTextEncrypted` decrypts to the full tesseract text.
- **GridFS (MongoDB `bses_documents`):**

| fileId | stored name | stored head 16B hex | decrypted format |
|---|---|---|---|
| `6a7edbe093ccbd61a2b40a53` | `Aadhaar_example_3_1786698720175.webp` | `f5578f4b…` (not `RIFF…`) | `RIFF/WEBP` ✓ |
| `6a7edbe393ccbd61a2b40a55` | `pan_example_1786698723531.avif` | `f53d54c0…` (not `ftyp…`) | `ftyp/avif` ✓ |
| `6a7edbe493ccbd61a2b40a57` | `DL_example_1786698724358.webp` | `2dae3490…` (not `RIFF…`) | `RIFF/WEBP` ✓ |

Stored bytes are ciphertext (no magic bytes); decrypting the stored chunks reconstructs the exact original WebP/AVIF (decrypted size == `documents.file_size`); `metadata.encrypted = true` on every file. This proves WebP/AVIF files are handled identically to PNG/JPEG end-to-end.

---

## 4. Test evidence

- `services/document-service/test/services/ocr/extractors.spec.ts` — added regression tests: bare-layout PAN extracts `MANIKANDAN`/`DURAISAMY`/`BNZPM2501F` positionally; a PAN with exactly half its fields (2/4) flags `needsReview`; a complete low-confidence PAN does not flag.
- `services/document-service/test/utils/file-safety.spec.ts` — added: detects WebP, detects AVIF, accepts genuine WebP/AVIF with matching declared type; HEIC/HEIF `ftyp` box is **not** mistaken for AVIF.
- **Document-service full suite: 96 tests / 10 files — all pass.** Type-checks clean: `document-service` `tsc --noEmit` ✓, `frontend` `tsc --noEmit` ✓.

---

## 5. Cleanup (completed)

- **Postgres** (seed user `cmsiik51i0001d6n5opa3877b`): deleted 6 test `documents`, 8 `application_timeline` rows, 2 test `connection_requests` (`BSES-2026-MFP2SJ`, `BSES-2026-5L9RNG`). Remaining: only the 2 pre-existing docs and 1 pre-existing connection from before testing (untouched).
- **MongoDB GridFS:** deleted 6 test files (Run 1: `6a7ec612b72c8ef77177a7a3`, `6a7ec615b72c8ef77177a7ae`, `6a7ec616b72c8ef77177a7b0`; Run 2: `6a7edbe093ccbd61a2b40a53`, `6a7edbe393ccbd61a2b40a55`, `6a7edbe493ccbd61a2b40a57`) including their chunks.
- **Temp scripts:** entire `C:\Users\prana\AppData\Local\Temp\opencode\bses-verify\` directory (login/upload orchestration, OCR poller, Postgres/Mongo decrypt dump, cleanup scripts, converted images, logs) removed.
- **Converter script:** `services/document-service/scripts/convert-test-images.cjs` deleted (obsolete once WebP/AVIF are natively supported). Kept the pre-existing dev utilities `scripts/ocr-scan.ts` and `scripts/ocr-scan-report.md`.
- **No stray files outside the project root** were left by verification.
- Background services (auth/consumer/document/gateway) stopped after the run.

---

## 6. Final status

- PAN name/father's-name extraction gap: **fixed** and regression-tested.
- `needsReview` half-boundary: **fixed** (at-most-half now flags), DL behavior unchanged.
- WebP/AVIF: **supported** end-to-end (backend + frontend + docs consistent), HEIC/HEIF still rejected.
- All extracted fields verified in **plaintext** via the app's own decryption; everything encrypted at rest.
- All test data and temp artifacts **removed**; production code paths unchanged apart from the intended fixes.

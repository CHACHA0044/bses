# Document Upload & OCR Limits

**Status:** Shipped — enforced end-to-end (backend validation + frontend pre-upload checker).
**Data constraint:** No document image or text may leave our infrastructure (privacy + DPDP-adjacent commitments), so every limit below is enforced on-premise.

This document states the real, pipeline-measured limits for the document upload + OCR flow, the specific messages users see when they hit them, and the security posture behind the upload path. Limits quoted here are the single source of truth for both the backend (`services/document-service/src/utils/file-safety.ts`) and the frontend checker (`frontend/src/lib/documentUpload.ts`).

---

## 0. QR-first extraction (primary path for Aadhaar)

Since the last corpus scan, the pipeline is **QR-first**: a document's QR code is decoded *before* OCR and is authoritative for every field it carries. OCR only fills the gaps.

- **Decode order:** original photo → deskewed/binarized variant → flat variant (when the deskew estimate hit the scan boundary). The QR is also read on a 2× upscale when the image's long edge is small. Decoding is capped at 2000 px / 40 MP — the same bounds as the rest of the pipeline.
- **Payload formats parsed** (`services/document-service/src/services/ocr/qrPayload.ts`):
  1. `<PrintLetterBarcodeData uid=… name=… dob=… gender=… state=… pc=…/>` — the current UIDAI offline QR (plain XML attributes).
  2. Secure e-KYC QR — `<Signature><Data>base64</Data>` with base64(zlib/gzip/JSON) inside.
  3. **Legacy numeric QR** — the old-style Aadhaar card: a very long decimal string that decodes to `gzip → 0xFF-separated text` (`V2<FF>…<FF>name<FF>dob<FF>gender<FF>address…<FF>photo`).
  4. Legacy XML (`<Auth><Name>…`), legacy pipe-delimited text.
  5. Anything else → generic extractors (PAN numbers, licence numbers, DOBs…) run over the raw payload, so **PAN and driving-licence QRs are supported too**, without knowing their (undocumented) layouts.
- **Merge semantics** (`qrMerge.ts`): per-field — a QR value always beats OCR (a garbled OCR read can never override the card's own encoding); fields the QR doesn't carry fall back to OCR; every field's provenance is recorded in `ocrFieldSources`. When the QR covers every expected field for the document type, the OCR cycle is **skipped entirely** (confidence 99).
- **Measured on the corpus:** `Aadhaar_example_3.webp` (2048 px photo) is now read **entirely from the QR** — Name, DOB, Gender, Aadhaar, Address — with OCR skipped (was: OCR-only, garbled). `aadhar_example.webp` yields Name/DOB/Gender/Address from its legacy QR and Aadhaar from OCR. All limits in §2/§4 below still apply **when no readable QR is present** (most PAN/DL photos, older/obscured Aadhaar).
- **User impact — the QR must not be cropped or obscured:** for Aadhaar/PAN/DL, a photo that keeps the QR code in frame now reads far more reliably than any OCR. Guidance text and the pre-upload checker tell users to keep the whole card (including the QR) visible.

---

## 1. Accepted file types & size

| Rule | Limit | Enforced at |
| --- | --- | --- |
| Accepted types | `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `image/avif` | Frontend picker (`accept`), backend MIME + magic bytes |
| File size | ≤ **2 MB** (config `MAX_FILE_SIZE_MB`) | Frontend (post-compression), multer `fileSize`, re-checked post-upload |
| Files per request | 1 | multer `files: 1` |
| Filename | Control chars (CR/LF etc.) rejected; length ≤ 200; used only as a display label | Frontend + backend |
| Declared MIME vs content | Must match the detected magic bytes (renamed/polyglot files rejected) | Backend `detectFileType` |

**Why:** The type must be verified by content, not by extension or browser MIME — a `.jpg` renamed over an executable or a polyglot file is rejected at the magic-byte check before any processing.

> **Client-side auto-compression (2026-08-15):** because the limit is 2 MB, the frontend **automatically optimizes image uploads in the browser** before sending them — no file leaves the device, no extra server round-trip. JPEG/PNG/WebP files that exceed ~1.5 MB *or* have a long edge > 2000 px are decoded to a canvas, downscaled to a **2000 px max long edge**, and re-encoded as JPEG starting at **80% quality**, retrying downward in 10% steps to a **50% floor** until the result fits. PDFs and AVIF are never modified. The 900 px recommended-resolution floor (§2) is preserved — 2000 px is comfortably above it, so OCR readability is not degraded. Only if the image still cannot be compressed under 2 MB does the existing size-error message appear. Implementation: `frontend/src/lib/imageCompressor.ts`.

> **WebP/AVIF policy (2026-08-14):** WebP and AVIF were added to the accepted whitelist because they are common phone camera formats (several Android camera defaults shoot WebP, newer devices AVIF). `sharp`/libvips decodes both natively, so the pipeline downstream of the magic-byte gate is unchanged — the same 40 MP decompression-bomb cap and dimension caps apply. **HEIC/HEIF remain rejected** (proprietary Apple format, extra metadata, no corpus coverage).

## 2. Image limits (measured from the real scan corpus)

All numbers below come from the pipeline scan corpus (`services/document-service/scripts/ocr-scan-report.md`), not vendor marketing:

| Signal | Real behaviour observed | Limit we enforce |
| --- | --- | --- |
| **Resolution (long edge)** | Full extraction succeeded at **741 px** (DL, conf 78) and **768 px** (Aadhaar, conf 54). Smallest image — **600×400** PAN — extracted the PAN number only (conf 44, needs review). | **Hard floor 500 px**; **warn below 900 px** ("may still work, sharper photo reads more reliably") |
| **Decoded pixel count** | — | **40 MP cap** (`MAX_DECODED_PIXELS`), dimension cap 12 000 px — rejects decompression bombs before sharp decodes |
| **Skew** | **10° rotation → zero fields extracted** (DL_example.jpg). 2° → fine. Deskew estimator covers ±30° with boundary fallback; >10° is where extraction reliability collapses. | Frontend + doc guidance: "level, not tilted more than ~10°" |
| **Contrast / ink ratio** | Dark images are the classic failure: pan_example_2 (ink ratio 52%, "Otsu threshold may be wrong") → only PAN + father name, DOB flagged low-confidence. | Frontend blank/low-contrast check (thumbnail luminance std-dev) flags before upload |
| **Cropping** | Cards that don't fill the frame lose fields (the pipeline does **not** auto-crop). | Guidance: "full document, all edges visible, not cropped into the card" |

**Thresholds (must stay in sync with `frontend/src/lib/documentUpload.ts`):**
- `MIN_IMAGE_DIMENSION = 500` (hard error)
- `RECOMMENDED_MIN_DIMENSION = 900` (warning)
- `MAX_DECODED_PIXELS = 40_000_000` (hard error)

## 3. PDF handling (honest statement)

- PDFs are **text-extracted via `pdf-parse`** (born-digital document text layer). They are **not rasterized** for Tesseract — so a scanned PDF is read as best-effort text-layer output, not re-OCRed.
- Enforced: **max 25 pages** (`MAX_PDF_PAGES`), pdfjs runs with **JavaScript, fonts, XFA, and auto-fetch disabled**, images capped at 12 MP, errors stop the run (`stopAtErrors: true`).
- A PDF that fails these checks is rejected with a specific message instead of being silently half-read.

## 4. Per-type reliability (from the corpus, honest)

| Document | Works reliably at | Failure modes |
| --- | --- | --- |
| **Aadhaar** | ≥768 px clean, level, decent light; **QR present → near-perfect regardless of photo quality** | QR cropped/obscured AND low light/crop/glare → DOB garbage (e.g. 18/09/1599) or unreadable |
| **Driving licence** | ≥741 px clean (conf 78) | skew >10° kills extraction entirely |
| **PAN** | ≥768 px; name + father's name reliable | small/dark scans → PAN only, father name lost, DOB low-confidence |

Ratings given to users as "may still work" vs "please retake" map to these measured bands.

## 5. Security posture of the upload path

What is verified/sanitised **before** an OCR cycle, in order:

1. **Rate limit** — per-user sliding window, **20 uploads / 15 min** (config `UPLOAD_RATE_LIMIT_MAX`, `UPLOAD_RATE_LIMIT_WINDOW_MS`), keys off `req.user.sub ?? req.ip`. Prevents the upload path being used to grind OCR or fill storage.
2. **Multipart limits** — 1 file, ≤10 fields, ≤20 parts, 1 MB per field, 2 MB file.
3. **Magic-byte content check** (`validateUploadContent`) — decodes the real file type (PNG/JPEG/PDF/WebP/AVIF), rejects MIME mismatches and non-accepted content.
4. **Decompression-bomb guard** — sharp runs with `limitInputPixels` and `failOn: 'none'`; decoded dimensions must be ≤40 MP / 12 000 px.
5. **Metadata stripping** — only pixels are carried into the pipeline (`prepareImage`; EXIF read for rotation, never forwarded; a fresh buffer is written). No GPS/camera/author metadata survives.
6. **Untrusted OCR text containment** — extracted values are regex-validated, typed, AES-encrypted per field at rest, and never passed through an LLM prompt, a shell, or a raw SQL string (parameterized only). Low-confidence fields and unreadable pages are surfaced as **needs-review**, never auto-accepted into the consumer's profile.
7. **PDF containment** — JS off, XFA off, page cap, error-stop, image-size cap.
8. **QR payload containment** (`ocr/qrPayload.ts`) — the payload is treated as fully untrusted: only regex/`JSON.parse` (never eval); decompression bounded by `maxOutputLength` (8 MB — a bomb cannot OOM the process); the legacy numeric decoder bounds the digit→byte conversion before BigInt work; any embedded photo blob is dropped from the retained `raw` before logging/persistence; malformed payloads degrade to an empty `generic` result, never a throw.
9. **Header/note sanitisation** — filenames used in `Content-Disposition` and timeline notes are stripped of control characters and truncated.

Frontend pre-upload checker (`validateDocumentFile`) mirrors rules 1–4 + the quality signals so a bad file is rejected with a **specific message** ("this image is only 480px…", "looks blank or very low-contrast…") before it is even sent.

---

## 6. Message inventory (what users see)

| Situation | Message |
| --- | --- |
| Wrong type | "This file is not a readable PDF, JPEG, PNG, WebP, or AVIF image. Please upload a PDF, JPEG, PNG, WebP, or AVIF." |
| Renamed image | "The file is a JPEG image but has a mismatched file extension. Please rename it to .jpg." |
| Too big | "This file is X MB, which exceeds the 2 MB limit. Please use a lower-resolution scan or smaller file." |
| Too small | "This image is only X px on its longest side — too small to read reliably. Please take a closer, higher-resolution photo (at least 900px)." |
| Pixel bomb | "This image is very large (W×Hpx) and cannot be processed. Please resize it and try again." |
| Blank/low-contrast | "This image looks blank or very low-contrast (too dark, washed out, or out of focus). Please retake it in good lighting." |
| Marginal size | (warning, non-blocking) "It may still work, but a sharper photo (at least 900px) reads much more reliably." |
| Rate limit | Backend `RateLimitError`: too many uploads in the window — try again later. |

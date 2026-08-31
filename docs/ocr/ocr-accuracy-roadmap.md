# OCR Accuracy Roadmap

**Status:** In progress — heuristics shipped; structured-parser rollout is the next milestone.
**Data constraint:** No document image or text may leave our infrastructure (privacy + DPDP-adjacent commitments), so every option below must run fully on-premise.

## Current pipeline (shipped)

```
upload → GridFS (encrypted at rest)
       → document-service background OCR
           ├─ PDF        → pdf-parse text layer (born-digital docs)
           └─ image      → sharp preprocess → Tesseract.js → field extractors
                                  │
                                  ├─ auto-rotate (EXIF) + flatten to white
                                  ├─ resize ≤ 2000px (~300 DPI equivalent)
                                  ├─ grayscale + percentile contrast stretch
                                  ├─ Otsu binarization
                                  └─ Hough-transform deskew (-8°..+8°)
```

- Field extraction is now routed by `documentType` (see `services/document-service/src/services/ocr/extractors.ts`):
  - **Aadhaar card** → aadhaar, name, dob
  - **PAN card** → pan, name, father's name, dob
  - **Address/ownership/other proof** → driving-licence detection first (licence number, validity, dob); otherwise name + address; aadhaar/pan/dob picked up opportunistically
  - **Passport photo / affidavit / other** → best-effort name + dob
- All extracted values are AES-encrypted into per-field columns; consumers can review and correct them in the profile, with corrected fields flagged as "edited by you" (`extractedFieldsEdited`).

### Honest assessment
Regex-over-Tesseract gives acceptable results on **born-digital PDFs** and **clean scans**, but degrades on phone photos of cards (glare, perspective, low light, mixed Devanagari/Latin on some documents). This is expected for the heuristic tier.

## Research summary (2026 landscape, on-prem capable)

Independent benchmarks (Surya vs docTR vs PaddleOCR vs a local VLM, 2026) place the options roughly as:

| Engine | Approach | Strength | Weakness | Memory (approx) |
| --- | --- | --- | --- | --- |
| **PaddleOCR (PP-OCRv5/v6)** | detection + recognition (CNN/SVTR) | Fast (~6.8 pages/s), ~1.4% CER on clean scans, Apache-2.0 | ~4–6% CER on noisy photos; two-stage orchestration | ~2 GB |
| **docTR / OnnxTR** | detection + recognition, swappable models | Middle ground, flexible; ONNX Runtime path | More assembly | ~3 GB |
| **Surya** | transformer det + rec | Robust on skewed/noisy input (~1.1% clean / 3.8% noisy CER) | Slow (~1.9 pages/s), GPL-3.0 | ~5 GB |
| **Qwen2.5-VL 7B (or MiniCPM-V 8B)** | vision-language model | Best on messy input (~3.1% CER); reads structure → returns fields in one shot | Slow (0.4 pages/s), ~10 GB RAM; token-by-token decode | ~10 GB |
| **PaddleOCR-VL (0.9B)** | compact doc VLM | 94.5–96.3% OmniDocBench; strong on skew/warping; Apache-2.0 | Newer, heavier than PP-OCR pipeline | moderate |

The widely reproduced 2026 recommendation for on-prem pipelines is a **cascade**: run a fast engine (PaddleOCR) over the whole queue, score per-page confidence, and route low-confidence pages to a local VLM (Qwen2.5-VL or MiniCPM-V). On real mixed queues this recovers most of the VLM's accuracy at a fraction of the cost — roughly 8–10% of pages end up on the slow path.

## Recommended rollout

### Phase 1 — Ship the heuristic tier (done)
Sharp preprocessing + per-type extractors + consumer corrections ("edited by you"). Buy time to build the labelled dataset below.

### Phase 2 — Swap Tesseract for PaddleOCR (first real accuracy win)
- Run **PP-OCRv6/PP-OCRv5 server models** in a small Python sidecar (FastAPI + `paddleocr`), or in-process via a bundled Python runtime; the document-service already isolates OCR behind one interface (`ocrService.processDocument`), so this is a contained change.
- PaddleOCR returns **per-text-region confidence and word boxes**, which lets us:
  1. sort lines by Y/X to keep name/dob/address pairing stable,
  2. compute a document-level confidence that is far more meaningful than Tesseract's page average, and
  3. drive the VLM fallback routing (Phase 3).
- Keep `pdf-parse` for born-digital PDFs.

### Phase 3 — Local VLM fallback + structured extraction
- Serve **Qwen2.5-VL 7B** (or MiniCPM-V 8B / PaddleOCR-VL 0.9B) via **vLLM** (OpenAI-compatible endpoint) or **Ollama** on a GPU worker.
- Route low-confidence pages from Phase 2 to the VLM with a per-document-type prompt:
  - prompt only for the relevant keys (e.g. `{ licenceNumber, name, dob, address, validity }`),
  - demand strict JSON, validate with a schema (zod/pydantic), store a per-field confidence.
- This replaces the regex field extractors with model-based KIE and removes most edit friction.

### Phase 4 — Fine-tune on our own documents (optional)
- Grab-style experience: a small (~1B) VLM fine-tuned on **our** document set outperforms general models and has dramatically lower latency than a 7B.
- Needs a labelled dataset: auto-label from verified OCR + consumer corrections (the "edited by you" signal is free training data), then human-review a sample.

### Dataset hygiene (foundation for any of this)
1. Log every extraction result + consumer correction to a training table (PII-encrypted, export-controlled).
2. Build a small human-verified golden set (≥200 images across aadhaar/pan/driving-licence/bill).
3. Measure **field-level accuracy** (not just CER): per document-type, per field, "was the value correct at first extraction?" — this is the metric the business cares about.

## Suggested priority
1. **PaddleOCR swap** — biggest accuracy-per-effort win, keeps everything on-prem.
2. **VLM fallback** on low-confidence docs — closes the long tail of unusable phone photos.
3. **Consumer-correction feedback loop** → dataset → (optionally) fine-tune.

## References
- PaddleOCR 3.0 technical report (PP-OCRv5, PP-StructureV3, PP-ChatOCRv4): arxiv.org/abs/2507.05595
- PP-OCRv5 (5M params rivaling billion-param VLMs): CVPR 2026
- 2026 local OCR benchmark — Surya vs docTR vs PaddleOCR vs Qwen2.5-VL (M-series): contracollective.com
- On-device OCR review — PaddleOCR vs Tesseract vs transformer OCR: lofttools.com
- Local vision-language OCR benchmark (Qwen2.5-VL 7B recommended default): nullmirror.com
- Open-weight OCR/Document AI leaderboard 2026: presenc.ai
- MiniCPM-V 2.6 model card; Qwen2.5-VL technical report
- Grab engineering — building a custom vision LLM for documents: engineering.grab.com/custom-vision-llm-at-grab

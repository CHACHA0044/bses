"""
PaddleOCR Sidecar Service
=========================
HTTP wrapper around PaddleOCR for the BSES document pipeline.

Why a sidecar:
- PaddleOCR needs Python + heavy ML models (~200MB+ loaded)
- Running it inside Node would blow the 512MB Render budget
- A separate service lets OCR scale independently

API:
  GET  /health   -> {status: 'ok', engine: 'paddleocr'}
  POST /ocr      -> {results: [{text, confidence, box}], count, width, height, elapsed_ms}
  POST /ocr/batch-> {batch: [...], count, elapsed_ms}
"""

from __future__ import annotations

import io
import logging
import os
import time
from typing import Any

import uvicorn
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from paddleocr import PaddleOCR
from PIL import Image
import numpy as np

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("ocr-sidecar")

LANG = os.getenv("PADDLE_LANG", "en")
USE_GPU = os.getenv("PADDLE_USE_GPU", "false").lower() == "true"
MAX_IMAGE_PIXELS = int(os.getenv("PADDLE_MAX_PIXELS", "40_000_000"))
MAX_FILE_BYTES = int(os.getenv("PADDLE_MAX_FILE_BYTES", "12_000_000"))
HOST = os.getenv("PADDLE_HOST", "0.0.0.0")
PORT = int(os.getenv("PADDLE_PORT", "8080"))

_engine: PaddleOCR | None = None


def get_engine(lang: str = LANG) -> PaddleOCR:
    global _engine
    if _engine is None:
        t0 = time.time()
        _engine = PaddleOCR(
            use_angle_cls=True, lang=lang, use_gpu=USE_GPU,
            det_db_thresh=0.3, rec_batch_num=6,
        )
        logger.info("PaddleOCR ready in %.1fs", time.time() - t0)
    return _engine


app = FastAPI(title="BSES OCR Sidecar", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET", "POST"], allow_headers=["*"])


@app.get("/health")
async def health() -> dict[str, Any]:
    return {"status": "ok", "engine": "paddleocr", "lang": LANG, "gpu": USE_GPU}


def _decode_image(file_bytes: bytes) -> np.ndarray:
    if len(file_bytes) > MAX_FILE_BYTES:
        raise HTTPException(413, f"File too large ({len(file_bytes)} bytes)")
    try:
        img = Image.open(io.BytesIO(file_bytes))
        img.verify()
        img = Image.open(io.BytesIO(file_bytes)).convert("RGB")
    except Exception as e:
        raise HTTPException(400, f"Invalid image: {e}") from e
    if img.width * img.height > MAX_IMAGE_PIXELS:
        raise HTTPException(400, f"Image too large ({img.width}x{img.height})")
    return np.array(img)


def _run_ocr(img: np.ndarray, lang: str) -> list[dict[str, Any]]:
    engine = get_engine(lang)
    raw = engine.ocr(img, cls=True)
    results: list[dict[str, Any]] = []
    if not raw or not raw[0]:
        return results
    for line in raw[0]:
        box, (text, confidence) = line
        xs = [p[0] for p in box]
        ys = [p[1] for p in box]
        results.append({
            "text": text,
            "confidence": float(confidence),
            "box": {
                "x1": int(min(xs)), "y1": int(min(ys)),
                "x2": int(max(xs)), "y2": int(max(ys)),
                "points": [[int(p[0]), int(p[1])] for p in box],
            },
        })
    return results


@app.post("/ocr")
async def ocr_single(
    file: UploadFile = File(...),
    lang: str = Query(default=LANG, regex="^(en|hi|en\\+hi|en,hi)$"),
) -> dict[str, Any]:
    t0 = time.time()
    file_bytes = await file.read()
    img = _decode_image(file_bytes)
    results = _run_ocr(img, lang.replace("+", ","))
    return {
        "results": results, "count": len(results),
        "width": img.shape[1], "height": img.shape[0],
        "elapsed_ms": round((time.time() - t0) * 1000, 1),
    }


@app.post("/ocr/batch")
async def ocr_batch(
    files: list[UploadFile] = File(...),
    lang: str = Query(default=LANG, regex="^(en|hi|en\\+hi|en,hi)$"),
) -> dict[str, Any]:
    t0 = time.time()
    batch: list[dict[str, Any]] = []
    for f in files:
        file_bytes = await f.read()
        img = _decode_image(file_bytes)
        batch.append({
            "filename": f.filename,
            "results": _run_ocr(img, lang.replace("+", ",")),
            "width": img.shape[1], "height": img.shape[0],
        })
    return {"batch": batch, "count": len(batch), "elapsed_ms": round((time.time() - t0) * 1000, 1)}


if __name__ == "__main__":
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")

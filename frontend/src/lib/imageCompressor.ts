/**
 * Client-side image compressor for the document upload flow.
 *
 * The 2 MB upload cap (see `documentUpload.ts` / `docs/ocr/ocr-upload-limits.md`)
 * is nearly invisible to users because large photos are optimized HERE, in the
 * browser, before anything is sent over the wire:
 *
 *   - JPEG / PNG / WebP files that exceed ~1.5 MB *or* have a long edge over
 *     2000 px are decoded to a canvas, downscaled to a 2000 px max long edge,
 *     and re-encoded as JPEG.
 *   - Quality starts at 80% and steps down 10% at a time to a 50% floor until
 *     the result fits under the 2 MB limit.
 *   - The 2000 px target is far above the 900 px recommended OCR floor, so
 *     readability is not degraded; the backend's own preprocess pass also caps
 *     at ~2000 px, so nothing is lost downstream.
 *   - PDFs and AVIF files are never modified; if compression cannot get an
 *     image under the limit, the original file is returned unchanged and the
 *     existing validation error message explains the rest.
 *
 * No image data ever leaves the device during optimization.
 */

import {
  MAX_FILE_SIZE_BYTES,
  IMAGE_OPTIMIZE_THRESHOLD_BYTES,
  IMAGE_OPTIMIZE_MAX_LONG_EDGE,
  sniffFileType,
  type SniffedType,
} from './documentUpload';

const JPEG_QUALITY_START = 0.8;
const JPEG_QUALITY_MIN = 0.5;
const JPEG_QUALITY_STEP = 0.1;

export interface OptimizeResult {
  /** The file to upload — either the original or the optimized re-encode. */
  file: File;
  /** True when a new optimized file was produced. */
  optimized: boolean;
}

type CanvasImageSourceLike = CanvasImageSource & { width?: number; height?: number };

const isCompressibleImage = (sniffed: SniffedType): boolean =>
  sniffed === 'image/jpeg' || sniffed === 'image/png' || sniffed === 'image/webp';

const readImageDimensions = (file: File): Promise<{ width: number; height: number } | null> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });

/**
 * Decodes a File into a bitmap. `createImageBitmap` is preferred (it applies
 * EXIF orientation, so the baked-in rotation survives re-encoding); a plain
 * `Image` element is the fallback for very old browsers.
 */
const decodeToBitmap = async (file: File): Promise<CanvasImageSourceLike | null> => {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return bitmap as CanvasImageSourceLike;
  } catch {
    return new Promise<CanvasImageSourceLike | null>((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img as CanvasImageSourceLike);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }
};

const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));

/**
 * Optimizes an image file in-browser when it is large or high-resolution.
 * Returns the optimized file, or the original unchanged when no optimization
 * is needed / possible. Callers should show an "Optimizing image…" state while
 * this runs.
 */
export const optimizeImageFile = async (file: File): Promise<OptimizeResult> => {
  const sniffed = await sniffFileType(file);
  if (!isCompressibleImage(sniffed)) {
    return { file, optimized: false };
  }

  const dims = await readImageDimensions(file);
  const longEdge = dims ? Math.max(dims.width, dims.height) : 0;
  const needsOptimization =
    file.size > IMAGE_OPTIMIZE_THRESHOLD_BYTES || longEdge > IMAGE_OPTIMIZE_MAX_LONG_EDGE;
  if (!needsOptimization) {
    return { file, optimized: false };
  }

  const bitmap = await decodeToBitmap(file);
  if (!bitmap) {
    // Cannot decode in this browser — fall through to the normal validation
    // path, which reports dimension/size issues with specific guidance.
    return { file, optimized: false };
  }

  try {
    const width = (bitmap.width ?? 0) || 0;
    const height = (bitmap.height ?? 0) || 0;
    if (width === 0 || height === 0) {
      return { file, optimized: false };
    }

    const scale = Math.min(1, IMAGE_OPTIMIZE_MAX_LONG_EDGE / Math.max(width, height));
    const outWidth = Math.max(1, Math.round(width * scale));
    const outHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return { file, optimized: false };
    }
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, outWidth, outHeight);

    let quality = JPEG_QUALITY_START;
    while (quality >= JPEG_QUALITY_MIN - 1e-9) {
      const blob = await canvasToJpegBlob(canvas, quality);
      if (blob && blob.size > 0 && blob.size <= MAX_FILE_SIZE_BYTES) {
        const baseName = file.name.replace(/\.(jpe?g|png|webp)$/i, '') || 'document';
        const optimizedName = `${baseName}.jpg`;
        return { file: new File([blob], optimizedName, { type: 'image/jpeg' }), optimized: true };
      }
      quality = Math.round((quality - JPEG_QUALITY_STEP) * 10) / 10;
    }

    // Even at the 50% floor the image is too large — hand back the original so
    // the standard "exceeds the 2 MB limit" message explains what to do.
    return { file, optimized: false };
  } finally {
    if (typeof (bitmap as { close?: () => void }).close === 'function') {
      (bitmap as { close: () => void }).close();
    }
  }
};

/**
 * Single entry point used by both upload UIs (apply wizard + connection detail
 * re-upload): optimize when appropriate, then return the file to validate and
 * upload.
 */
export const prepareUploadFile = async (file: File): Promise<OptimizeResult> => optimizeImageFile(file);

/**
 * Client-side document upload checker.
 *
 * Mirrors the backend's enforced limits (see
 * `services/document-service/src/utils/file-safety.ts` and
 * `docs/ocr/ocr-upload-limits.md` — these values must stay in sync) so a bad
 * file is rejected with a specific, actionable message BEFORE it is sent over
 * the wire and burns an OCR cycle.
 */

/** Accepted upload MIME types (magic-byte verified on both sides). */
export const ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;
export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export const ACCEPT_ATTR = ACCEPTED_MIME_TYPES.join(',');

/** Hard server-enforced file size limit (see config `MAX_FILE_SIZE_MB`). */
export const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024;

/**
 * Images at or above this size are auto-optimized in-browser before upload
 * (see `imageCompressor.ts`) so the 2 MB cap is almost never hit on a phone
 * photo. The optimization triggers early enough that it also trims storage.
 */
export const IMAGE_OPTIMIZE_THRESHOLD_BYTES = Math.round(MAX_FILE_SIZE_BYTES * 0.75);

/** Max long edge after in-browser optimization — far above the 900 px OCR floor. */
export const IMAGE_OPTIMIZE_MAX_LONG_EDGE = 2000;

/**
 * Image resolution floor. From the real scan corpus, the smallest image that
 * still produced a usable full extraction was ~740px on the long edge; 500px
 * is the hard floor below which reliable reading is not expected.
 */
export const MIN_IMAGE_DIMENSION = 500;
/** Below this long edge, extraction gets shaky — warn instead of reject. */
export const RECOMMENDED_MIN_DIMENSION = 900;

/** Mirrors the backend's decompression-bomb cap (40 MP). */
export const MAX_DECODED_PIXELS = 40_000_000;

export interface UploadCheck {
  ok: boolean;
  /** Hard problems — the upload must not proceed. */
  errors: string[];
  /** Soft problems — the upload may proceed but quality is at risk. */
  warnings: string[];
}

/** Real file signature from the file's leading bytes. */
export type SniffedType = AcceptedMimeType | null;

export const sniffFileType = async (file: File): Promise<SniffedType> => {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (head.length >= 8 && head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
    return 'image/png';
  }
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return 'image/jpeg';
  }
  const ascii = new TextDecoder('ascii');
  const start = ascii.decode(head.subarray(0, 5));
  if (start === '%PDF-') return 'application/pdf';
  // WebP: `RIFF....WEBP` (bytes 0-3 = RIFF, bytes 8-11 = WEBP).
  if (
    head.length >= 12 &&
    ascii.decode(head.subarray(0, 4)) === 'RIFF' &&
    ascii.decode(head.subarray(8, 12)) === 'WEBP'
  ) {
    return 'image/webp';
  }
  // AVIF (ISO BMFF): `....ftypavif` / `....ftypavis`.
  if (
    head.length >= 12 &&
    ascii.decode(head.subarray(4, 8)) === 'ftyp' &&
    ['avif', 'avis'].includes(ascii.decode(head.subarray(8, 12)))
  ) {
    return 'image/avif';
  }
  return null;
};

/** Loads decoded pixel dimensions for an image File (browser only). */
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
 * Lightweight "is this effectively blank / no contrast" check: draw a small
 * grayscale thumbnail and measure the standard deviation of pixel luminance.
 * A near-zero spread means a blank, blown-out, or mostly-flat image that OCR
 * cannot use — flagged before upload rather than after a failed OCR pass.
 */
const BLANK_STDDEV_THRESHOLD = 12;
const assessContrast = async (file: File): Promise<number> => {
  try {
    const url = URL.createObjectURL(file);
    const bitmap = await createImageBitmap(file);
    URL.revokeObjectURL(url);
    try {
      const scale = Math.min(1, 64 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return 255;
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let i = 0; i < data.length; i += 4) {
        const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        sum += lum;
        sumSq += lum * lum;
        n++;
      }
      if (n === 0) return 255;
      const mean = sum / n;
      return Math.sqrt(sumSq / n - mean * mean);
    } finally {
      bitmap.close();
    }
  } catch {
    // createImageBitmap is unavailable (very old browser) — skip the check.
    return 255;
  }
};

const EXTENSION_HINTS: Record<string, string> = {
  '.heic': 'HEIC/HEIF photos are not supported — please save as JPEG, PNG, WebP, or AVIF.',
  '.heif': 'HEIC/HEIF photos are not supported — please save as JPEG, PNG, WebP, or AVIF.',
  '.bmp': 'BMP images are not supported — please save as JPEG, PNG, WebP, or AVIF.',
  '.gif': 'GIF images are not supported — please save as JPEG, PNG, WebP, or AVIF.',
  '.tiff': 'TIFF images are not supported — please save as JPEG, PNG, WebP, or AVIF.',
  '.tif': 'TIFF images are not supported — please save as JPEG, PNG, WebP, or AVIF.',
};

/**
 * Validates a selected file before upload. Returns specific, actionable
 * messages (not a generic failure) so the user knows exactly what to fix.
 */
export const validateDocumentFile = async (file: File): Promise<UploadCheck> => {
  const errors: string[] = [];
  const warnings: string[] = [];

  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();

  if (file.size === 0) {
    errors.push('This file is empty. Please choose the actual document file.');
    return { ok: false, errors, warnings };
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    errors.push(
      `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB, which exceeds the ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB limit even after automatic optimization. Please use a lower-resolution scan or a smaller file.`,
    );
  }

  const sniffed = await sniffFileType(file);
  if (!sniffed) {
    const hint = EXTENSION_HINTS[ext];
    errors.push(
      hint ??
        `This file is not a readable PDF, JPEG, PNG, WebP, or AVIF image. Please upload a PDF, JPEG, PNG, WebP, or AVIF.`,
    );
    return { ok: errors.length === 0, errors, warnings };
  }

  if (sniffed === 'image/jpeg' && !['.jpg', '.jpeg'].includes(ext)) {
    errors.push('The file is a JPEG image but has a mismatched file extension. Please rename it to .jpg or .jpeg.');
  } else if (sniffed === 'image/png' && ext !== '.png') {
    errors.push('The file is a PNG image but has a mismatched file extension. Please rename it to .png.');
  } else if (sniffed === 'image/webp' && ext !== '.webp') {
    errors.push('The file is a WebP image but has a mismatched file extension. Please rename it to .webp.');
  } else if (sniffed === 'image/avif' && ext !== '.avif') {
    errors.push('The file is an AVIF image but has a mismatched file extension. Please rename it to .avif.');
  } else if (sniffed === 'application/pdf' && ext !== '.pdf') {
    errors.push('The file is a PDF but has a mismatched file extension. Please rename it to .pdf.');
  }

  if (sniffed === 'application/pdf') {
    // PDFs are text-extracted (born-digital documents); no dimension checks.
    if (errors.length === 0) return { ok: true, errors, warnings };
    return { ok: false, errors, warnings };
  }

  // Image quality signals.
  const dims = await readImageDimensions(file);
  if (dims) {
    const longEdge = Math.max(dims.width, dims.height);
    const pixels = dims.width * dims.height;
    if (pixels > MAX_DECODED_PIXELS) {
      errors.push(
        `This image is very large (${dims.width}×${dims.height}px) and cannot be processed. Please resize it and try again.`,
      );
    } else if (longEdge < MIN_IMAGE_DIMENSION) {
      errors.push(
        `This image is only ${longEdge}px on its longest side — too small to read reliably. Please take a closer, higher-resolution photo (at least ${RECOMMENDED_MIN_DIMENSION}px).`,
      );
    } else if (longEdge < RECOMMENDED_MIN_DIMENSION) {
      warnings.push(
        `This image is ${longEdge}px on its longest side. It may still work, but a sharper photo (at least ${RECOMMENDED_MIN_DIMENSION}px) reads much more reliably.`,
      );
    }
  } else {
    warnings.push('Could not inspect this image — it may still fail OCR if it is blurry or too dark.');
  }

  const stddev = await assessContrast(file);
  if (stddev < BLANK_STDDEV_THRESHOLD) {
    warnings.push(
      'This image looks blank or very low-contrast (too dark, washed out, or out of focus). Please retake it in good lighting with the document in sharp focus.',
    );
  }

  return { ok: errors.length === 0, errors, warnings };
};

/** User-facing guidance shown next to upload controls (generated from limits). */
export const uploadGuidanceText = (): string =>
  `Upload a well-lit, sharp photo or scan of the full document with all edges visible — ` +
  `including the QR code, which must not be cropped or covered (it makes Aadhaar/PAN/DL reads far more accurate). ` +
  `Accepted: PDF, JPEG, PNG, WebP, or AVIF up to ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB. ` +
  `Large photos are optimized automatically in your browser. ` +
  `The document should fill most of the frame (at least ${RECOMMENDED_MIN_DIMENSION}px on the longest side), ` +
  `be level (not tilted more than ~10°), and free of glare and shadows.`;

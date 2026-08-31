import sharp from 'sharp';

/**
 * Image preprocessing for Tesseract. Photos of ID cards are typically low
 * contrast, skewed, or shot under bad lighting; feeding them to Tesseract
 * as-is yields poor confidence and garbled field values. This pipeline:
 *
 *   1. Auto-rotates via EXIF and flattens onto white (transparent scans).
 *   2. Resizes to a max dimension ~2000px (Tesseract likes ~300 DPI text).
 *   3. Converts to grayscale and applies a percentile contrast stretch.
 *   4. Binarizes with Otsu's threshold (robust to uneven lighting).
 *   5. Estimates + corrects skew with a Hough-transform vote over the
 *      downscaled binary image, then rotates back to level.
 *
 * All work is done with prebuilt binaries (sharp) + pure JS, so no OCR data
 * leaves the service.
 */

const MAX_DIMENSION = 2000;
const SKEW_SCAN_WIDTH = 512;
// Handheld phone photos of ID cards are frequently tilted well past ±8°, so
// the Hough scan covers ±30°. Rotations beyond that (e.g. 90° portrait shots)
// are outside this estimator's scope.
const SKEW_MIN_DEG = -30;
const SKEW_MAX_DEG = 30;
const SKEW_STEP_DEG = 0.5;
// Horizontal text lines have normals near 90°. We scan the *normal* axis
// because rho = x·cosθ + y·sinθ is constant for points on a line only when θ
// equals the line's normal direction (θ ≈ 90° for near-horizontal text).
const SKEW_NORMAL_CENTER = 90;
/** 300 DPI is a reasonable scan-resolution assumption and silences tesseract's
 *  "Invalid resolution ... dpi" warning on PNGs that carry no DPI metadata. */
const OUTPUT_DENSITY = 300;
/**
 * Decompression-bomb guard: sharp is never allowed to decode more pixels than
 * this. Applied on every decode (including the input) even though the upload
 * path pre-checks dimensions, because `prepareImage` is the one choke point
 * every image passes through and must be safe on its own.
 */
const MAX_DECODED_PIXELS = 40_000_000;

const percentile = (values: Uint8Array, p: number): number => {
  const sorted = Uint8Array.from(values).sort();
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx] ?? 0;
};

const contrastStretch = (pixels: Uint8Array): Uint8Array => {
  const lo = percentile(pixels, 1);
  const hi = percentile(pixels, 99);
  const range = hi - lo || 1;
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) {
    out[i] = Math.max(0, Math.min(255, Math.round((((pixels[i] ?? 0) - lo) / range) * 255)));
  }
  return out;
};

const otsuThreshold = (hist: number[], total: number): number => {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * (hist[i] ?? 0);
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t] ?? 0;
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * (hist[t] ?? 0);
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  return threshold;
};

const otsuBinarize = (pixels: Uint8Array): Uint8Array => {
  const hist = new Array<number>(256).fill(0);
  for (const v of pixels) hist[v] = (hist[v] ?? 0) + 1;
  const threshold = otsuThreshold(hist, pixels.length);
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) out[i] = (pixels[i] ?? 0) < threshold ? 0 : 255;
  return out;
};

/**
 * Hough-transform skew estimate: for each candidate angle, project every dark
 * pixel onto a normal axis and count votes per bin; the angle whose bin peaks
 * highest is the dominant text-line angle. Returns the rotation needed to
 * level the image (degrees, clockwise-positive for sharp's `rotate`).
 */
export const estimateSkew = (pixels: Uint8Array, width: number, height: number): number => {
  const angles: number[] = [];
  for (
    let a = SKEW_NORMAL_CENTER + SKEW_MIN_DEG;
    a <= SKEW_NORMAL_CENTER + SKEW_MAX_DEG + 1e-9;
    a += SKEW_STEP_DEG
  ) {
    angles.push(a);
  }

  const maxRho = Math.ceil(Math.hypot(width, height)) + 1;
  const bins = 2 * maxRho + 1;
  const acc = new Float32Array(bins);

  let bestAngle = SKEW_NORMAL_CENTER;
  let bestScore = 0;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;

  for (const angle of angles) {
    const cosA = Math.cos(toRad(angle));
    const sinA = Math.sin(toRad(angle));
    acc.fill(0);
    let localMax = 0;
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width;
      for (let x = 0; x < width; x++) {
        // Binarized text is dark (0) on white (255) — vote only for ink.
        if ((pixels[rowOffset + x] ?? 255) === 0) {
          const rho = Math.round(x * cosA + y * sinA) + maxRho;
          const votes = (acc[rho] ?? 0) + 1;
          acc[rho] = votes;
          if (votes > localMax) localMax = votes;
        }
      }
    }
    if (localMax > bestScore) {
      bestScore = localMax;
      bestAngle = angle;
    }
  }
  // Normal angle → line angle (α = θ - 90°), then return the inverse rotation
  // that levels the text. sharp's `rotate` is positive-clockwise.
  const lineAngle = bestAngle - SKEW_NORMAL_CENTER;
  return -lineAngle;
};

/**
 * A document preprocessed for OCR, with both the deskewed variant and the
 * straight (no-rotation) variant so the caller can fall back when the skew
 * estimate is unreliable (see `atBoundary`).
 */
export interface PreparedImage {
  /** Preprocessed PNG with the estimated skew rotation applied. */
  deskewedBuffer: Buffer;
  /** Preprocessed PNG with no rotation applied (same binarization). */
  flatBuffer: Buffer;
  /** Estimated line angle (degrees, clockwise-positive for sharp's rotate). */
  skewAngle: number;
  /**
   * True when the skew estimate is pinned at/near the clamped scan edge,
   * which usually means the estimator failed to find text lines rather than
   * that the image is genuinely tilted that far. Callers should compare OCR
   * on `flatBuffer` vs `deskewedBuffer` instead of trusting the rotation.
   */
  atBoundary: boolean;
  width: number;
  height: number;
  /** Fraction of binarized pixels that are ink (dark); a very low or high
   *  value hints at a blank/blurred or inverted/overexposed input. */
  inkRatio: number;
}

export const prepareImage = async (input: Buffer): Promise<PreparedImage> => {
  // Note: metadata is NEVER copied forward. We decode the input to raw pixels,
  // re-encode a fresh PNG carrying only the 300 DPI density marker — so any
  // EXIF, XMP, ICC or embedded script metadata is discarded before OCR or
  // storage sees a single processed pixel.
  const rotated = sharp(input, { failOn: 'none', limitInputPixels: MAX_DECODED_PIXELS, sequentialRead: true }).rotate().flatten({ background: '#ffffff' });
  const meta = await rotated.metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  // Reject (rather than decode) images whose header advertises absurd
  // dimensions — the cheap check the upload middleware also performs.
  if (width * height > MAX_DECODED_PIXELS || width > 12_000 || height > 12_000) {
    throw new Error(`Image exceeds the ${MAX_DECODED_PIXELS} pixel decode limit (${width}x${height}).`);
  }
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height, 1));

  const { data, info } = await rotated
    .resize(Math.round((width * scale) / 4) * 4 || 4, Math.round((height * scale) / 4) * 4 || 4, {
      fit: 'inside',
      withoutEnlargement: true,
    })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const stretched = contrastStretch(data);
  const binarized = otsuBinarize(stretched);

  let dark = 0;
  for (let i = 0; i < binarized.length; i++) if (binarized[i] === 0) dark++;
  const inkRatio = dark / binarized.length;

  // Cheap skew pass on a small copy so the Hough scan stays fast.
  const skewWidth = Math.min(SKEW_SCAN_WIDTH, info.width);
  const skewHeight = Math.max(1, Math.round(info.height * (skewWidth / info.width)));
  const skewCopy = await sharp(Buffer.from(binarized), {
    raw: { width: info.width, height: info.height, channels: 1 },
  })
    .resize(skewWidth, skewHeight, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const skewAngle = estimateSkew(skewCopy.data, skewCopy.info.width, skewCopy.info.height);
  const atBoundary = Math.abs(skewAngle) >= SKEW_MAX_DEG - SKEW_STEP_DEG;

  const encode = (rotateBy: number): Promise<Buffer> =>
    sharp(Buffer.from(binarized), {
      raw: { width: info.width, height: info.height, channels: 1 },
    })
      .rotate(rotateBy, { background: '#ffffff' })
      .withMetadata({ density: OUTPUT_DENSITY })
      .png()
      .toBuffer();

  const [deskewedBuffer, flatBuffer] = await Promise.all([encode(skewAngle), encode(0)]);

  return { deskewedBuffer, flatBuffer, skewAngle, atBoundary, width: info.width, height: info.height, inkRatio };
};

export const preprocessImage = async (input: Buffer): Promise<Buffer> => {
  return (await prepareImage(input)).deskewedBuffer;
};

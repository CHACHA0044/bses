import sharp from 'sharp';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'ocr-image-quality' });

/**
 * Image-quality scoring for the document pipeline.
 *
 * The scanner runs on a downscaled grayscale copy (bounded memory), so
 * dimensions here are cheap heuristics, not forensic analysis. Output is a
 * structured 0–1 score per signal plus an `issues` list of machine-readable
 * tags that the pipeline/UI can translate into actionable guidance
 * ("Move to a brighter area", "Move the camera closer", etc.).
 *
 * Signals:
 *   - blur: Laplacian variance (high variance => sharp edges)
 *   - brightness: mean gray level, scored against a print-friendly target
 *   - contrast: pixel standard deviation
 *   - resolution: decoded long-edge, scored against the 900 px OCR floor
 *   - glare: fraction of specular (>245) pixels
 *   - inkRatio: fraction of dark pixels in the binarized variant (from preprocess)
 *   - skew: absolute rotation the preprocessor estimated (from preprocess)
 *
 * The weights are intentionally conservative: blur and contrast dominate
 * because they correlate most strongly with OCR success on card photos.
 */

export interface QualityInput {
  /** Original image bytes (EXIF-aware decode, decompression-bomb guarded). */
  buffer: Buffer;
  /** Binarized ink ratio (0..1) from the preprocessing pass, if available. */
  inkRatio?: number;
  /** Estimated skew angle in degrees from the preprocessing pass, if available. */
  skewAngle?: number;
}

export interface ImageQualityScore {
  overall: number;
  blur: number;
  brightness: number;
  contrast: number;
  resolution: number;
  glare: number;
  inkRatio: number;
  skewAbs: number;
  /** Machine-readable issue tags, e.g. 'BLURRY', 'TOO_DARK', 'GLARE'. */
  issues: string[];
}

const MAX_ANALYSIS_DIMENSION = 900;
const MAX_DECODED_PIXELS = 40_000_000;

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

/** Scored gaussian peak: 1.0 at `center`, falling off with `width`. */
const gaussian = (x: number, center: number, width: number): number =>
  clamp01(Math.exp(-((x - center) * (x - center)) / (2 * width * width)));

/** Laplacian variance — a standard blur/sharpness proxy. */
const laplacianVariance = (gray: Uint8Array, width: number, height: number): number => {
  if (width < 3 || height < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  const n = (width - 2) * (height - 2);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap =
        gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      sum += lap;
      sumSq += lap * lap;
    }
  }
  const mean = sum / n;
  return Math.max(0, sumSq / n - mean * mean);
};

/**
 * Assesses the quality of a document image. `buffer` is decoded with EXIF
 * rotation applied onto a white background (matching the OCR path). The scan
 * is capped at 900 px so it costs almost nothing in memory/time.
 */
export const assessImageQuality = async (input: QualityInput): Promise<ImageQualityScore> => {
  try {
    return await assessImageQualityInner(input);
  } catch (err) {
    // A quality-scan failure (undecodable buffer, sharp error) must never
    // abort the OCR pipeline — the OCR path has its own error handling and
    // will fail/retry with a precise reason. Report a neutral score with no
    // gating issues so the decision engine is not misled.
    logger.warn('Image quality scan failed; using neutral score', {
      error: err instanceof Error ? err.message : String(err),
    });
    const clampedInk = input.inkRatio == null ? -1 : Math.max(0, Math.min(1, input.inkRatio));
    return {
      overall: 0.8,
      blur: 0.8,
      brightness: 0.8,
      contrast: 0.8,
      resolution: 0.8,
      glare: 0.8,
      inkRatio: clampedInk,
      skewAbs: input.skewAngle == null ? 0 : Math.abs(input.skewAngle),
      issues: [],
    };
  }
};

const assessImageQualityInner = async (input: QualityInput): Promise<ImageQualityScore> => {
  const { buffer, inkRatio, skewAngle } = input;
  const issues: string[] = [];
  const clampedInk = inkRatio == null ? -1 : clamp01(inkRatio);
  const skewAbs = skewAngle == null ? 0 : Math.abs(skewAngle);

  const meta = await sharp(buffer, { failOn: 'none', limitInputPixels: MAX_DECODED_PIXELS }).metadata();
  const rawWidth = meta.width ?? 0;
  const rawHeight = meta.height ?? 0;
  const longEdge = Math.max(rawWidth, rawHeight);
  const resolution = clamp01((longEdge - 300) / 1200); // 300px => 0, 1500px+ => 1

  const { data, info } = await sharp(buffer, {
    failOn: 'none',
    limitInputPixels: MAX_DECODED_PIXELS,
    sequentialRead: true,
  })
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize({ width: MAX_ANALYSIS_DIMENSION, height: MAX_ANALYSIS_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const gray = data instanceof Uint8Array ? data : new Uint8Array(data);
  const width = info.width;
  const height = info.height;

  let sum = 0;
  let sumSq = 0;
  let specular = 0;
  for (let i = 0; i < gray.length; i++) {
    const v = gray[i]!;
    sum += v;
    sumSq += v * v;
    if (v > 245) specular++;
  }
  const n = Math.max(1, gray.length);
  const mean = sum / n;
  const stddev = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  const specularFrac = specular / n;

  const blur = clamp01(laplacianVariance(gray, width, height) / 450);
  const brightness = gaussian(mean, 200, 85);
  const contrast = clamp01(stddev / 70);
  const glare = clamp01(1 - specularFrac * 12);

  if (blur < 0.45) issues.push('BLURRY');
  if (brightness < 0.4) issues.push('TOO_DARK');
  if (mean > 235 && specularFrac > 0.3) issues.push('OVEREXPOSED');
  if (glare < 0.55) issues.push('GLARE');
  if (contrast < 0.4) issues.push('LOW_CONTRAST');
  if (resolution < 0.5) issues.push('LOW_RESOLUTION');
  if (skewAbs > 8) issues.push('SKEWED');
  if (clampedInk > 0 && clampedInk < 0.03) issues.push('BLANK_OR_OVEREXPOSED');
  if (clampedInk > 0.55) issues.push('DARK_OR_INVERTED');
  if (longEdge > 0 && longEdge < 500) issues.push('TOO_SMALL');

  const inkScore = clampedInk >= 0 ? gaussian(clampedInk, 0.18, 0.1) : 0.8;
  const skewScore = skewAngle == null ? 0.9 : clamp01(1 - skewAbs / 40);

  const overall = Math.round(
    (blur * 0.3 +
      contrast * 0.2 +
      brightness * 0.15 +
      resolution * 0.15 +
      glare * 0.1 +
      inkScore * 0.05 +
      skewScore * 0.05) * 100,
  ) / 100;

  return {
    overall,
    blur: Math.round(blur * 100) / 100,
    brightness: Math.round(brightness * 100) / 100,
    contrast: Math.round(contrast * 100) / 100,
    resolution: Math.round(resolution * 100) / 100,
    glare: Math.round(glare * 100) / 100,
    inkRatio: clampedInk,
    skewAbs: Math.round(skewAbs * 10) / 10,
    issues,
  };
};
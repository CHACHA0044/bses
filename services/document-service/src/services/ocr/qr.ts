import jsQR from 'jsqr';
import sharp from 'sharp';

/**
 * QR code location + decoding for document photos.
 *
 * Uses jsQR (pure JS, no native bindings) over sharp-decoded RGBA pixels.
 * Decoding is attempted on several views so an angled or low-contrast photo
 * still has a chance:
 *
 *   1. the original image (auto-rotated + flattened onto white),
 *   2. any additional candidates passed in (typically the preprocessor's
 *      deskewed and/or straight binarized variants — already near-level, which
 *      is ideal for QR finder patterns),
 *   3. a 2x upscale of any candidate whose long edge is small, since jsQR
 *      needs enough pixels per module to lock onto a QR.
 *
 * Work is bounded like the rest of the pipeline: sharp decodes with
 * `limitInputPixels` and everything is resized to a hard cap, so an attacker
 * cannot force unbounded CPU/memory in this step either.
 */

const MAX_DECODED_PIXELS = 40_000_000;
const MAX_DIMENSION = 2000;
/** Candidates with a long edge under this get a 2x upscale retry. */
const UPSCALE_LONG_EDGE = 1200;
const UPSCALE_FACTOR = 2;

interface RgbaView {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const toRgba = async (buffer: Buffer, scale: number): Promise<RgbaView | null> => {
  try {
    const { data, info } = await sharp(buffer, {
      failOn: 'none',
      limitInputPixels: MAX_DECODED_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(
        Math.round(MAX_DIMENSION * scale) || 4,
        Math.round(MAX_DIMENSION * scale) || 4,
        { fit: 'inside', withoutEnlargement: scale <= 1 },
      )
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    if (info.width <= 0 || info.height <= 0) return null;
    return {
      data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
      width: info.width,
      height: info.height,
    };
  } catch {
    return null;
  }
};

const attemptDecode = (view: RgbaView): string | null => {
  try {
    const result = jsQR(view.data, view.width, view.height);
    return result?.data ?? null;
  } catch {
    return null;
  }
};

/**
 * Decodes a QR payload from one or more image buffers, returning the raw
 * payload string or `null`. Candidates are tried in order and the first hit
 * wins; each candidate also gets a small-image upscale retry. Never throws.
 */
export const decodeQrFromImage = async (inputs: Buffer[]): Promise<string | null> => {
  for (const input of inputs) {
    const base = await toRgba(input, 1);
    if (!base) continue;

    let hit = attemptDecode(base);
    if (hit) return hit;

    if (Math.max(base.width, base.height) < UPSCALE_LONG_EDGE) {
      const upscaled = await toRgba(input, UPSCALE_FACTOR);
      if (upscaled) {
        hit = attemptDecode(upscaled);
        if (hit) return hit;
      }
    }
  }
  return null;
};

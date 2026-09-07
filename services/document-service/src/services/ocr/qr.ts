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
/** Candidates whose long edge is under this get an upscale retry. */
const UPSCALE_LONG_EDGE = 1200;
/** Upscale retry long-edge target — bounded so an RGBA view never exceeds
 *  MAX_DIMENSION (≈16 MB worst case at 2000²×4b) on a 512 MB container. */
const UPSCALE_TARGET = 2000;

interface RgbaView {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const toRgba = async (
  buffer: Buffer,
  maxDimension: number,
  allowEnlarge: boolean,
): Promise<RgbaView | null> => {
  try {
    const { data, info } = await sharp(buffer, {
      failOn: 'none',
      limitInputPixels: MAX_DECODED_PIXELS,
      sequentialRead: true,
    })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(
        Math.round(maxDimension) || 4,
        Math.round(maxDimension) || 4,
        { fit: 'inside', withoutEnlargement: !allowEnlarge },
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
 * wins; each candidate also gets a bounded small-image upscale retry when its
 * long edge is under `UPSCALE_LONG_EDGE`. Never throws. The RGBA view from a
 * decoded candidate is dropped before the next candidate is decoded, so at
 * most one full-size RGBA buffer is alive at a time.
 */
export const decodeQrFromImage = async (inputs: Buffer[]): Promise<string | null> => {
  for (const input of inputs) {
    let base = await toRgba(input, MAX_DIMENSION, false);
    if (!base) continue;

    let hit = attemptDecode(base);
    base.data = new Uint8ClampedArray(0);
    if (hit) return hit;

    if (Math.max(base.width, base.height) < UPSCALE_LONG_EDGE) {
      const upscaled = await toRgba(input, UPSCALE_TARGET, true);
      if (upscaled) {
        hit = attemptDecode(upscaled);
        upscaled.data = new Uint8ClampedArray(0);
        if (hit) return hit;
      }
    }
  }
  return null;
};

import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { estimateSkew, preprocessImage } from '../../../src/services/ocr/preprocess';

/** Builds a grayscale buffer containing a single dark line at the given angle. */
const lineImage = (width: number, height: number, angleDeg: number): Uint8Array => {
  const pixels = new Uint8Array(width * height).fill(255);
  const rad = (angleDeg * Math.PI) / 180;
  const slope = Math.tan(rad);
  const centerY = height / 2;
  for (let x = 0; x < width; x++) {
    const y = Math.round(centerY + slope * (x - width / 2));
    if (y >= 0 && y < height) {
      pixels[y * width + x] = 0;
    }
  }
  return pixels;
};

describe('estimateSkew', () => {
  it('returns ~0 for a horizontal line', () => {
    const pixels = lineImage(400, 400, 0);
    expect(Math.abs(estimateSkew(pixels, 400, 400))).toBeLessThanOrEqual(1);
  });

  it('returns a negative rotation for a positively tilted line', () => {
    const pixels = lineImage(400, 400, 5);
    const angle = estimateSkew(pixels, 400, 400);
    expect(angle).toBeLessThan(0);
    expect(Math.abs(angle)).toBeCloseTo(5, 0);
  });
});

describe('preprocessImage', () => {
  it('runs the full pipeline and returns a PNG', async () => {
    const input = await sharp({
      create: { width: 240, height: 120, channels: 3, background: { r: 190, g: 195, b: 200 } },
    })
      .png()
      .toBuffer();

    const out = await preprocessImage(input);
    const pngSig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(out.subarray(0, 8).equals(pngSig)).toBe(true);
  });

  it('handles a small image without throwing', async () => {
    const input = await sharp({
      create: { width: 12, height: 8, channels: 3, background: { r: 255, g: 255, b: 255 } },
    })
      .png()
      .toBuffer();

    const out = await preprocessImage(input);
    expect(out.length).toBeGreaterThan(0);
  });
});

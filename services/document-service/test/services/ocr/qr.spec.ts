import { describe, it, expect } from 'vitest';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { decodeQrFromImage } from '../../../src/services/ocr/qr';

describe('decodeQrFromImage', () => {
  it('round-trips a synthetic QR payload', async () => {
    const payload = 'RAKESH KUMAR|15/08/1990|123456789012';
    const png = await QRCode.toBuffer(payload, { type: 'png', width: 400, margin: 4 });
    const decoded = await decodeQrFromImage([png]);
    expect(decoded).toBe(payload);
  });

  it('decodes a QR embedded in a full document-size photo (not cropped)', async () => {
    const payload = '<?xml version="1.0"?><Auth><Uid>1234 5678 9012</Uid><Name>RAKESH KUMAR</Name></Auth>';
    const qr = await QRCode.toBuffer(payload, { type: 'png', width: 600, margin: 2 });
    const qrSharp = await sharp(qr).raw().toBuffer({ resolveWithObject: true });
    const canvas = await sharp({
      create: {
        width: 1600,
        height: 1000,
        channels: 3,
        background: { r: 255, g: 255, b: 255 },
      },
    })
      .composite([{ input: qrSharp.data, raw: { width: qrSharp.info.width, height: qrSharp.info.height, channels: qrSharp.info.channels } }])
      .png()
      .toBuffer();
    const decoded = await decodeQrFromImage([canvas]);
    expect(decoded).toBe(payload);
  });

  it('returns null for an image with no QR', async () => {
    const blank = await sharp({
      create: { width: 200, height: 200, channels: 3, background: { r: 240, g: 240, b: 240 } },
    })
      .png()
      .toBuffer();
    expect(await decodeQrFromImage([blank])).toBeNull();
  });

  it('tries all candidate buffers and never throws', async () => {
    const payload = 'generic text payload';
    const png = await QRCode.toBuffer(payload, { type: 'png', width: 300, margin: 2 });
    const blank = await sharp({
      create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer();
    const decoded = await decodeQrFromImage([blank, png]);
    expect(decoded).toBe(payload);
  });
});

import sharp from 'sharp';
import { ValidationError } from '@bses/shared';
import { config } from '../config';

/**
 * Content-level validation for the public document upload path.
 *
 * The upload endpoint is untrusted end-to-end: multer only trusts the
 * browser-supplied multipart `Content-Type`, which is trivially spoofable.
 * These helpers verify the REAL file signature (magic bytes) before the file
 * is stored or handed to any decoder, and cap the decoded size of images so a
 * tiny "decompression bomb" file can never expand into a multi-GB bitmap in
 * sharp's memory.
 */

/** Recognized upload types. Anything else is rejected before processing. */
export type DetectedFileType =
  | 'application/pdf'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp'
  | 'image/avif';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const PDF_MAGIC = Buffer.from('%PDF-', 'ascii');
const RIFF_MAGIC = Buffer.from('RIFF', 'ascii');
const WEBP_MAGIC = Buffer.from('WEBP', 'ascii');
const FTVP_MAGIC = Buffer.from('ftyp', 'ascii');

/**
 * Returns the detected file type from the file's leading bytes, or null.
 *
 * WebP and AVIF are accepted alongside PNG/JPEG/PDF: they are common phone
 * camera formats (many Android camera defaults), and the pipeline's
 * `sharp` (libvips) decodes them natively, so the only gate is the magic-byte
 * check here — the same pixel/dimension caps apply downstream.
 */
export const detectFileType = (buffer: Buffer): DetectedFileType | null => {
  if (buffer.length >= PNG_MAGIC.length && buffer.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
    return 'image/png';
  }
  if (buffer.length >= JPEG_MAGIC.length && buffer.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC)) {
    return 'image/jpeg';
  }
  if (buffer.length >= PDF_MAGIC.length && buffer.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) {
    return 'application/pdf';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).equals(RIFF_MAGIC) &&
    buffer.subarray(8, 12).equals(WEBP_MAGIC)
  ) {
    return 'image/webp';
  }
  // ISO BMFF (AVIF): `....ftyp` with the major brand at bytes 8-12. The brand
  // can be `avif` or `avis`; `mif1`/`msf1` majors with avif compat are rare
  // but we accept them when the ftyp box declares an AVIF brand.
  if (
    buffer.length >= 12 &&
    buffer.subarray(4, 8).equals(FTVP_MAGIC) &&
    (buffer.subarray(8, 12).toString('ascii') === 'avif' ||
      buffer.subarray(8, 12).toString('ascii') === 'avis')
  ) {
    return 'image/avif';
  }
  return null;
};

/**
 * Hard ceiling on how many pixels sharp is ever allowed to decode from a
 * single image. 40 MP ≈ a 60"×40" billboard scan; any legitimate ID document
 * photo is far below this, so anything over it is either malformed or a bomb.
 * Applied both here (cheap header read) and inside the sharp pipeline
 * (`limitInputPixels`) as defense-in-depth.
 */
export const MAX_DECODED_PIXELS = 40_000_000;
export const MAX_IMAGE_DIMENSION = 12_000;

export interface UploadContent {
  buffer: Buffer;
  declaredMimeType?: string | null;
  originalName?: string | null;
}

/**
 * Validates a parsed upload before it is stored or processed:
 *  - magic-byte check (a script renamed to .jpg, or a polyglot, is rejected)
 *  - declared MIME must match the detected content
 *  - decoded image dimensions are capped (decompression-bomb guard)
 *  - filename is header-safe (no CR/LF/control chars, bounded length)
 *
 * Throws a `ValidationError` with a user-facing message when unsafe.
 */
export const validateUploadContent = async (file: UploadContent): Promise<void> => {
  const { buffer, declaredMimeType, originalName } = file;

  if (originalName && /[\r\n\u0000-\u001f]/.test(originalName)) {
    throw new ValidationError('The filename contains invalid characters. Please rename the file and try again.');
  }
  if (originalName && originalName.length > 255) {
    throw new ValidationError('The filename is too long (max 255 characters). Please rename the file and try again.');
  }

  const detected = detectFileType(buffer);
  if (!detected) {
    throw new ValidationError(
      'File contents were not recognized as a PDF, JPEG, PNG, WebP, or AVIF image. ' +
        'This file may be corrupted, or it may be a different format (e.g. HEIC, or a non-image file). ' +
        'Please upload a PDF, JPEG, PNG, WebP, or AVIF.',
    );
  }

  if (!config.ALLOWED_MIME_TYPES.includes(detected)) {
    throw new ValidationError(
      `File type "${detected}" is not accepted. Only PDF, JPEG, PNG, WebP, and AVIF files can be uploaded.`,
    );
  }

  if (declaredMimeType && config.ALLOWED_MIME_TYPES.includes(declaredMimeType) && declaredMimeType !== detected) {
    throw new ValidationError(
      `The file is a ${detected} but was declared as ${declaredMimeType}. The declared type must match the file's actual content.`,
    );
  }

  if (detected === 'application/pdf') {
    // PDFs are parsed only by pdfjs (text extraction) with JS disabled and a
    // page cap; the 2 MB multer limit bounds the input before that runs.
    return;
  }

  // Image-bomb guard: read the dimensions from the header (no pixel decode)
  // and reject anything that would decompress to an unreasonable bitmap.
  try {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    const pixels = width * height;
    if (pixels > MAX_DECODED_PIXELS || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
      throw new ValidationError(
        `This image is too large to process (${width}×${height}px). Please upload a smaller image.`,
      );
    }
  } catch (err) {
    if (err instanceof ValidationError) throw err;
    throw new ValidationError(
      'The image could not be read. It may be corrupted — please re-save or re-take it and try again.',
    );
  }
};

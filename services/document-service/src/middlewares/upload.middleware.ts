import multer from 'multer';
import { ValidationError } from '@bses/shared';
import path from 'path';
import { config } from '../config';

/**
 * Multipart parsing for the document upload endpoint.
 *
 * Multer trusts the browser-supplied `Content-Type` here ONLY to reject
 * obviously-wrong parts early and keep the buffer small; the real gate is
 * `validateUploadContentMiddleware`, which inspects magic bytes after the
 * buffer is available. Size is capped from env (`MAX_FILE_SIZE_MB`).
 */
const ALLOWED_TYPES = config.ALLOWED_MIME_TYPES;
const MAX_SIZE_BYTES = config.MAX_FILE_SIZE_MB * 1024 * 1024;

export const sanitizeFilename = (filename: string): string => {
  const extension = path.extname(filename).toLowerCase();
  const basename = path.basename(filename, extension).replace(/[^a-zA-Z0-9_-]/g, '_');
  return `${basename}_${Date.now()}${extension}`;
};

const storage = multer.memoryStorage();

export const uploadMiddleware = multer({
  storage,
  limits: {
    fileSize: MAX_SIZE_BYTES,
    files: 1,
    fields: 10,
    parts: 20,
    fieldSize: 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new ValidationError('Invalid file type. Only PDF, JPEG, PNG, WebP, and AVIF files are accepted.'));
    }
    cb(null, true);
  },
}).single('file');

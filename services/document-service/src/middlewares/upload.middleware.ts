import multer from 'multer';
import { ValidationError } from '@bses/shared';
import path from 'path';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

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
  },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_TYPES.includes(file.mimetype)) {
      return cb(new ValidationError('Invalid file type. Only PDF, JPEG, and PNG files are accepted.'));
    }
    cb(null, true);
  },
}).single('file');

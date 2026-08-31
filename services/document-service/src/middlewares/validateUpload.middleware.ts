import type { Request, Response, NextFunction } from 'express';
import { ValidationError } from '@bses/shared';
import { validateUploadContent } from '../utils/file-safety';

/**
 * Content validation that runs AFTER multer has buffered the file, so it can
 * inspect the real bytes (magic numbers) rather than the spoofable
 * `Content-Type` header. Mounted between multer and the controller on the
 * upload route only.
 */
export const validateUploadContentMiddleware = (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.file) {
    // Multer's `.single('file')` rejects requests without a file; this only
    // fires on requests that slipped through, so a guard is still cheap.
    return next(new ValidationError('No document file uploaded'));
  }
  validateUploadContent({
    buffer: req.file.buffer,
    declaredMimeType: req.file.mimetype,
    originalName: req.file.originalname,
  })
    .then(() => next())
    .catch((err: unknown) => next(err));
};

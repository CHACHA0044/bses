import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { sendError, ValidationError } from '@bses/shared';
import { documentController } from '../controllers/document.controller';
import { uploadMiddleware } from '../middlewares/upload.middleware';
import { validateUploadContentMiddleware } from '../middlewares/validateUpload.middleware';
import { uploadRateLimiter } from '../middlewares/uploadRateLimit.middleware';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

/**
 * Upload route — wraps multer explicitly so a malformed or truncated multipart
 * body (e.g. an interrupted browser upload, or a body that was corrupted in
 * transit) yields a clean 4xx response instead of surfacing as an unhandled
 * multer/busboy error. Multer forwards parser failures (including busboy's
 * "Unexpected end of form") to its callback; a generic 500 or a crashed request
 * connection there cascades into gateway 503s for unrelated traffic.
 */
const handleUpload = (req: Request, res: Response, next: NextFunction): void => {
  uploadMiddleware(req, res, (err: unknown) => {
    if (err) {
      if (err instanceof ValidationError) {
        return sendError(res, err.code, err.message, err.statusCode, err.errors);
      }
      const statusCode = (err as { statusCode?: number })?.statusCode ?? 400;
      const message = err instanceof Error ? err.message : 'Invalid file upload';
      return sendError(res, 'UPLOAD_ERROR', message, statusCode);
    }
    next();
  });
};

router.post(
  '/upload',
  authenticate,
  uploadRateLimiter,
  handleUpload,
  validateUploadContentMiddleware,
  documentController.upload,
);
router.get('/', authenticate, documentController.getMyDocuments);
router.patch('/:id/extracted-data', authenticate, documentController.updateExtractedData);
router.get('/:id', authenticate, documentController.getDocument);
router.delete('/:id', authenticate, documentController.deleteDocument);
router.get('/user/:id', authenticate, documentController.getUserDocuments);

export default router;

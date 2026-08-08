import { Router } from 'express';
import { documentController } from '../controllers/document.controller';
import { uploadMiddleware } from '../middlewares/upload.middleware';
import { authenticate } from '../middlewares/auth.middleware';

const router = Router();

router.post('/upload', authenticate, uploadMiddleware, documentController.upload);
router.get('/:id', authenticate, documentController.getDocument);
router.delete('/:id', authenticate, documentController.deleteDocument);
router.get('/user/:id', authenticate, documentController.getUserDocuments);

export default router;

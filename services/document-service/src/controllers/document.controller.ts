import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, ValidationError, NotFoundError } from '@bses/shared';
import { documentService } from '../services/document.service';
import { DocumentType } from '@prisma/client';

export class DocumentController {
  public upload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.file) {
        throw new ValidationError('No document file uploaded');
      }

      const userId = req.user!.sub;
      const { connectionRequestId, documentType } = req.body as { connectionRequestId?: string; documentType: DocumentType };

      if (!documentType || !Object.values(DocumentType).includes(documentType)) {
        throw new ValidationError('Valid documentType is required');
      }

      const document = await documentService.uploadDocument({
        userId,
        connectionRequestId: connectionRequestId || null,
        documentType,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
      });

      sendCreated(res, { document }, 'Document uploaded successfully');
    } catch (err) {
      next(err);
    }
  };

  public getDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { stream, metadata } = await documentService.getDocumentStream(id!);

      res.setHeader('Content-Type', metadata.mimeType);
      res.setHeader('Content-Disposition', `inline; filename="${metadata.documentName}"`);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  };

  public deleteDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user!.sub;
      const { id } = req.params;

      await documentService.deleteDocument(id!, userId);
      sendSuccess(res, null, 'Document deleted successfully');
    } catch (err) {
      next(err);
    }
  };

  public getUserDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const documents = await documentService.getUserDocuments(id!);
      sendSuccess(res, { documents });
    } catch (err) {
      next(err);
    }
  };
}

export const documentController = new DocumentController();

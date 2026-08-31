import type { Request, Response, NextFunction } from 'express';
import { sendSuccess, sendCreated, ValidationError, NotFoundError, toDocumentView } from '@bses/shared';
import { documentService } from '../services/document.service';
import { DocumentType } from '@prisma/client';
import { z } from 'zod';

const isAdminRole = (role: string | undefined): boolean =>
  role === 'ADMIN' || role === 'SUPER_ADMIN';

const extractedFieldSchema = z
  .object({
    aadhaar: z.string().regex(/^\d{12}$/, 'Aadhaar must be 12 digits').optional(),
    pan: z.string().regex(/^[A-Z]{5}\d{4}[A-Z]$/, 'PAN must match the format ABCDE1234F').optional(),
    name: z.string().trim().min(2).max(120).optional(),
    dob: z.string().regex(/^\d{2}[/-]\d{2}[/-]\d{4}$/, 'Date must be in DD/MM/YYYY format').optional(),
    fatherName: z.string().trim().min(2).max(120).optional(),
    licenseNumber: z.string().trim().min(6).max(40).optional(),
    address: z.string().trim().min(5).max(500).optional(),
    validity: z.string().regex(/^\d{2}[/-]\d{2}[/-]\d{4}$/, 'Date must be in DD/MM/YYYY format').optional(),
  })
  .refine((fields) => Object.values(fields).some((v) => v !== undefined), {
    message: 'At least one extracted field must be provided',
  });

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

      sendCreated(
        res,
        { document: toDocumentView(document, { includeSensitive: isAdminRole(req.user?.role) }) },
        'Document uploaded successfully',
      );
    } catch (err) {
      next(err);
    }
  };

  public getDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const { stream, metadata } = await documentService.getDocumentStream(id!, req.user!);

      res.setHeader('Content-Type', metadata.mimeType);
      // The stored name is user-controlled upload metadata — strip anything
      // that could break out of the header value (CR/LF/control chars/quotes)
      // before it is echoed into Content-Disposition.
      const headerSafeName = (metadata.documentName ?? 'document')
        .replace(/[\r\n"\u0000-\u001f]/g, '_')
        .slice(0, 200);
      res.setHeader('Content-Disposition', `inline; filename="${headerSafeName}"`);
      stream.pipe(res);
    } catch (err) {
      next(err);
    }
  };

  public deleteDocument = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;

      await documentService.deleteDocument(id!, req.user!.sub, req.user!.role);
      sendSuccess(res, null, 'Document deleted successfully');
    } catch (err) {
      next(err);
    }
  };

  public getUserDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const documents = await documentService.getUserDocuments(id!, req.user!);
      sendSuccess(res, { documents });
    } catch (err) {
      next(err);
    }
  };

  public getMyDocuments = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const documents = await documentService.getMyDocuments(req.user!);
      sendSuccess(res, { documents });
    } catch (err) {
      next(err);
    }
  };

  public updateExtractedData = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { id } = req.params;
      const parsed = extractedFieldSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        const errors: Record<string, string[]> = {};
        for (const e of parsed.error.errors) {
          const key = String(e.path[0] ?? 'fields');
          errors[key] = [...(errors[key] ?? []), e.message];
        }
        throw new ValidationError('Invalid extracted field values', errors);
      }

      const document = await documentService.updateExtractedData(id!, req.user!, parsed.data as Record<string, string>);
      sendSuccess(res, { document }, 'Extracted data corrected successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const documentController = new DocumentController();

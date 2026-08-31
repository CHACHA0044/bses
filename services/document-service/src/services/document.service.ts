import { ObjectId } from 'mongodb';
import { DocumentType, DocumentStatus, Document, WorkflowActionType, ConnectionStatus } from '@prisma/client';
import { NotFoundError, ForbiddenError, ValidationError, UserRole, createLogger, toDocumentView, toDocumentViews } from '@bses/shared';
import { getGridFSBucket } from '../db/mongo.client';
import { getPrismaClient } from '../db/db.client';
import { sanitizeFilename } from '../middlewares/upload.middleware';
import { encryptionService } from '@bses/shared';
import { Readable } from 'stream';
import { ocrService } from './ocr.service';

const logger = createLogger({ service: 'document-service-logic' });

export interface UploadDocumentDTO {
  userId: string;
  connectionRequestId?: string | null;
  documentType: DocumentType;
  fileBuffer: Buffer;
  originalName: string;
  mimeType: string;
  fileSize: number;
}

/** Actor carrying the authenticated caller's identity (from the JWT payload). */
export interface DocumentActor {
  sub: string;
  role: string;
}

const isAdmin = (role: string): boolean => role === UserRole.ADMIN || role === UserRole.SUPER_ADMIN;

export class DocumentService {
  private get prisma() {
    return getPrismaClient();
  }

  public async uploadDocument(dto: UploadDocumentDTO): Promise<Document> {    const bucket = getGridFSBucket();
    const safeFilename = sanitizeFilename(dto.originalName);

    // 1. Stream binary buffer to MongoDB GridFS — encrypted at rest.
    const encryptedBuffer = encryptionService.encryptBuffer(dto.fileBuffer);
    const uploadStream = bucket.openUploadStream(safeFilename, {
      metadata: {
        userId: dto.userId,
        documentType: dto.documentType,
        originalName: dto.originalName,
        mimeType: dto.mimeType,
        encrypted: true,
      },
    });

    const readable = Readable.from(encryptedBuffer);
    await new Promise((resolve, reject) => {
      readable.pipe(uploadStream).on('finish', resolve).on('error', reject);
    });

    const gridfsFileId = uploadStream.id.toString();

    // 2. Insert metadata record into PostgreSQL documents table
    const document = await this.prisma.document.create({
      data: {
        userId: dto.userId,
        connectionRequestId: dto.connectionRequestId || null,
        documentName: dto.originalName,
        documentType: dto.documentType,
        gridfsFileId,
        fileSize: dto.fileSize,
        mimeType: dto.mimeType,
        status: DocumentStatus.PENDING,
      },
    });

    // 3. Record the DOCUMENT_UPLOADED event on the application timeline
    if (dto.connectionRequestId) {
      const connection = await this.prisma.connectionRequest.findFirst({
        where: { id: dto.connectionRequestId, deletedAt: null },
        select: { status: true },
      });
      if (connection) {
        // The filename is user-controlled and stored/rendered downstream, so
        // strip control characters and bound its length in the notes string.
        const notesName = (dto.originalName || 'document').replace(/[\u0000-\u001f\u007f]/g, '_').slice(0, 120);
        await this.prisma.applicationTimeline.create({
          data: {
            connectionRequestId: dto.connectionRequestId,
            action: WorkflowActionType.DOCUMENT_UPLOADED,
            status: connection.status,
            performedBy: dto.userId,
            notes: `Document "${notesName}" uploaded`,
            metadata: { documentId: document.id, documentType: dto.documentType },
          },
        });
      }
    }

    // 4. Dispatch OCR processing asynchronously using the unencrypted buffer
    setTimeout(() => {
      ocrService.processDocument(document.id, dto.fileBuffer, dto.mimeType, dto.documentType).catch(err => {
        logger.error('Unhandled error in background OCR process', err);
      });
    }, 0);

    logger.info(`Uploaded document to GridFS (ID: ${gridfsFileId}, Metadata ID: ${document.id})`);
    return document;
  }

  public async getDocumentStream(
    documentId: string,
    actor: DocumentActor,
  ): Promise<{ stream: NodeJS.ReadableStream; metadata: Document }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    // Ownership check — a consumer may only stream their own documents; admins
    // may stream any document (e.g. for verification workflows).
    if (document.userId !== actor.sub && !isAdmin(actor.role)) {
      throw new ForbiddenError('Access denied to this document');
    }

    const bucket = getGridFSBucket();
    const fileId = new ObjectId(document.gridfsFileId);

    // Backward compatibility: files uploaded before encryption-at-rest have no
    // `encrypted` flag, so they are streamed through untouched.
    const files = await bucket.find({ _id: fileId }).toArray();
    const encrypted = files[0]?.metadata?.encrypted === true;

    const downloadStream = bucket.openDownloadStream(fileId);
    const stream: NodeJS.ReadableStream = encrypted
      ? downloadStream.pipe(encryptionService.decryptStream())
      : downloadStream;

    return { stream, metadata: document };
  }

  public async deleteDocument(
    documentId: string,
    userId: string,
    role: string,
  ): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    if (document.userId !== userId && !isAdmin(role)) {
      throw new ForbiddenError('Access denied to this document');
    }

    // Soft delete in PostgreSQL
    await this.prisma.document.update({
      where: { id: documentId },
      data: { deletedAt: new Date() },
    });

    // Delete binary in MongoDB GridFS
    try {
      const bucket = getGridFSBucket();
      await bucket.delete(new ObjectId(document.gridfsFileId));
    } catch (err: unknown) {
      logger.warn(`Failed to delete binary from GridFS for file ${document.gridfsFileId}`, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  public async getUserDocuments(
    targetUserId: string,
    actor: DocumentActor,
  ): Promise<ReturnType<typeof toDocumentView>[]> {
    if (targetUserId !== actor.sub && !isAdmin(actor.role)) {
      throw new ForbiddenError('Access denied to this user\'s documents');
    }

    const documents = await this.prisma.document.findMany({
      where: { userId: targetUserId, deletedAt: null },
      orderBy: { uploadDate: 'desc' },
    });

    // Owners see their own extracted values (so they can verify/correct them);
    // only admins additionally receive the raw OCR dump.
    return toDocumentViews(documents, {
      includeSensitive: targetUserId === actor.sub || isAdmin(actor.role),
      includeRawText: isAdmin(actor.role),
    });
  }

  /**
   * The authenticated consumer's own documents, with decrypted extracted
   * values (but never the raw OCR text).
   */
  public async getMyDocuments(
    actor: DocumentActor,
  ): Promise<ReturnType<typeof toDocumentView>[]> {
    return this.getUserDocuments(actor.sub, actor);
  }

  /**
   * Applies consumer/admin corrections to extracted OCR fields. Each edited
   * value is re-encrypted into its existing `*Encrypted` column, and the field
   * key is recorded in `extractedFieldsEdited` so the UI can mark it
   * "edited by you" (distinguishing machine extraction from human review).
   */
  public async updateExtractedData(
    documentId: string,
    actor: DocumentActor,
    fields: Record<string, string>,
  ): Promise<ReturnType<typeof toDocumentView>> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }
    if (document.userId !== actor.sub && !isAdmin(actor.role)) {
      throw new ForbiddenError('Access denied to this document');
    }

    const data: Record<string, string> = {};
    const now = new Date().toISOString();
    const editedSet: Record<string, string> = {};
    let provided = 0;

    for (const [key, value] of Object.entries(fields)) {
      const column = EXTRACTED_FIELD_MAP[key];
      if (!column) continue;
      provided++;
      const trimmed = value.trim();
      if (!trimmed) continue;
      data[column] = encryptionService.encrypt(trimmed);
      editedSet[key] = now;
    }

    if (provided === 0) {
      throw new ValidationError('No valid extracted fields provided');
    }

    if (Object.keys(data).length > 0) {
      await this.prisma.document.update({
        where: { id: documentId },
        data,
      });
    }

    if (Object.keys(editedSet).length > 0) {
      const existing = (document.extractedFieldsEdited as Record<string, string> | null) ?? {};
      await this.prisma.document.update({
        where: { id: documentId },
        data: { extractedFieldsEdited: { ...existing, ...editedSet } },
      });
    }

    const updated = await this.prisma.document.findFirstOrThrow({
      where: { id: documentId },
    });

    return toDocumentView(updated, {
      includeSensitive: document.userId === actor.sub || isAdmin(actor.role),
      includeRawText: isAdmin(actor.role),
    });
  }
}

/** Maps an API field key to its encrypted storage column. */
const EXTRACTED_FIELD_MAP: Record<string, string> = {
  aadhaar: 'extractedAadhaarEncrypted',
  pan: 'extractedPanEncrypted',
  name: 'extractedNameEncrypted',
  dob: 'extractedDobEncrypted',
  fatherName: 'extractedFatherNameEncrypted',
  licenseNumber: 'extractedLicenseNumberEncrypted',
  address: 'extractedAddressEncrypted',
  validity: 'extractedValidityEncrypted',
};

export const documentService = new DocumentService();

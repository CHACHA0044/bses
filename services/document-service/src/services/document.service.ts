import { ObjectId } from 'mongodb';
import { DocumentType, DocumentStatus, Document, WorkflowActionType, ConnectionStatus } from '@prisma/client';
import { NotFoundError, ValidationError, createLogger } from '@bses/shared';
import { getGridFSBucket } from '../db/mongo.client';
import { getPrismaClient } from '../db/db.client';
import { sanitizeFilename } from '../middlewares/upload.middleware';
import { Readable } from 'stream';

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

export class DocumentService {
  private get prisma() {
    return getPrismaClient();
  }

  public async uploadDocument(dto: UploadDocumentDTO): Promise<Document> {
    const bucket = getGridFSBucket();
    const safeFilename = sanitizeFilename(dto.originalName);

    // 1. Stream binary buffer to MongoDB GridFS
    const uploadStream = bucket.openUploadStream(safeFilename, {
      metadata: {
        userId: dto.userId,
        documentType: dto.documentType,
        originalName: dto.originalName,
        mimeType: dto.mimeType,
      },
    });

    const readable = Readable.from(dto.fileBuffer);
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
        await this.prisma.applicationTimeline.create({
          data: {
            connectionRequestId: dto.connectionRequestId,
            action: WorkflowActionType.DOCUMENT_UPLOADED,
            status: connection.status,
            performedBy: dto.userId,
            notes: `Document "${dto.originalName}" uploaded`,
            metadata: { documentId: document.id, documentType: dto.documentType },
          },
        });
      }
    }

    logger.info(`Uploaded document to GridFS (ID: ${gridfsFileId}, Metadata ID: ${document.id})`);
    return document;
  }

  public async getDocumentStream(documentId: string): Promise<{ stream: NodeJS.ReadableStream; metadata: Document }> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    const bucket = getGridFSBucket();
    const downloadStream = bucket.openDownloadStream(new ObjectId(document.gridfsFileId));

    return { stream: downloadStream, metadata: document };
  }

  public async deleteDocument(documentId: string, userId: string): Promise<void> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });

    if (!document) {
      throw new NotFoundError('Document');
    }

    if (document.userId !== userId) {
      throw new ValidationError('Access denied to this document');
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

  public async getUserDocuments(userId: string): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { userId, deletedAt: null },
      orderBy: { uploadDate: 'desc' },
    });
  }
}

export const documentService = new DocumentService();

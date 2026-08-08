import { Document, DocumentStatus } from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

export class DocumentRepository {
  private get prisma() {
    return getPrismaClient();
  }

  public async findById(documentId: string): Promise<Document | null> {
    return this.prisma.document.findFirst({
      where: { id: documentId, deletedAt: null },
    });
  }

  public async updateStatus(documentId: string, status: DocumentStatus): Promise<Document> {
    return this.prisma.document.update({
      where: { id: documentId },
      data: { status },
    });
  }

  public async findByUserId(userId: string): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { userId, deletedAt: null },
      orderBy: { uploadDate: 'desc' },
    });
  }

  public async findByConnectionRequestId(connectionRequestId: string): Promise<Document[]> {
    return this.prisma.document.findMany({
      where: { connectionRequestId, deletedAt: null },
      orderBy: { uploadDate: 'desc' },
    });
  }
}

export const documentRepository = new DocumentRepository();

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PassThrough } from 'stream';
import { DocumentType, DocumentStatus, WorkflowActionType } from '@prisma/client';
import { NotFoundError, ForbiddenError, ValidationError, encryptionService } from '@bses/shared';
import { UploadDocumentDTO } from '../../src/services/document.service';

const h = vi.hoisted(() => ({
  mockPrisma: {
    connectionRequest: { findFirst: vi.fn() },
    document: { create: vi.fn(), findFirst: vi.fn(), findFirstOrThrow: vi.fn(), update: vi.fn() },
    applicationTimeline: { create: vi.fn() },
  },
  mockBucket: {
    openUploadStream: vi.fn(),
    find: vi.fn(),
    openDownloadStream: vi.fn(),
  },
  mockEnqueue: vi.fn(),
}));

vi.mock('../../src/db/db.client', () => ({ getPrismaClient: () => h.mockPrisma }));
vi.mock('../../src/db/mongo.client', () => ({ getGridFSBucket: () => h.mockBucket }));
vi.mock('../../src/services/ocr.service', () => ({
  ocrService: { enqueue: h.mockEnqueue },
}));

import { documentService, DocumentActor } from '../../src/services/document.service';

const ACTOR: DocumentActor = { sub: 'user-1', role: 'USER' };

const makeUploadDTO = (overrides: Partial<UploadDocumentDTO> = {}): UploadDocumentDTO => ({
  userId: 'user-1',
  role: 'USER',
  connectionRequestId: 'conn-1',
  documentType: DocumentType.AADHAAR_CARD,
  fileBuffer: Buffer.from('fake-file-bytes'),
  originalName: 'aadhaar.pdf',
  mimeType: 'application/pdf',
  fileSize: 15,
  ...overrides,
});

/** A minimal fake GridFS upload stream that emits `finish` when piped. */
const fakeUploadStream = () => {
  const stream = new PassThrough();
  (stream as unknown as { id: string }).id = 'gridfs-file-1';
  return stream;
};

const makeDocumentRow = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  userId: 'user-1',
  connectionRequestId: 'conn-1',
  documentName: 'aadhaar.pdf',
  documentType: DocumentType.AADHAAR_CARD,
  gridfsFileId: '5ebf6e2b68e2b0a873a1b1a1',
  fileSize: 15,
  mimeType: 'application/pdf',
  status: DocumentStatus.PENDING,
  uploadDate: new Date('2026-09-01T10:00:00.000Z'),
  deletedAt: null,
  ...overrides,
});

describe('DocumentService authorization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.mockBucket.openUploadStream.mockReturnValue(fakeUploadStream());
    h.mockEnqueue.mockResolvedValue(undefined);
  });

  describe('uploadDocument', () => {
    it('rejects uploads to another user\'s connection BEFORE any storage side effect', async () => {
      h.mockPrisma.connectionRequest.findFirst.mockResolvedValue({
        id: 'conn-1',
        status: 'PENDING',
        userId: 'other-user',
      });

      await expect(documentService.uploadDocument(makeUploadDTO())).rejects.toBeInstanceOf(
        ForbiddenError,
      );

      // Prove the authorization gate ran first: no bytes streamed to GridFS,
      // no metadata row created, no OCR job dispatched.
      expect(h.mockBucket.openUploadStream).not.toHaveBeenCalled();
      expect(h.mockPrisma.document.create).not.toHaveBeenCalled();
      expect(h.mockPrisma.applicationTimeline.create).not.toHaveBeenCalled();
      expect(h.mockEnqueue).not.toHaveBeenCalled();
    });

    it('returns 404 when the connection request does not exist', async () => {
      h.mockPrisma.connectionRequest.findFirst.mockResolvedValue(null);

      await expect(documentService.uploadDocument(makeUploadDTO())).rejects.toBeInstanceOf(
        NotFoundError,
      );
      expect(h.mockBucket.openUploadStream).not.toHaveBeenCalled();
      expect(h.mockPrisma.document.create).not.toHaveBeenCalled();
      expect(h.mockEnqueue).not.toHaveBeenCalled();
    });

    it('allows admins to attach documents to any active connection', async () => {
      h.mockPrisma.connectionRequest.findFirst.mockResolvedValue({
        id: 'conn-1',
        status: 'PENDING',
        userId: 'other-user',
      });
      h.mockPrisma.document.create.mockResolvedValue(makeDocumentRow());
      h.mockPrisma.applicationTimeline.create.mockResolvedValue({});

      await documentService.uploadDocument(makeUploadDTO({ role: 'ADMIN' }));

      expect(h.mockBucket.openUploadStream).toHaveBeenCalledTimes(1);
      expect(h.mockPrisma.document.create).toHaveBeenCalledTimes(1);
      expect(h.mockEnqueue).toHaveBeenCalledWith('doc-1');
    });

    it('uploads successfully to the caller\'s own connection and records the timeline event', async () => {
      h.mockPrisma.connectionRequest.findFirst.mockResolvedValue({
        id: 'conn-1',
        status: 'PENDING',
        userId: 'user-1',
      });
      h.mockPrisma.document.create.mockResolvedValue(makeDocumentRow());
      h.mockPrisma.applicationTimeline.create.mockResolvedValue({});

      await documentService.uploadDocument(makeUploadDTO());

      expect(h.mockBucket.openUploadStream).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ metadata: expect.objectContaining({ userId: 'user-1' }) }),
      );
      expect(h.mockPrisma.document.create).toHaveBeenCalledTimes(1);
      const timelineCall = h.mockPrisma.applicationTimeline.create.mock.calls[0]![0] as {
        data: Record<string, unknown>;
      };
      expect(timelineCall.data).toMatchObject({
        action: WorkflowActionType.DOCUMENT_UPLOADED,
        connectionRequestId: 'conn-1',
        performedBy: 'user-1',
        metadata: { documentId: 'doc-1', documentType: DocumentType.AADHAAR_CARD },
      });
      expect(h.mockEnqueue).toHaveBeenCalledWith('doc-1');
    });

    it('skips the connection lookup entirely when no connectionRequestId is provided', async () => {
      h.mockPrisma.document.create.mockResolvedValue(makeDocumentRow());

      await documentService.uploadDocument(makeUploadDTO({ connectionRequestId: null }));

      expect(h.mockPrisma.connectionRequest.findFirst).not.toHaveBeenCalled();
      expect(h.mockPrisma.applicationTimeline.create).not.toHaveBeenCalled();
      expect(h.mockBucket.openUploadStream).toHaveBeenCalledTimes(1);
      expect(h.mockEnqueue).toHaveBeenCalledWith('doc-1');
    });
  });

  describe('getDocumentStream', () => {
    it('forbids streaming a document owned by another user', async () => {
      h.mockPrisma.document.findFirst.mockResolvedValue(makeDocumentRow({ userId: 'other-user' }));

      await expect(
        documentService.getDocumentStream('doc-1', ACTOR),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(h.mockBucket.find).not.toHaveBeenCalled();
      expect(h.mockBucket.openDownloadStream).not.toHaveBeenCalled();
    });

    it('allows admins to stream any document', async () => {
      h.mockPrisma.document.findFirst.mockResolvedValue(makeDocumentRow({ userId: 'other-user' }));
      h.mockBucket.find.mockReturnValue({ toArray: async () => [{ metadata: { encrypted: true } }] });
      h.mockBucket.openDownloadStream.mockReturnValue(new PassThrough() as unknown as NodeJS.ReadableStream);

      const { metadata } = await documentService.getDocumentStream('doc-1', {
        sub: 'admin-1',
        role: 'ADMIN',
      });

      expect(metadata.id).toBe('doc-1');
      expect(h.mockBucket.find).toHaveBeenCalledTimes(1);
    });

    it('returns 404 for a missing document', async () => {
      h.mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(
        documentService.getDocumentStream('doc-1', ACTOR),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe('updateExtractedData (correction API)', () => {
    it('rejects a masked Aadhaar correction — full 12 digits are the stored truth', async () => {
      h.mockPrisma.document.findFirst.mockResolvedValue(makeDocumentRow());

      await expect(
        documentService.updateExtractedData('doc-1', ACTOR, { aadhaar: 'XXXX XXXX 9012' }),
      ).rejects.toBeInstanceOf(ValidationError);

      expect(h.mockPrisma.document.update).not.toHaveBeenCalled();
    });

    it('rejects a short Aadhaar correction', async () => {
      h.mockPrisma.document.findFirst.mockResolvedValue(makeDocumentRow());

      await expect(
        documentService.updateExtractedData('doc-1', ACTOR, { aadhaar: '1234 5678' }),
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('persists a full Aadhaar correction and the expanded field surface', async () => {
      h.mockPrisma.document.findFirst.mockResolvedValue(makeDocumentRow());
      h.mockPrisma.document.update.mockResolvedValue(makeDocumentRow());
      h.mockPrisma.document.findFirstOrThrow.mockResolvedValue(makeDocumentRow());

      await documentService.updateExtractedData('doc-1', ACTOR, {
        aadhaar: '1234 5678 9012',
        pan: 'ABCDE1234F',
        pinCode: '226017',
        state: 'UP',
        district: 'Lucknow',
      });

      // First update carries the encrypted columns.
      const firstUpdate = h.mockPrisma.document.update.mock.calls[0]![0] as {
        data: Record<string, string>;
      };
      expect(firstUpdate.data).toMatchObject({
        extractedAadhaarEncrypted: expect.any(String),
        extractedPanEncrypted: expect.any(String),
        extractedPinCodeEncrypted: expect.any(String),
        extractedStateEncrypted: expect.any(String),
        extractedDistrictEncrypted: expect.any(String),
      });
      expect(encryptionService.decrypt(firstUpdate.data.extractedAadhaarEncrypted)).toBe(
        '123456789012',
      );
    });

    it('forbids correcting a document owned by another user', async () => {
      h.mockPrisma.document.findFirst.mockResolvedValue(makeDocumentRow({ userId: 'other-user' }));

      await expect(
        documentService.updateExtractedData('doc-1', ACTOR, { name: 'Rahul Sharma' }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      expect(h.mockPrisma.document.update).not.toHaveBeenCalled();
    });
  });
});
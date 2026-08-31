import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OcrService, ocrService } from '../../src/services/ocr.service';
import { DocumentType } from '@prisma/client';
import { PDFParse } from 'pdf-parse';

const mockPrisma = {
  document: {
    update: vi.fn().mockResolvedValue({}),
  },
};

vi.mock('../../src/db/db.client', () => ({
  getPrismaClient: () => mockPrisma,
}));

vi.mock('../../src/services/ocr/preprocess', () => ({
  prepareImage: vi.fn().mockImplementation(async (buf: Buffer) => ({
    deskewedBuffer: buf,
    flatBuffer: buf,
    skewAngle: 0,
    atBoundary: false,
    width: 1,
    height: 1,
    inkRatio: 0.1,
  })),
}));

vi.mock('../../src/services/ocr/qr', () => ({
  decodeQrFromImage: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../src/services/ocr/qrPayload', () => ({
  parseQrPayload: vi.fn().mockImplementation(() => ({
    format: 'generic',
    raw: '',
    hasPhoto: false,
    fields: { isUnreadable: false, fieldSources: {} },
    errors: [],
  })),
}));

import { prepareImage } from '../../src/services/ocr/preprocess';
import { decodeQrFromImage } from '../../src/services/ocr/qr';
import { parseQrPayload } from '../../src/services/ocr/qrPayload';

class MockPDFParse {
  private readonly options: { data: Buffer };
  constructor(options: { data: Buffer }) {
    this.options = options;
  }
  getText = vi.fn().mockResolvedValue({ text: 'Name : John Doe\n PAN AAAAA0000A\nDOB 01-01-1980' });
  destroy = vi.fn().mockResolvedValue(undefined);
}

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation((options: { data: Buffer }) => new MockPDFParse(options)),
}));

let mockAddJob = vi.fn();
vi.mock('tesseract.js', () => {
  return {
    createWorker: vi.fn().mockResolvedValue({}),
    createScheduler: () => ({
      addWorker: vi.fn(),
      addJob: mockAddJob,
    }),
  };
});

describe('OcrService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should flag unreadable documents when confidence is low', async () => {
    mockAddJob.mockResolvedValueOnce({
      data: { confidence: 20, text: 'random garbage text' },
    });

    await ocrService.processDocument('doc1', Buffer.from('test'), 'image/png', DocumentType.AADHAAR_CARD);

    expect(prepareImage).toHaveBeenCalledWith(expect.any(Buffer));
    expect(mockPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc1' },
        data: expect.objectContaining({ isUnreadable: true, ocrConfidence: 20 }),
      })
    );
  });

  it('should extract Aadhaar and DOB from high confidence text', async () => {
    mockAddJob.mockResolvedValueOnce({
      data: { confidence: 95, text: 'Government of India\nDOB: 15/08/1990\n1234 5678 9012\nMale' },
    });

    await ocrService.processDocument('doc2', Buffer.from('test'), 'image/png', DocumentType.AADHAAR_CARD);

    expect(mockPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc2' },
        data: expect.objectContaining({
          isUnreadable: false,
          ocrConfidence: 95,
          extractedAadhaarEncrypted: expect.any(String),
          extractedDobEncrypted: expect.any(String),
        }),
      })
    );
  });

  it('should process PDFs using pdf-parse', async () => {
    await ocrService.processDocument('doc3', Buffer.from('pdf'), 'application/pdf', DocumentType.PAN_CARD);

    expect(PDFParse).toHaveBeenCalledWith(expect.objectContaining({ data: expect.any(Buffer) }));
    expect(mockPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc3' },
        data: expect.objectContaining({
          isUnreadable: false,
          extractedPanEncrypted: expect.any(String),
          extractedNameEncrypted: expect.any(String),
        }),
      })
    );
  });

  it('should skip OCR entirely when a QR read is authoritative (QR-first)', async () => {
    const qrFields = {
      extractedName: 'RAKESH KUMAR',
      extractedDob: '15/08/1990',
      extractedAadhaar: '123456789012',
      isUnreadable: false,
      fieldSources: {},
    };
    vi.mocked(decodeQrFromImage).mockResolvedValueOnce('base64/xml wrapper');
    vi.mocked(parseQrPayload).mockReturnValueOnce({
      format: 'aadhaar-secure',
      raw: '<Data>[omitted]</Data>',
      hasPhoto: false,
      fields: qrFields,
      errors: [],
    });

    await ocrService.processDocument('doc4', Buffer.from('test'), 'image/png', DocumentType.AADHAAR_CARD);

    expect(mockAddJob).not.toHaveBeenCalled();
    expect(mockPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc4' },
        data: expect.objectContaining({
          isUnreadable: false,
          needsReview: false,
          ocrConfidence: 99,
          ocrFieldSources: {
            extractedName: 'qr',
            extractedDob: 'qr',
            extractedAadhaar: 'qr',
          },
          extractedNameEncrypted: expect.any(String),
          extractedAadhaarEncrypted: expect.any(String),
        }),
      })
    );
  });

  it('should fill QR gaps with OCR and record per-field sources', async () => {
    const qrFields = {
      extractedName: 'RAKESH KUMAR',
      isUnreadable: false,
      fieldSources: {},
    };
    vi.mocked(decodeQrFromImage).mockResolvedValueOnce('partial payload');
    vi.mocked(parseQrPayload).mockReturnValueOnce({
      format: 'generic',
      raw: 'partial payload',
      hasPhoto: false,
      fields: qrFields,
      errors: [],
    });
    mockAddJob.mockResolvedValueOnce({
      data: {
        confidence: 92,
        text: '1234 5678 9012\nDOB: 15/08/1990\nRAKESH KUMAR',
      },
    });

    await ocrService.processDocument('doc5', Buffer.from('test'), 'image/png', DocumentType.AADHAAR_CARD);

    expect(mockAddJob).toHaveBeenCalledTimes(1);
    expect(mockPrisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc5' },
        data: expect.objectContaining({
          ocrFieldSources: {
            extractedName: 'qr',
            extractedDob: 'ocr',
            extractedAadhaar: 'ocr',
          },
          needsReview: false,
        }),
      })
    );
  });
});


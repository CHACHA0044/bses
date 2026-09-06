import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ocrService } from '../../src/services/ocr.service';
import { DocumentType, OcrJobStatus } from '@prisma/client';
import { encryptionService } from '@bses/shared';
import { PDFParse } from 'pdf-parse';
import { prepareImage } from '../../src/services/ocr/preprocess';
import { decodeQrFromImage } from '../../src/services/ocr/qr';
import { parseQrPayload } from '../../src/services/ocr/qrPayload';

const h = vi.hoisted(() => {
  return {
    mockCurrentDoc: { value: null as Record<string, unknown> | null },
    mockPrisma: {
      document: {
        update: vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockImplementation(async () => h.mockCurrentDoc.value),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    mockRecognize: vi.fn(),
    mockSetParameters: vi.fn().mockResolvedValue(undefined),
    mockTerminate: vi.fn().mockResolvedValue(undefined),
    mockBucketFind: vi.fn(),
  };
});

const { mockPrisma, mockRecognize, mockBucketFind, mockCurrentDoc } = h;

/** A born-digital PDF mock: text layer present, no raster pages needed. */
class MockPDFParse {
  getText = vi.fn().mockResolvedValue({
    text: 'Name : John Doe\n PAN AAAAA0000A\nDOB 01-01-1980',
    pages: [{ num: 1, text: 'Name : John Doe\n PAN AAAAA0000A\nDOB 01-01-1980' }],
  });
  getScreenshot = vi.fn().mockResolvedValue({ pages: [] });
  destroy = vi.fn().mockResolvedValue(undefined);
}

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(() => new MockPDFParse()),
}));

vi.mock('../../src/db/db.client', () => ({ getPrismaClient: () => h.mockPrisma }));

vi.mock('../../src/db/mongo.client', () => ({
  getGridFSBucket: () => ({
    find: h.mockBucketFind,
    openDownloadStream: vi.fn().mockReturnValue({
      [Symbol.asyncIterator]: async function* () {
        yield Buffer.from('test');
      },
    }),
  }),
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
    fields: { fieldSources: {} },
    errors: [],
  })),
}));

vi.mock('../../src/services/notification.client', () => ({
  notificationClient: { notifyDocumentVerificationPending: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock('mongodb', () => ({
  ObjectId: vi.fn().mockImplementation((id: string) => ({ id })),
}));

vi.mock('tesseract.js', () => ({
  createWorker: vi.fn().mockResolvedValue({
    recognize: h.mockRecognize,
    setParameters: h.mockSetParameters,
    terminate: h.mockTerminate,
  }),
  setLogging: vi.fn(),
  OEM: { LSTM_ONLY: 1 },
  PSM: { SINGLE_BLOCK: '6', AUTO: '3' },
}));

/** The doc row the mocked DB returns for the job being processed. */
const makeDoc = (id: string, docType: DocumentType, mimeType = 'image/png') => ({
  id,
  mimeType,
  documentType: docType,
  gridfsFileId: 'gridfs-' + id,
  ocrStatus: 'PENDING',
  ocrAttempts: 0,
  ocrLanguages: null,
  ocrConfidence: null,
  deletedAt: null,
  needsReview: false,
  isUnreadable: false,
});

const lastUpdate = (): { data: Record<string, unknown> } => {
  const call = mockPrisma.document.update.mock.calls.at(-1)!;
  return call[0] as { data: Record<string, unknown> };
};

describe('OcrService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCurrentDoc.value = null;
    mockBucketFind.mockReturnValue({
      toArray: async () => [{ metadata: { encrypted: false } }],
    });
    mockRecognize.mockResolvedValue({ data: { confidence: 95, text: '' } });
  });

  it('should mark a document unreadable when OCR confidence is low', async () => {
    mockCurrentDoc.value = makeDoc('doc1', DocumentType.AADHAAR_CARD);
    mockRecognize.mockResolvedValueOnce({
      data: { confidence: 20, text: 'random garbage text' },
    });

    await ocrService.processNow('doc1');

    expect(prepareImage).toHaveBeenCalledWith(expect.any(Buffer));
    expect(lastUpdate().data).toEqual(
      expect.objectContaining({
        isUnreadable: true,
        ocrConfidence: 20,
        ocrStatus: OcrJobStatus.UNREADABLE,
      }),
    );
  });

  it('should extract Aadhaar fields from high-confidence OCR text', async () => {
    mockCurrentDoc.value = makeDoc('doc2', DocumentType.AADHAAR_CARD);
    mockRecognize.mockResolvedValueOnce({
      data: {
        confidence: 95,
        text: 'Government of India\nUnique Identification Authority of India\ndob: 15/08/1990\n1234 5678 9012\nMale',
      },
    });

    await ocrService.processNow('doc2');

    const persisted = lastUpdate().data as Record<string, string>;
    // Round-trip: the FULL 12-digit number must survive OCR→encrypt→decrypt
    // (persisting only the last 4 digits is irreversible data loss).
    expect(encryptionService.decrypt(persisted.extractedAadhaarEncrypted)).toBe(
      '123456789012',
    );
    expect(encryptionService.decrypt(persisted.extractedDobEncrypted)).toBe('15/08/1990');
    expect(persisted).toEqual(
      expect.objectContaining({
        isUnreadable: false,
        ocrConfidence: 95,
        ocrStatus: OcrJobStatus.EXTRACTED,
        ocrDetectedType: 'AADHAAR',
      }),
    );
  });

  it('should process born-digital PDFs via pdf-parse without rasterization', async () => {
    mockCurrentDoc.value = makeDoc('doc3', DocumentType.PAN_CARD, 'application/pdf');

    await ocrService.processNow('doc3');

    expect(lastUpdate().data).toEqual(
      expect.objectContaining({
        isUnreadable: false,
        extractedPanEncrypted: expect.any(String),
        extractedNameEncrypted: expect.any(String),
      }),
    );
    // Born-digital PDFs should never spin up OCR workers.
    expect(mockRecognize).not.toHaveBeenCalled();
  });

  it('should rasterize scanned PDF pages and OCR them', async () => {
    mockCurrentDoc.value = makeDoc('doc6', DocumentType.ADDRESS_PROOF, 'application/pdf');
    const scanned = new MockPDFParse();
    scanned.getText.mockResolvedValueOnce({
      text: '',
      pages: [{ num: 1, text: '' }],
    });
    scanned.getScreenshot.mockResolvedValueOnce({
      pages: [{ data: new Uint8Array([1, 2, 3]) }],
    });
    mockRecognize.mockResolvedValueOnce({
      data: { confidence: 85, text: 'Driving Licence\nName : PRANAV DEMBLA\nUP32 20220046117' },
    });
    vi.mocked(PDFParse).mockImplementationOnce(() => scanned);

    await ocrService.processNow('doc6');

    expect(scanned.getScreenshot).toHaveBeenCalledWith(
      expect.objectContaining({ partial: [1], desiredWidth: expect.any(Number) }),
    );
    expect(mockRecognize).toHaveBeenCalled();
  });

  it('should skip OCR entirely when a QR read is authoritative (QR-first)', async () => {
    mockCurrentDoc.value = makeDoc('doc4', DocumentType.AADHAAR_CARD);
    const qrFields = {
      extractedName: 'RAKESH KUMAR',
      extractedDob: '15/08/1990',
      extractedAadhaar: '123456789012',
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

    await ocrService.processNow('doc4');

    expect(mockRecognize).not.toHaveBeenCalled();
    expect(lastUpdate().data).toEqual(
      expect.objectContaining({
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
    );
  });

  it('should fill QR gaps with OCR and record per-field sources', async () => {
    mockCurrentDoc.value = makeDoc('doc5', DocumentType.AADHAAR_CARD);
    vi.mocked(decodeQrFromImage).mockResolvedValueOnce('partial payload');
    vi.mocked(parseQrPayload).mockReturnValueOnce({
      format: 'generic',
      raw: 'partial payload',
      hasPhoto: false,
      fields: { extractedName: 'RAKESH KUMAR', fieldSources: {} },
      errors: [],
    });
    mockRecognize.mockResolvedValueOnce({
      data: {
        confidence: 92,
        text: '1234 5678 9012\nDOB: 15/08/1990\nRAKESH KUMAR',
      },
    });

    await ocrService.processNow('doc5');

    expect(mockRecognize).toHaveBeenCalledTimes(1);
    expect(lastUpdate().data).toEqual(
      expect.objectContaining({
        ocrFieldSources: {
          extractedName: 'qr',
          extractedDob: 'ocr',
          extractedAadhaar: 'ocr',
        },
        needsReview: false,
      }),
    );
  });

  it('should FAIL a job after bounded retries on infrastructure errors', async () => {
    mockCurrentDoc.value = makeDoc('doc7', DocumentType.AADHAAR_CARD);
    mockCurrentDoc.value!.ocrAttempts = 2; // two prior infra retries consumed
    mockBucketFind.mockReturnValue({
      toArray: async () => {
        throw new Error('gridfs down');
      },
    });

    await ocrService.processNow('doc7');

    // Terminal FAILED (infra), distinct from an UNREADABLE document.
    expect(lastUpdate().data).toEqual(
      expect.objectContaining({
        ocrStatus: OcrJobStatus.FAILED,
        ocrLastError: 'gridfs down',
      }),
    );
  });

  it('should recover interrupted jobs but skip legacy rows already OCR-d', async () => {
    mockPrisma.document.findMany.mockResolvedValueOnce([
      { id: 'recover1', ocrStatus: 'PROCESSING', ocrConfidence: null },
      { id: 'legacy1', ocrStatus: 'PENDING', ocrConfidence: 87 },
    ]);
    mockCurrentDoc.value = makeDoc('recover1', DocumentType.AADHAAR_CARD);
    mockRecognize.mockResolvedValueOnce({
      data: { confidence: 90, text: 'DOB: 15/08/1990\n1234 5678 9012\nMale' },
    });

    const recovered = await ocrService.recoverInterruptedJobs();

    expect(recovered).toBe(1);
    expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [
            { ocrStatus: 'PENDING' },
            { ocrStatus: 'PROCESSING', ocrStartedAt: { lt: expect.any(Date) } },
          ],
        },
      }),
    );
  });
});
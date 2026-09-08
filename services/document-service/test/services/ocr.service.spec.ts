import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ocrService } from '../../src/services/ocr.service';
import { DocumentType, OcrJobStatus } from '@prisma/client';
import { encryptionService } from '@bses/shared';
import { PDFParse } from 'pdf-parse';
import { prepareImage } from '../../src/services/ocr/preprocess';
import { decodeQrFromImage } from '../../src/services/ocr/qr';
import { parseQrPayload } from '../../src/services/ocr/qrPayload';
import { verifyQrSignature } from '../../src/services/ocr/qrSignature';

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

/**
 * QR signature verification mock. No UIDAI public key is configured in the
 * test environment, so the default result is DECODED_UNVERIFIED — mirroring
 * the real `verifyQrSignature` gate, where a missing key means UNVERIFIABLE.
 * Individual tests that need a trusted QR mock SIGNED_VERIFIED explicitly
 * via `mockReturnValueOnce`.
 */
vi.mock('../../src/services/ocr/qrSignature', () => {
  type QrVerifyResult = { status: string; reason: string; algorithm?: string };
  const defaultResult: QrVerifyResult = {
    status: 'DECODED_UNVERIFIED',
    reason: 'test: no UIDAI key configured',
  };
  return {
    verifyQrSignature: vi.fn((_payload: string, _format: string): QrVerifyResult => defaultResult),
  };
});

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

/**
 * The MAIN persist call is the one containing the encrypted PII columns.
 * The pipeline now issues a second `update` right after it
 * (`persistVerificationMeta`), so "last call" is no longer the main persist.
 */
const lastUpdate = (): { data: Record<string, unknown> } => {
  const calls = mockPrisma.document.update.mock.calls as Array<[{ data: Record<string, unknown> }]>;
  const main = calls.filter((c) => 'ocrRawTextEncrypted' in c[0].data).at(-1);
  return (main ?? calls.at(-1)!)[0] as { data: Record<string, unknown> };
};

/** The verification-meta update (qr status / quality / risk columns), if any. */
const verificationUpdate = (): Record<string, unknown> | undefined => {
  const calls = mockPrisma.document.update.mock.calls as Array<[{ data: Record<string, unknown> }]>;
  return calls.map((c) => c[0].data).find((d) => 'ocrQrStatus' in d);
};

describe('OcrService', () => {
  beforeEach(() => {
    vi.clearAllMocks();;
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
        text: 'Government of India\nUnique Identification Authority of India\ndob: 15/08/1990\n2345 6789 0124\nMale',
      },
    });

    await ocrService.processNow('doc2');

    const persisted = lastUpdate().data as Record<string, string>;
    // Round-trip: the FULL 12-digit number must survive OCR→encrypt→decrypt
    // (persisting only the last 4 digits is irreversible data loss).
    // 234567890124 passes the Verhoeff checksum enforced by the pipeline.
    expect(encryptionService.decrypt(persisted.extractedAadhaarEncrypted)).toBe(
      '234567890124',
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

  it('should skip OCR entirely when a QR read is complete AND cryptographically verified', async () => {
    mockCurrentDoc.value = makeDoc('doc4', DocumentType.AADHAAR_CARD);
    const qrFields = {
      extractedName: 'RAKESH KUMAR',
      extractedDob: '15/08/1990',
      extractedAadhaar: '234567890124', // Verhoeff-valid
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
    // Simulate a payload whose XML-DSIG signature validated against the
    // configured UIDAI public key — only then may QR skip OCR.
    vi.mocked(verifyQrSignature).mockReturnValueOnce({
      status: 'SIGNED_VERIFIED',
      reason: 'test: signature valid against configured UIDAI public key',
      algorithm: 'RSA-SHA256',
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
    // Verification provenance must be persisted alongside the extraction.
    expect(verificationUpdate()).toEqual(
      expect.objectContaining({ ocrQrStatus: 'SIGNED_VERIFIED' }),
    );
  });

  it('must NOT skip OCR when the QR is complete but NOT cryptographically verified', async () => {
    // Security regression guard: a decoded-but-unverified QR is never
    // authoritative — OCR must still run and corroborate the fields.
    mockCurrentDoc.value = makeDoc('doc8', DocumentType.AADHAAR_CARD);
    const qrFields = {
      extractedName: 'UNVERIFIED PERSON',
      extractedDob: '15/08/1990',
      extractedAadhaar: '234567890124',
      fieldSources: {},
    };
    vi.mocked(decodeQrFromImage).mockResolvedValueOnce('self-made qr payload');
    vi.mocked(parseQrPayload).mockReturnValueOnce({
      format: 'aadhaar-secure',
      raw: '<Data>[omitted]</Data>',
      hasPhoto: false,
      fields: qrFields,
      errors: [],
    });
    // Unverified payload: signature check fails, so OCR must corroborate.
    vi.mocked(verifyQrSignature).mockReturnValueOnce({
      status: 'DECODED_UNVERIFIED',
      reason: 'test: self-made QR has no valid UIDAI signature',
    });
    mockRecognize.mockResolvedValueOnce({
      data: {
        confidence: 90,
        text: 'Government of India\n2345 6789 0124\nDOB: 15/08/1990\nName: RAKESH KUMAR',
      },
    });

    await ocrService.processNow('doc8');

    expect(mockRecognize).toHaveBeenCalledTimes(1);
    expect(lastUpdate().data).toEqual(
      expect.objectContaining({
        // The QR name conflicts with the name OCR read from the document image.
        // The unverified QR must NOT win that conflict.
        ocrFieldSources: expect.objectContaining({ extractedName: 'ocr' }),
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
        text: '2345 6789 0124\nDOB: 15/08/1990\nRAKESH KUMAR',
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
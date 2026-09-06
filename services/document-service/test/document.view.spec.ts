import { describe, it, expect } from 'vitest';
import { encryptionService, toDocumentView, RawDocument } from '@bses/shared';
import { DocumentType, DocumentStatus } from '@prisma/client';

/**
 * Phase 2 regression: the Aadhaar data-loss bug.
 *
 * The extractor stores the FULL 12-digit number (encrypted at rest). The view
 * layer masks it for consumers (`XXXX XXXX 9012`) and only releases the full
 * value to owner/admin callers via `includeSensitive`. Storage and display are
 * therefore two separate concerns — masking must never feed back into storage.
 */
const makeRow = (overrides: Partial<RawDocument> = {}): RawDocument => ({
  id: 'doc-1',
  documentName: 'aadhaar.pdf',
  documentType: DocumentType.AADHAAR_CARD,
  fileSize: 15,
  mimeType: 'application/pdf',
  uploadDate: new Date('2026-09-01T10:00:00.000Z'),
  status: DocumentStatus.PENDING,
  gridfsFileId: '5ebf6e2b68e2b0a873a1b1a1',
  connectionRequestId: 'conn-1',
  extractedAadhaarEncrypted: encryptionService.encrypt('123456789012'),
  extractedNameEncrypted: encryptionService.encrypt('Rahul Sharma'),
  extractedDobEncrypted: encryptionService.encrypt('15/08/1990'),
  ocrConfidence: 95,
  ocrStatus: 'EXTRACTED',
  ...overrides,
});

describe('Aadhaar round-trip (storage vs display)', () => {
  it('stores the full 12-digit number encrypted and never exposes the ciphertext column', () => {
    const row = makeRow();
    const view = toDocumentView(row);

    // Ciphertext columns are stripped entirely — nothing to leak downstream.
    expect(JSON.stringify(view)).not.toContain(row.extractedAadhaarEncrypted);
    expect(JSON.stringify(view)).not.toContain('extractedAadhaarEncrypted');

    // The decrypted source of truth is the full number (round-trip survives).
    expect(encryptionService.decrypt(row.extractedAadhaarEncrypted!)).toBe('123456789012');
  });

  it('masks the Aadhaar to last-4-digits for consumer-facing responses', () => {
    const view = toDocumentView(makeRow(), { includeSensitive: false });

    expect(view.ocrData.aadhaar).toBe('XXXX XXXX 9012');
    // Full value must not appear anywhere in the consumer payload.
    expect(JSON.stringify(view)).not.toContain('123456789012');
    // Other fields are masked too.
    expect(view.ocrData.name).toBe('R••••');
    expect(view.ocrData.dob).toBe('••/••/1990');
  });

  it('releases the full value only to sensitive/owner callers', () => {
    const view = toDocumentView(makeRow(), { includeSensitive: true });

    expect(view.ocrData.aadhaar).toBe('123456789012');
    expect(view.ocrData.name).toBe('Rahul Sharma');
  });

  it('still masks a physically masked card (last-4 only) without corruption', () => {
    // Cards that print `XXXX XXXX 9012` keep that masked form in storage; the
    // view layer must not reveal anything more than the printed digits.
    const row = makeRow({
      extractedAadhaarEncrypted: encryptionService.encrypt('XXXX XXXX 9012'),
    });
    const view = toDocumentView(row, { includeSensitive: true });

    expect(view.ocrData.aadhaar).toBe('XXXX XXXX 9012');
  });
});
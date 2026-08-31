import { describe, it, expect } from 'vitest';
import { DocumentType } from '@prisma/client';
import { mergeQrAndOcr } from '../../../src/services/ocr/qrMerge';

const aadhaarQr = {
  extractedName: 'RAKESH KUMAR',
  extractedDob: '15/08/1990',
  extractedAadhaar: '123456789012',
  isUnreadable: false,
  fieldSources: {},
};

const garbledOcr = {
  extractedName: 'RAKESH KVMAR',
  extractedDob: '15/08/1590',
  extractedAadhaar: '123456789012',
  isUnreadable: false,
  needsReview: true,
  lowConfidenceFields: ['extractedDob', 'extractedName'],
};

describe('mergeQrAndOcr', () => {
  it('lets a clean QR read override a garbled OCR read (QR wins on conflict)', () => {
    const merged = mergeQrAndOcr({ qr: aadhaarQr, ocr: garbledOcr, docType: DocumentType.AADHAAR_CARD });
    expect(merged.extractedName).toBe('RAKESH KUMAR');
    expect(merged.extractedDob).toBe('15/08/1990');
    expect(merged.fieldSources).toEqual({
      extractedName: 'qr',
      extractedDob: 'qr',
      extractedAadhaar: 'qr',
    });
  });

  it('clears needsReview when the QR covers every expected field', () => {
    const merged = mergeQrAndOcr({ qr: aadhaarQr, ocr: garbledOcr, docType: DocumentType.AADHAAR_CARD });
    expect(merged.needsReview).toBe(false);
    expect(merged.lowConfidenceFields).toEqual([]);
  });

  it('falls back to OCR per-field when the QR is partial', () => {
    const partialQr = { extractedName: 'RAKESH KUMAR', isUnreadable: false, fieldSources: {} };
    const ocr = {
      extractedDob: '15/08/1990',
      extractedAadhaar: '123456789012',
      isUnreadable: false,
      needsReview: false,
      lowConfidenceFields: [],
    };
    const merged = mergeQrAndOcr({ qr: partialQr, ocr, docType: DocumentType.AADHAAR_CARD });
    expect(merged.extractedName).toBe('RAKESH KUMAR');
    expect(merged.fieldSources.extractedName).toBe('qr');
    expect(merged.extractedDob).toBe('15/08/1990');
    expect(merged.fieldSources.extractedDob).toBe('ocr');
    expect(merged.extractedAadhaar).toBe('123456789012');
    expect(merged.fieldSources.extractedAadhaar).toBe('ocr');
    expect(merged.isUnreadable).toBe(false);
  });

  it('keeps needsReview for a partial QR read when OCR was unreadable', () => {
    const partialQr = { extractedName: 'RAKESH KUMAR', isUnreadable: false, fieldSources: {} };
    const unreadableOcr = { isUnreadable: true };
    const merged = mergeQrAndOcr({ qr: partialQr, ocr: unreadableOcr, docType: DocumentType.AADHAAR_CARD });
    expect(merged.needsReview).toBe(true);
    expect(merged.extractedName).toBe('RAKESH KUMAR');
  });

  it('preserves the pure-OCR result verbatim when no QR is present', () => {
    const ocr = {
      extractedName: 'RAKESH KUMAR',
      extractedDob: '15/08/1990',
      isUnreadable: false,
      needsReview: true,
      lowConfidenceFields: ['extractedDob'],
    };
    const merged = mergeQrAndOcr({ qr: null, ocr, docType: DocumentType.AADHAAR_CARD });
    expect(merged.extractedName).toBe('RAKESH KUMAR');
    expect(merged.needsReview).toBe(true);
    expect(merged.lowConfidenceFields).toEqual(['extractedDob']);
    expect(merged.fieldSources.extractedName).toBe('ocr');
    expect(merged.fieldSources.extractedDob).toBe('ocr');
  });

  it('marks a low-confidence OCR field as resolved when the QR provides it', () => {
    const partialQr = { extractedDob: '15/08/1990', isUnreadable: false, fieldSources: {} };
    const ocr = {
      extractedName: 'RAKESH KUMAR',
      extractedDob: '15/08/1590',
      isUnreadable: false,
      needsReview: true,
      lowConfidenceFields: ['extractedDob'],
    };
    const merged = mergeQrAndOcr({ qr: partialQr, ocr, docType: DocumentType.AADHAAR_CARD });
    expect(merged.extractedDob).toBe('15/08/1990');
    expect(merged.fieldSources.extractedDob).toBe('qr');
    expect(merged.lowConfidenceFields).not.toContain('extractedDob');
    // QR is partial, so the surviving OCR assessment (needs review) is kept.
    expect(merged.needsReview).toBe(true);
  });

  it('is generic — merges a PAN QR with OCR for PAN cards', () => {
    const panQr = { extractedPan: 'ABCDE1234F', extractedName: 'RAKESH KUMAR', isUnreadable: false, fieldSources: {} };
    const ocr = {
      extractedFatherName: 'SURESH KUMAR',
      extractedDob: '15/08/1990',
      isUnreadable: false,
      needsReview: false,
      lowConfidenceFields: [],
    };
    const merged = mergeQrAndOcr({ qr: panQr, ocr, docType: DocumentType.PAN_CARD });
    expect(merged.extractedPan).toBe('ABCDE1234F');
    expect(merged.fieldSources.extractedPan).toBe('qr');
    expect(merged.extractedFatherName).toBe('SURESH KUMAR');
    expect(merged.fieldSources.extractedFatherName).toBe('ocr');
  });

  it('flags everything unreadable when both sources are empty', () => {
    const merged = mergeQrAndOcr({ qr: null, ocr: { isUnreadable: true }, docType: DocumentType.AADHAAR_CARD });
    expect(merged.isUnreadable).toBe(true);
  });
});

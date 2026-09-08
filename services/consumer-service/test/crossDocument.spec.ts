import { describe, it, expect } from 'vitest';
import { DocumentType } from '@prisma/client';
import {
  assessCrossDocumentConsistency,
  CrossDocumentRecord,
  IDENTITY_DOC_TYPES,
} from '../src/config/crossDocumentValidation';

const identityDoc = (overrides: Partial<CrossDocumentRecord>): CrossDocumentRecord => ({
  documentId: 'doc-1',
  documentType: DocumentType.AADHAAR_CARD,
  documentName: 'aadhaar.jpg',
  name: 'Pranav Dembla',
  fatherName: 'Ajay Dembla',
  dob: '05-04-2004',
  ...overrides,
});

describe('Cross-Document Identity Consistency', () => {
  it('treats a single identity document as complete (nothing to compare)', () => {
    const result = assessCrossDocumentConsistency([identityDoc({})]);
    expect(result.complete).toBe(true);
    expect(result.conflicts).toEqual([]);
  });

  it('passes when identity fields agree across Aadhaar and PAN (format-insensitive)', () => {
    const result = assessCrossDocumentConsistency([
      identityDoc({ documentId: 'a1', documentName: 'aadhaar.jpg', name: 'Pranav Dembla', dob: '05-04-2004' }),
      identityDoc({
        documentId: 'p1',
        documentType: DocumentType.PAN_CARD,
        documentName: 'pan.jpg',
        name: 'PRANAV DEMBLA',
        dob: '05/04/2004',
      }),
    ]);
    expect(result.complete).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('flags a NAME disagreement between Aadhaar and PAN', () => {
    const result = assessCrossDocumentConsistency([
      identityDoc({ documentId: 'a1', documentName: 'aadhaar.jpg', name: 'Pranav Dembla' }),
      identityDoc({
        documentId: 'p1',
        documentType: DocumentType.PAN_CARD,
        documentName: 'pan.jpg',
        name: 'Rajesh Kumar',
      }),
    ]);
    expect(result.complete).toBe(false);
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0]!.field).toBe('name');
    expect(result.issues[0]).toContain('Name');
    expect(result.issues[0]).toContain('aadhaar.jpg');
    // Consumer-safe issue strings must NOT leak raw field values.
    expect(result.issues[0]).not.toContain('Pranav');
    expect(result.issues[0]).not.toContain('Rajesh');
  });

  it('flags a DOB disagreement while naming the conflicting documents', () => {
    const result = assessCrossDocumentConsistency([
      identityDoc({ documentId: 'a1', documentName: 'aadhaar.jpg', dob: '05-04-2004' }),
      identityDoc({
        documentId: 'd1',
        documentType: DocumentType.DRIVING_LICENSE,
        documentName: 'dl.pdf',
        dob: '01-01-1990',
      }),
    ]);
    expect(result.complete).toBe(false);
    expect(result.conflicts[0]!.field).toBe('dob');
    expect(result.conflicts[0]!.values.map((v) => v.documentName).sort()).toEqual([
      'aadhaar.jpg',
      'dl.pdf',
    ]);
  });

  it('skips documents flagged for review or unreadable when comparing', () => {
    const result = assessCrossDocumentConsistency([
      // needsReview — its OCR values are unreliable and must not cause a conflict.
      identityDoc({ documentId: 'a1', documentName: 'aadhaar.jpg', name: 'Pranav Dembla', needsReview: true }),
      identityDoc({
        documentId: 'p1',
        documentType: DocumentType.PAN_CARD,
        documentName: 'pan.jpg',
        name: 'Rajesh Kumar',
      }),
    ]);
    // Only one readable identity doc remains — nothing to compare.
    expect(result.complete).toBe(true);
  });

  it('ignores non-identity document types (address proof etc.)', () => {
    const result = assessCrossDocumentConsistency([
      identityDoc({ documentId: 'a1', documentName: 'aadhaar.jpg', name: 'Pranav Dembla' }),
      identityDoc({ documentId: 'b1', documentType: DocumentType.ADDRESS_PROOF, documentName: 'bill.pdf', name: 'Someone Else' }),
    ]);
    expect(result.complete).toBe(true);
  });

  it('reports one conflict per disagreeing field', () => {
    const result = assessCrossDocumentConsistency([
      identityDoc({ documentId: 'a1', documentName: 'aadhaar.jpg', name: 'Pranav Dembla', dob: '05-04-2004', fatherName: 'Ajay Dembla' }),
      identityDoc({
        documentId: 'p1',
        documentType: DocumentType.PAN_CARD,
        documentName: 'pan.jpg',
        name: 'Rajesh Kumar',
        dob: '05-04-2004',
        fatherName: 'Deepak Kumar',
      }),
    ]);
    expect(result.complete).toBe(false);
    expect(result.conflicts.map((c) => c.field).sort()).toEqual(['fatherName', 'name']);
  });

  it('exposes decrypted structured values on conflicts for the review UI', () => {
    const result = assessCrossDocumentConsistency([
      identityDoc({ documentId: 'a1', documentName: 'aadhaar.jpg', name: 'Pranav Dembla' }),
      identityDoc({
        documentId: 'p1',
        documentType: DocumentType.PAN_CARD,
        documentName: 'pan.jpg',
        name: 'Rajesh Kumar',
      }),
    ]);
    expect(result.conflicts[0]!.values).toContainEqual({
      documentId: 'a1',
      documentName: 'aadhaar.jpg',
      value: 'Pranav Dembla',
    });
  });

  it('registers the three Indian identity document types', () => {
    expect(IDENTITY_DOC_TYPES).toContain(DocumentType.AADHAAR_CARD);
    expect(IDENTITY_DOC_TYPES).toContain(DocumentType.PAN_CARD);
    expect(IDENTITY_DOC_TYPES).toContain(DocumentType.DRIVING_LICENSE);
  });
});
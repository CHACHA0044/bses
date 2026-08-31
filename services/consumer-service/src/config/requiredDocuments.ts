import { ConnectionType, DocumentType } from '@prisma/client';

/**
 * Required document groups per connection type.
 *
 * Each group is satisfied when at least ONE uploaded document matches any of
 * the listed types AND that document is neither unreadable nor flagged for
 * manual review. This mirrors the apply wizard's mandatory upload steps —
 * Identity Proof (Aadhaar/PAN) and Ownership/Address Proof — and is the
 * definition used by the submission completeness gate in the workflow engine.
 */
export const REQUIRED_DOCUMENT_GROUPS: Record<ConnectionType, DocumentType[][]> = {
  [ConnectionType.DOMESTIC]: [
    [DocumentType.AADHAAR_CARD, DocumentType.PAN_CARD],
    [DocumentType.OWNERSHIP_PROOF, DocumentType.ADDRESS_PROOF],
  ],
  [ConnectionType.COMMERCIAL]: [
    [DocumentType.AADHAAR_CARD, DocumentType.PAN_CARD],
    [DocumentType.OWNERSHIP_PROOF, DocumentType.ADDRESS_PROOF],
  ],
  [ConnectionType.INDUSTRIAL]: [
    [DocumentType.AADHAAR_CARD, DocumentType.PAN_CARD],
    [DocumentType.OWNERSHIP_PROOF, DocumentType.ADDRESS_PROOF],
  ],
  [ConnectionType.AGRICULTURAL]: [
    [DocumentType.AADHAAR_CARD, DocumentType.PAN_CARD],
    [DocumentType.OWNERSHIP_PROOF, DocumentType.ADDRESS_PROOF],
  ],
};

/** Human-readable label for each required group, in group order. */
export const REQUIRED_DOCUMENT_LABELS: Record<ConnectionType, string[]> = {
  [ConnectionType.DOMESTIC]: ['Identity Proof (Aadhaar/PAN)', 'Ownership / Address Proof'],
  [ConnectionType.COMMERCIAL]: ['Identity Proof (Aadhaar/PAN)', 'Ownership / Address Proof'],
  [ConnectionType.INDUSTRIAL]: ['Identity Proof (Aadhaar/PAN)', 'Ownership / Address Proof'],
  [ConnectionType.AGRICULTURAL]: ['Identity Proof (Aadhaar/PAN)', 'Ownership / Address Proof'],
};

export interface DocumentCompletenessAssessment {
  complete: boolean;
  /** Human-readable reasons the submission was held, e.g. missing / flagged docs. */
  issues: string[];
}

interface CompletenessDocument {
  documentType: string;
  documentName: string;
  isUnreadable?: boolean | null;
  needsReview?: boolean | null;
}

/**
 * Assesses whether the documents attached to an application satisfy every
 * required group for its connection type. A document counts as acceptable for
 * a group only when it is a listed type AND it is neither unreadable nor
 * flagged for manual review.
 */
export const assessDocumentCompleteness = (
  documents: CompletenessDocument[],
  connectionType: ConnectionType,
): DocumentCompletenessAssessment => {
  const groups = REQUIRED_DOCUMENT_GROUPS[connectionType] ?? [];
  const labels = REQUIRED_DOCUMENT_LABELS[connectionType] ?? [];
  const issues: string[] = [];

  groups.forEach((allowedTypes, index) => {
    const label = labels[index] ?? `Required document ${index + 1}`;
    const matches = documents.filter((d) => allowedTypes.includes(d.documentType as DocumentType));
    if (matches.length === 0) {
      issues.push(`${label} is missing`);
      return;
    }
    const acceptable = matches.filter((d) => !d.isUnreadable && !d.needsReview);
    if (acceptable.length === 0) {
      const names = matches.map((d) => `"${d.documentName}"`).join(', ');
      issues.push(`${label} is flagged for review (${names}) — please re-upload a clearer copy`);
    }
  });

  return { complete: issues.length === 0, issues };
};

import { DocumentType } from '@prisma/client';

/**
 * Cross-document identity consistency validation.
 *
 * Every submission is required to carry identity proof (Aadhaar and/or PAN,
 * plus optionally a driving licence). When an application holds MORE THAN ONE
 * identity document, the person's core identity fields (name, father's name,
 * date of birth) must agree across those documents — an Aadhaar that resolves
 * to "Pranav Dembla" and a PAN that resolves to "Rajesh Kumar" cannot both
 * describe the same applicant.
 *
 * This is a pure, dependency-free module (mirroring `requiredDocuments.ts`):
 * callers pass in documents with their DECRYPTED identity field values and
 * receive an `{ complete, conflicts, issues }` assessment. The consumer-facing
 * `issues` strings carry NO raw field values (only document names and field
 * labels), so they are safe to persist on the application timeline / send via
 * notification. The structured `conflicts` array retains the decrypted values
 * for the officer review UI, which is authorized to display them.
 *
 * Normalization is deliberately format-insensitive (case, whitespace,
 * punctuation) so "PRANAV DEMBLA" and "Pranav Dembla" agree, while a genuine
 * single-character/middle-name difference is still surfaced as a conflict for
 * human review.
 */

/** Document types that carry the applicant's own identity (name/DOB/father). */
export const IDENTITY_DOC_TYPES: readonly DocumentType[] = [
  DocumentType.AADHAAR_CARD,
  DocumentType.PAN_CARD,
  DocumentType.DRIVING_LICENSE,
];

/** Fields compared across multiple identity documents. */
export const CROSS_DOCUMENT_FIELDS: readonly { field: string; label: string }[] = [
  { field: 'name', label: 'Name' },
  { field: 'fatherName', label: 'Father Name' },
  { field: 'dob', label: 'Date of Birth' },
];

export interface CrossDocumentRecord {
  documentId: string;
  documentType: string;
  documentName: string;
  /** Decrypted identity fields (may be null when the document lacks them). */
  name?: string | null;
  fatherName?: string | null;
  dob?: string | null;
  /** True when the document's OCR result should not be trusted for identity. */
  isUnreadable?: boolean | null;
  needsReview?: boolean | null;
}

export interface CrossDocumentConflict {
  /** Field key, e.g. `name` / `fatherName` / `dob`. */
  field: string;
  /** Human label, e.g. `Name`. */
  fieldLabel: string;
  /** Every identity document that carried a value for this field. */
  values: Array<{ documentId: string; documentName: string; value: string }>;
}

export interface CrossDocumentAssessment {
  /** True when no cross-document conflict was found. */
  complete: boolean;
  /** Structured conflicts (decrypted values — for the authorized review UI). */
  conflicts: CrossDocumentConflict[];
  /** Consumer-safe issue sentences (no raw field values). */
  issues: string[];
}

/** Format-insensitive identity comparison: case + whitespace + punctuation. */
export const normalizeIdentityValue = (value: string): string =>
  value.replace(/[\s-]|[/.]/g, '').toUpperCase();

/** Builds a conflict record for one field with the values that disagreed. */
const buildConflict = (
  field: string,
  fieldLabel: string,
  records: CrossDocumentRecord[],
): CrossDocumentConflict => ({
  field,
  fieldLabel,
  values: records.map((r) => ({
    documentId: r.documentId,
    documentName: r.documentName,
    value: String(r[field as keyof CrossDocumentRecord] ?? ''),
  })),
});

/** Human sentence WITHOUT raw field values (safe for timeline/notifications). */
const describeConflict = (c: CrossDocumentConflict): string => {
  const names = c.values.map((v) => `"${v.documentName}"`).join(' and ');
  return `${c.fieldLabel} differs between ${names} — please verify the documents match the applicant's records`;
};

/**
 * Assesses cross-document identity consistency for a set of attached documents.
 *
 * Comparison rules:
 *   - Only identity-bearing documents (Aadhaar / PAN / Driving Licence) whose
 *     OCR output is readable and NOT flagged for review participate. A flagged
 *     or unreadable document must be corrected/re-uploaded before it can be
 *     cross-checked (the completeness gate already holds such submissions).
 *   - A field is only compared when at least two participating documents carry
 *     a non-empty value for it.
 *   - Values are compared format-insensitively (see `normalizeIdentityValue`).
 */
export const assessCrossDocumentConsistency = (
  documents: CrossDocumentRecord[],
): CrossDocumentAssessment => {
  const readableIdentity = documents.filter(
    (d) =>
      IDENTITY_DOC_TYPES.includes(d.documentType as DocumentType) &&
      !d.isUnreadable &&
      !d.needsReview,
  );

  const conflicts: CrossDocumentConflict[] = [];
  for (const { field, label } of CROSS_DOCUMENT_FIELDS) {
    const withValue = readableIdentity.filter((d) => {
      const raw = d[field as keyof CrossDocumentRecord];
      return typeof raw === 'string' && normalizeIdentityValue(raw).length > 0;
    });
    if (withValue.length < 2) continue;

    // Group participating documents by their normalized value.
    const groups = new Map<string, CrossDocumentRecord[]>();
    for (const d of withValue) {
      const key = normalizeIdentityValue(String(d[field as keyof CrossDocumentRecord]));
      const bucket = groups.get(key) ?? [];
      bucket.push(d);
      groups.set(key, bucket);
    }
    if (groups.size < 2) continue; // every doc agrees — no conflict.

    // Surface as exactly one conflict per field (values in document order).
    const values = Array.from(groups.values()).flatMap((group) => group);
    conflicts.push(buildConflict(field, label, values));
  }

  return {
    complete: conflicts.length === 0,
    conflicts,
    issues: conflicts.map(describeConflict),
  };
};
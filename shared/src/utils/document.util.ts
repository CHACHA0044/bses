import { encryptionService } from './encryption.util';

export type OcrStatus = 'PROCESSING' | 'EXTRACTED' | 'UNREADABLE' | 'NEEDS_REVIEW';

/** Prisma `Decimal` carries `toString()` — accepted structurally to avoid a Prisma import. */
export interface DecimalLike {
  toString(): string;
}

/** Structural shape of a raw Prisma `Document` row (kept dependency-free). */
export interface RawDocument {
  id: string;
  documentName: string;
  documentType: string;
  fileSize: DecimalLike | number | bigint | string | null;
  mimeType: string;
  uploadDate: Date | string;
  status: string;
  gridfsFileId?: string | null;
  connectionRequestId?: string | null;
  deletedAt?: Date | string | null;
  isUnreadable?: boolean | null;
  ocrConfidence?: DecimalLike | number | bigint | string | null;
  extractedAadhaarEncrypted?: string | null;
  extractedPanEncrypted?: string | null;
  extractedNameEncrypted?: string | null;
  extractedDobEncrypted?: string | null;
  extractedFatherNameEncrypted?: string | null;
  extractedLicenseNumberEncrypted?: string | null;
  extractedAddressEncrypted?: string | null;
  extractedValidityEncrypted?: string | null;
  extractedPinCodeEncrypted?: string | null;
  extractedStateEncrypted?: string | null;
  extractedDistrictEncrypted?: string | null;
  extractedIssueDateEncrypted?: string | null;
  extractedExpiryDateEncrypted?: string | null;
  extractedIssuingAuthorityEncrypted?: string | null;
  extractedBloodGroupEncrypted?: string | null;
  extractedAuthorizationEncrypted?: string | null;
  extractedPermanentAddrEncrypted?: string | null;
  extractedFieldsEdited?: unknown | null;
  ocrRawTextEncrypted?: string | null;
  needsReview?: boolean | null;
  ocrLowConfidenceFields?: unknown | null;
}

export interface DocumentOcrData {
  aadhaar: string | null;
  pan: string | null;
  name: string | null;
  dob: string | null;
  fatherName: string | null;
  licenseNumber: string | null;
  address: string | null;
  validity: string | null;
  pinCode?: string | null;
  state?: string | null;
  district?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  issuingAuthority?: string | null;
  bloodGroup?: string | null;
  authorization?: string | null;
  permanentAddress?: string | null;
  /** Field names (e.g. `name`, `dob`) the consumer has edited/corrected. */
  editedFields: string[];
  rawText?: string | null;
}

export interface DocumentView {
  id: string;
  documentName: string;
  documentType: string;
  fileSize: number;
  mimeType: string;
  uploadDate: string;
  status: string;
  gridfsFileId: string | null;
  connectionRequestId: string | null;
  isUnreadable: boolean;
  ocrConfidence: number | null;
  ocrStatus: OcrStatus;
  /** True when OCR output was flagged for manual verification. */
  needsReview: boolean;
  /** Field keys (e.g. `extractedDob`) whose value was flagged as a likely misread. */
  ocrLowConfidenceFields: string[];
  ocrData: DocumentOcrData;
}

/** Last 4 digits only — `•••• •••• 1234`. */
const maskAadhaar = (value: string): string => {
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return value;
  return `XXXX XXXX ${digits.slice(-4)}`;
};

/** Keep first letter and last 5 characters (PAN is 10 chars) — `A••••1234F`. */
const maskPan = (value: string): string => {
  if (value.length <= 6) return value.slice(0, 1) + '•••••';
  return `${value[0]}••••${value.slice(-5)}`;
};

/** Keep first letter only — `R••••`. */
const maskName = (value: string): string =>
  value.length > 0 ? `${value[0]}••••` : value;

/** Keep year only — `••/••/1990`. */
const maskDob = (value: string): string => {
  const match = value.match(/(\d{4})$/);
  return match ? `••/••/${match[1]}` : value;
};

/** Keep last 4 characters — `••••5678`. */
const maskTail = (value: string): string => {
  if (value.length <= 4) return '••••';
  return `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;
};

/** Keep last 4 alphanumeric characters of the licence number. */
const maskLicenseNumber = (value: string): string => maskTail(value.replace(/\s/g, ''));

/** Mask address to first 4 chars + last 12 — `12•...• Nagar`. */
const maskAddress = (value: string): string => {
  if (value.length <= 16) return '••••••••';
  return `${value.slice(0, 4)}•••...${value.slice(-12)}`;
};

const parseEditedFields = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string');
  }
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>);
  }
  return [];
};

const decryptField = (ciphertext: string | null | undefined): string | null => {
  if (!ciphertext) return null;
  try {
    return encryptionService.decrypt(ciphertext) || null;
  } catch {
    return null;
  }
};

const toOcrStatus = (
  isUnreadable: boolean,
  ocrConfidence: number | null,
  needsReview: boolean,
): OcrStatus => {
  if (isUnreadable) return 'UNREADABLE';
  if (needsReview && ocrConfidence !== null) return 'NEEDS_REVIEW';
  if (ocrConfidence !== null) return 'EXTRACTED';
  return 'PROCESSING';
};

/**
 * Maps a raw Prisma `Document` row into a safe API view.
 *
 * - Strips every `*Encrypted` column so ciphertext never leaves the service.
 * - `includeSensitive: true` (owner/admin/officer callers) returns fully
 *   decrypted PII; consumer-facing responses get masked values.
 * - `includeRawText` controls the raw OCR dump independently — it defaults to
 *   the `includeSensitive` value so owners do not receive the raw dump by
 *   default even though they can see (and correct) their extracted fields.
 */
export const toDocumentView = (
  doc: RawDocument,
  opts: { includeSensitive?: boolean; includeRawText?: boolean } = {},
): DocumentView => {
  const includeSensitive = opts.includeSensitive === true;
  const includeRawText = opts.includeRawText ?? includeSensitive;

  const rawAadhaar = decryptField(doc.extractedAadhaarEncrypted);
  const rawPan = decryptField(doc.extractedPanEncrypted);
  const rawName = decryptField(doc.extractedNameEncrypted);
  const rawDob = decryptField(doc.extractedDobEncrypted);
  const rawFatherName = decryptField(doc.extractedFatherNameEncrypted);
  const rawLicenseNumber = decryptField(doc.extractedLicenseNumberEncrypted);
  const rawAddress = decryptField(doc.extractedAddressEncrypted);
  const rawValidity = decryptField(doc.extractedValidityEncrypted);
  const rawPinCode = decryptField(doc.extractedPinCodeEncrypted);
  const rawState = decryptField(doc.extractedStateEncrypted);
  const rawDistrict = decryptField(doc.extractedDistrictEncrypted);
  const rawIssueDate = decryptField(doc.extractedIssueDateEncrypted);
  const rawExpiryDate = decryptField(doc.extractedExpiryDateEncrypted);
  const rawIssuingAuthority = decryptField(doc.extractedIssuingAuthorityEncrypted);
  const rawBloodGroup = decryptField(doc.extractedBloodGroupEncrypted);
  const rawAuthorization = decryptField(doc.extractedAuthorizationEncrypted);
  const rawPermanentAddr = decryptField(doc.extractedPermanentAddrEncrypted);
  const rawText = includeRawText ? decryptField(doc.ocrRawTextEncrypted) : null;

  const ocrConfidence = doc.ocrConfidence == null ? null : Number(doc.ocrConfidence.toString());
  const needsReview = doc.needsReview === true;
  const ocrLowConfidenceFields = parseEditedFields(doc.ocrLowConfidenceFields);

  const ocrData: DocumentOcrData = includeSensitive
    ? {
        aadhaar: rawAadhaar,
        pan: rawPan,
        name: rawName,
        dob: rawDob,
        fatherName: rawFatherName,
        licenseNumber: rawLicenseNumber,
        address: rawAddress,
        validity: rawValidity,
        pinCode: rawPinCode,
        state: rawState,
        district: rawDistrict,
        issueDate: rawIssueDate,
        expiryDate: rawExpiryDate,
        issuingAuthority: rawIssuingAuthority,
        bloodGroup: rawBloodGroup,
        authorization: rawAuthorization,
        permanentAddress: rawPermanentAddr,
        editedFields: parseEditedFields(doc.extractedFieldsEdited),
        rawText,
      }
    : {
        aadhaar: rawAadhaar ? maskAadhaar(rawAadhaar) : null,
        pan: rawPan ? maskPan(rawPan) : null,
        name: rawName ? maskName(rawName) : null,
        dob: rawDob ? maskDob(rawDob) : null,
        fatherName: rawFatherName ? maskName(rawFatherName) : null,
        licenseNumber: rawLicenseNumber ? maskLicenseNumber(rawLicenseNumber) : null,
        address: rawAddress ? maskAddress(rawAddress) : null,
        validity: rawValidity ? maskDob(rawValidity) : null,
        pinCode: rawPinCode ? maskTail(rawPinCode) : null,
        state: rawState,
        district: rawDistrict,
        issueDate: rawIssueDate ? maskDob(rawIssueDate) : null,
        expiryDate: rawExpiryDate ? maskDob(rawExpiryDate) : null,
        issuingAuthority: rawIssuingAuthority,
        bloodGroup: rawBloodGroup,
        authorization: rawAuthorization,
        permanentAddress: rawPermanentAddr ? maskAddress(rawPermanentAddr) : null,
        editedFields: parseEditedFields(doc.extractedFieldsEdited),
      };

  return {
    id: doc.id,
    documentName: doc.documentName,
    documentType: doc.documentType,
    fileSize: Number(doc.fileSize?.toString() ?? 0),
    mimeType: doc.mimeType,
    uploadDate: new Date(doc.uploadDate).toISOString(),
    status: doc.status,
    gridfsFileId: doc.gridfsFileId ?? null,
    connectionRequestId: doc.connectionRequestId ?? null,
    isUnreadable: doc.isUnreadable === true,
    ocrConfidence,
    ocrStatus: toOcrStatus(doc.isUnreadable === true, ocrConfidence, needsReview),
    needsReview,
    ocrLowConfidenceFields,
    ocrData,
  };
};

/** Convenience mapper for arrays of raw document rows. */
export const toDocumentViews = (
  docs: RawDocument[] | undefined | null,
  opts: { includeSensitive?: boolean; includeRawText?: boolean } = {},
): DocumentView[] => (docs ?? []).map((d) => toDocumentView(d, opts));

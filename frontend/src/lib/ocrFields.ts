/**
 * Human-readable labels for OCR field keys as stored in
 * `DocumentRecord.ocrLowConfidenceFields` (keys are the `extracted*` field
 * names produced by the OCR extractors). Shared by the admin connection detail
 * page and any other surface that renders low-confidence fields per-document.
 */
export const OCR_FIELD_LABELS: Record<string, string> = {
  extractedAadhaar: 'Aadhaar',
  extractedPan: 'PAN',
  extractedName: 'Name',
  extractedDob: 'Date of Birth',
  extractedYearOfBirth: 'Year of Birth',
  extractedGender: 'Gender',
  extractedFatherName: "Father's Name",
  extractedLicenseNumber: 'Licence Number',
  extractedValidity: 'Licence Validity',
  extractedAddress: 'Address',
};

export const extractedToLabel = (key: string): string =>
  OCR_FIELD_LABELS[key] ?? key.replace(/^extracted/, '');

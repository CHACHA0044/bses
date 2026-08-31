import { describe, it, expect } from 'vitest';
import { DocumentType } from '@prisma/client';
import {
  extractAadhaar,
  extractPan,
  extractDob,
  extractName,
  extractAadhaarName,
  extractFatherName,
  extractPanPositionalNames,
  extractLicenseNumber,
  extractValidity,
  extractAddress,
  extractFields,
  validateDob,
  buildExtractedResult,
  selectBestCandidate,
} from '../../../src/services/ocr/extractors';

describe('extractAadhaar', () => {
  it('extracts 4-4-4 grouped aadhaar numbers', () => {
    expect(extractAadhaar('Government of India\n1234 5678 9012\nFemale')).toBe('123456789012');
  });

  it('extracts contiguous 12-digit aadhaar numbers', () => {
    expect(extractAadhaar('123456789012')).toBe('123456789012');
  });

  it('ignores 10-digit mobile numbers', () => {
    expect(extractAadhaar('Phone: 9876543210')).toBeUndefined();
  });
});

describe('extractPan', () => {
  it('extracts a valid PAN', () => {
    expect(extractPan('Income Tax Department\nABCDE1234F')).toBe('ABCDE1234F');
  });

  it('rejects an invalid PAN', () => {
    expect(extractPan('ABCDE12345')).toBeUndefined();
  });
});

describe('extractDob', () => {
  it('prefers an explicitly labelled date of birth', () => {
    expect(extractDob('Date of Birth: 15/08/1990\n1234 5678 9012')).toBe('15/08/1990');
  });

  it('handles DOB with hyphen separators', () => {
    expect(extractDob('DOB : 15-08-1990')).toBe('15-08-1990');
  });

  it('falls back to the first plausible date', () => {
    expect(extractDob('Some text\n01/01/1980\nmore text')).toBe('01/01/1980');
  });
});

describe('extractName', () => {
  it('extracts a labelled name', () => {
    expect(extractName('Name : RAJESH KUMAR\nDOB: 15/08/1990')).toBe('RAJESH KUMAR');
  });

  it('extracts a consumer name', () => {
    expect(extractName('Consumer Name: PRIYA SHARMA')).toBe('PRIYA SHARMA');
  });

  it('does not confuse father/mother names with the applicant name', () => {
    expect(extractName("Father's Name: SURESH KUMAR")).toBeUndefined();
  });
});

describe('extractFatherName', () => {
  it("extracts the father's name", () => {
    expect(extractFatherName("Father's Name : MOHAN LAL\nDOB: 01/01/1980")).toBe('MOHAN LAL');
  });

  it('handles the F/Name shorthand', () => {
    expect(extractFatherName('F/Name: RAVI')).toBe('RAVI');
  });
});

describe('extractLicenseNumber', () => {
  it('extracts a standard Indian driving licence number', () => {
    expect(extractLicenseNumber('DL-09-2024-1234567')).toBe('DL-09-2024-1234567');
  });

  it('extracts a licence number with spaces', () => {
    expect(extractLicenseNumber('KA 03 2007 0012345')).toBe('KA 03 2007 0012345');
  });

  it('extracts a contiguous licence number', () => {
    expect(extractLicenseNumber('HR0619850034771')).toBe('HR0619850034771');
  });
});

describe('extractValidity', () => {
  it('extracts the valid-till date', () => {
    expect(extractValidity('Valid Till: 30/12/2030')).toBe('30/12/2030');
  });

  it('extracts the valid-upto date', () => {
    expect(extractValidity('Valid Upto 31/12/2029')).toBe('31/12/2029');
  });
});

describe('extractAddress', () => {
  it('extracts a labelled address', () => {
    expect(extractAddress('Address: 12, MG Road, Bengaluru 560001')).toBe('12, MG Road, Bengaluru 560001');
  });
});

describe('extractFields routing', () => {
  it('routes Aadhaar cards to aadhaar/name/dob', () => {
    const result = extractFields(
      'Government of India\nName: RAJESH KUMAR\nDOB: 15/08/1990\n1234 5678 9012\nMale',
      DocumentType.AADHAAR_CARD,
    );
    expect(result.extractedAadhaar).toBe('1990 1234 5678');
    expect(result.extractedName).toBe('RAJESH KUMAR');
    expect(result.extractedDob).toBe('15/08/1990');
    expect(result.isUnreadable).toBe(false);
  });

  it('routes PAN cards to pan/name/fatherName/dob', () => {
    const result = extractFields(
      "Income Tax Department\nName: RAJESH KUMAR\nFather's Name: MOHAN LAL\nDOB: 15/08/1990\nABCDE1234F",
      DocumentType.PAN_CARD,
    );
    expect(result.extractedPan).toBe('ABCDE1234F');
    expect(result.extractedName).toBe('RAJESH KUMAR');
    expect(result.extractedFatherName).toBe('MOHAN LAL');
    expect(result.extractedDob).toBe('15/08/1990');
  });

  it('extracts bare-layout PAN name + father positionally (real card OCR)', () => {
    const text =
      'Se famrst # HARA AHR\n' +
      'INCOME TAX DEPARTMENT GOVT. OF INDIA\n' +
      'D MANIKANDAN - TE A\n' +
      'DURAISAMY Fed] %\n' +
      'Pe FLT\n' +
      '16/07/1986 Los\n' +
      'Permanent Account Number\n' +
      'BNZPM2501F o]\n' +
      'ER a Conk\n' +
      'Signature ole IG 2\n' +
      'El a N';
    const result = extractFields(text, DocumentType.PAN_CARD, 47);
    expect(result.extractedPan).toBe('BNZPM2501F');
    expect(result.extractedName).toBe('MANIKANDAN');
    expect(result.extractedFatherName).toBe('DURAISAMY');
    expect(result.extractedDob).toBe('16/07/1986');
  });

  it('detects a driving licence under ADDRESS_PROOF', () => {
    const result = extractFields(
      'TRANSPORT DEPARTMENT\nName: ROHAN MEHTA\nDOB: 12/04/1988\nDL-09-2024-1234567\nValid Till: 30/12/2030',
      DocumentType.ADDRESS_PROOF,
    );
    expect(result.extractedLicenseNumber).toBe('DL-09-2024-1234567');
    expect(result.extractedValidity).toBe('30/12/2030');
    expect(result.extractedDob).toBe('12/04/1988');
  });

  it('extracts name + address for a utility bill under ADDRESS_PROOF', () => {
    const result = extractFields(
      'BSES Rajdhani Power Ltd\nConsumer Name: PRIYA SHARMA\nAddress: 45, Park Street, New Delhi 110001',
      DocumentType.ADDRESS_PROOF,
    );
    expect(result.extractedName).toBe('PRIYA SHARMA');
    expect(result.extractedAddress).toBe('45, Park Street, New Delhi 110001');
    expect(result.extractedLicenseNumber || undefined).toBeUndefined();
  });
});

describe('extractAadhaarName (positional, from real scan text)', () => {
  it('picks the line above DOB skipping Devanagari noise', () => {
    const text = 'asdf asdf\nsadf asd\nNiranjan Kumar\nStH afr / DOB : 12/04/2000\n1234 5678 9012';
    expect(extractAadhaarName(text)).toBe('Niranjan Kumar');
  });

  it('drops the noisy single-letter token prefix', () => {
    const text = 'asdf asdf\nH | Vilas Rakhe\n5 A 8 w+ ai@/DOB: 30/05/1995\n1234 5678 9012';
    expect(extractAadhaarName(text)).toBe('Vilas Rakhe');
  });

  it('keeps a single-token name line above DOB', () => {
    const text = 'S Anjali\nH C. w= fat 1 DOB : 18/09/1599\n1234 5678 9012';
    expect(extractAadhaarName(text)).toBe('Anjali');
  });

  it('handles label-based cards whose name sits above the DOB line', () => {
    const text = 'Name: RAJESH KUMAR\nDOB: 15/08/1990\n1234 5678 9012\nMale';
    expect(extractAadhaarName(text)).toBe('RAJESH KUMAR');
  });
});

describe('validateDob', () => {
  it('accepts plausible dates in range 1930..today', () => {
    expect(validateDob('30/05/1995').valid).toBe(true);
    expect(validateDob('01/01/1930').valid).toBe(true);
  });

  it('rejects impossible dates and OCR-garbled years', () => {
    expect(validateDob('18/09/1599').valid).toBe(false);
    expect(validateDob('14/04/1907').valid).toBe(false);
    expect(validateDob('32/13/1990').valid).toBe(false);
    expect(validateDob('15/08/0204').valid).toBe(false);
  });
});

describe('extractFatherName (multi-line capture)', () => {
  it('joins the label line with a continuation line', () => {
    const text = "Father's Name SERRA bb\nAFZAL ANISH.\nDate of Birth: 15/08/1990";
    expect(extractFatherName(text)).toBe('SERRA AFZAL ANISH');
  });

  it('rejects a garbled label line when nothing follows it', () => {
    const text = "Father's Name SERRA bb\nDOB: 15/08/1990";
    expect(extractFatherName(text)).toBeUndefined();
  });
});

describe('needsReview via extractFields', () => {
  it('flags implausible DOB and low confidence as needsReview', () => {
    const result = extractFields(
      'DOB: 18/09/1599\n1234 5678 9012\nAnjali',
      DocumentType.AADHAAR_CARD,
      55,
    );
    expect(result.extractedDob).toBe('18/09/1599');
    expect(result.lowConfidenceFields).toContain('extractedDob');
    expect(result.needsReview).toBe(true);
  });

  it('stays clean on a high-confidence extract with valid fields', () => {
    const result = extractFields(
      'Government of India\nName: RAJESH KUMAR\nDOB: 15/08/1990\n1234 5678 9012\nMale',
      DocumentType.AADHAAR_CARD,
      95,
    );
    expect(result.needsReview).toBe(false);
    expect(result.lowConfidenceFields).toEqual([]);
  });

  it('flags a PAN with missing fields as needsReview', () => {
    const result = extractFields(
      'INCOME TAX DEPARTMENT GOVT. OF INDIA\nPe FLT\n16/07/1986 Los\nPermanent Account Number\nBNZPM2501F o]',
      DocumentType.PAN_CARD,
      47,
    );
    expect(result.extractedPan).toBe('BNZPM2501F');
    expect(result.extractedDob).toBe('16/07/1986');
    expect(result.extractedName || undefined).toBeUndefined();
    expect(result.needsReview).toBe(true);
  });

  it('does not flag a PAN whose extraction is complete and valid', () => {
    const result = extractFields(
      'INCOME TAX DEPARTMENT GOVT. OF INDIA\nMANIKANDAN\nDURAISAMY\n16/07/1986 Los\nPermanent Account Number\nBNZPM2501F',
      DocumentType.PAN_CARD,
      90,
    );
    expect(result.extractedName).toBe('MANIKANDAN');
    expect(result.extractedFatherName).toBe('DURAISAMY');
    expect(result.needsReview).toBe(false);
  });
});

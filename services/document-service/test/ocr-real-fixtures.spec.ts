import fs from 'fs';
import path from 'path';
import { describe, it, expect } from 'vitest';
import { PDFParse } from 'pdf-parse';
import { runModularExtraction, toExtractedData } from '../src/services/ocr/extractors/index';

describe('OCR Real Document Fixtures Test Suite', () => {
  it('should extract structured fields accurately from ADHAR.pdf', async () => {
    const filePath = path.join(__dirname, 'fixtures', 'ADHAR.pdf');
    if (!fs.existsSync(filePath)) {
      console.warn('ADHAR.pdf not found in test/fixtures, skipping test');
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({
      data: buffer,
      isEvalSupported: false,
      enableXfa: false,
      stopAtErrors: false,
    });
    const { text } = await parser.getText({ first: 1 });
    await parser.destroy();

    expect(text).toBeTruthy();

    const extraction = runModularExtraction(text, 'AADHAAR_CARD' as any, 90);
    const legacy = toExtractedData(extraction);

    console.log('--- Aadhaar Extraction Results ---');
    console.log('Detected Type:', extraction.detectedType);
    console.log('Overall Confidence:', extraction.overallConfidence);
    console.log('Fields:', JSON.stringify(extraction.fields, null, 2));

    expect(extraction.detectedType).toBe('AADHAAR');
    expect(legacy.extractedAadhaar).toBeDefined();
    expect(legacy.extractedAadhaar).toMatch(/XXXX XXXX \d{4}/);
    expect(legacy.extractedName).toBeTruthy();
    expect(legacy.extractedDob).toBeTruthy();
    expect(legacy.extractedAddress).toBeTruthy();
    expect(legacy.extractedPinCode).toBeTruthy();
  });

  it('should extract structured fields accurately from dl.pdf', async () => {
    const filePath = path.join(__dirname, 'fixtures', 'dl.pdf');
    if (!fs.existsSync(filePath)) {
      console.warn('dl.pdf not found in test/fixtures, skipping test');
      return;
    }

    const buffer = fs.readFileSync(filePath);
    const parser = new PDFParse({
      data: buffer,
      isEvalSupported: false,
      enableXfa: false,
      stopAtErrors: false,
    });
    const { text } = await parser.getText({ first: 1 });
    await parser.destroy();

    expect(text).toBeTruthy();

    const extraction = runModularExtraction(text, 'ADDRESS_PROOF' as any, 90);
    const legacy = toExtractedData(extraction);

    console.log('--- Driving Licence Extraction Results ---');
    console.log('Detected Type:', extraction.detectedType);
    console.log('Overall Confidence:', extraction.overallConfidence);
    console.log('Fields:', JSON.stringify(extraction.fields, null, 2));

    expect(extraction.detectedType).toBe('DRIVING_LICENSE');
    expect(legacy.extractedLicenseNumber).toBeTruthy();
    expect(legacy.extractedName).toBeTruthy();
    expect(legacy.extractedDob).toBeTruthy();
    expect(legacy.extractedFatherName).toBeTruthy();
    expect(legacy.extractedIssuingAuthority).toBeTruthy();
    expect(legacy.extractedIssueDate).toBeTruthy();
    expect(legacy.extractedValidity).toBeTruthy();
  });
});

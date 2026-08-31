import { describe, it, expect } from 'vitest';
import zlib from 'zlib';
import { parseQrPayload } from '../../../src/services/ocr/qrPayload';const secureXml = (data: Record<string, unknown>, compress = true): string => {
  const json = JSON.stringify(data);
  const bytes = compress ? zlib.deflateSync(Buffer.from(json)) : Buffer.from(json);
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Signature xmlns="http://www.w3.org/2000/09/xmldsig#">AAABBBCCC=</Signature>',
    `<Data>${bytes.toString('base64')}</Data>`,
  ].join('\n');
};

const sampleEkyc = {
  uid: '1234 5678 9012',
  name: 'RAKESH KUMAR',
  dob: '1990-08-15',
  gender: 'M',
  co: 'S/O SURESH KUMAR',
  house: 'HOUSE NO 45',
  loc: 'ASHOK NAGAR',
  vtc: 'SHAHDARA',
  po: 'SHAHDARA',
  dist: 'NORTH EAST DELHI',
  subdist: 'SHAHDARA',
  state: 'DELHI',
  pc: '110093',
  gname: 'RAKESH',
  lname: 'KUMAR',
};

/** Builds a synthetic legacy numeric QR payload (V2, 0xFF fields, gzip, big-endian digits). */
const legacyNumericPayload = (fields: string[], withPhoto = true): string => {
  const parts = ['V2', '3', '123456789012345678901', ...fields];
  const sep = Buffer.from([0xff]);
  let text = Buffer.concat(parts.map((p) => Buffer.concat([Buffer.from(p, 'utf8'), sep])));
  if (withPhoto) {
    text = Buffer.concat([
      text,
      Buffer.from([0xff, 0x4f, 0x00, 0x51, 0x00, 0x47, 0x00, 0xff, 0x99, 0x02]),
    ]);
  }
  const compressed = zlib.gzipSync(text);
  const big = BigInt(`0x${compressed.toString('hex')}`);
  return big.toString(10);
};

const printLetter = (attrs: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><PrintLetterBarcodeData ${attrs}/>`;

describe('parseQrPayload — Aadhaar Secure QR', () => {
  it('decodes a zlib-compressed JSON payload (newer format)', () => {
    const parsed = parseQrPayload(secureXml(sampleEkyc));
    expect(parsed.format).toBe('aadhaar-secure');
    expect(parsed.fields.extractedName).toBe('RAKESH KUMAR');
    expect(parsed.fields.extractedDob).toBe('15/08/1990');
    expect(parsed.fields.extractedGender).toBe('Male');
    expect(parsed.fields.extractedAadhaar).toBe('123456789012');
    expect(parsed.fields.extractedAddress).toContain('HOUSE NO 45');
    expect(parsed.fields.extractedAddress).toContain('110093');
  });

  it('decodes an uncompressed JSON payload', () => {
    const parsed = parseQrPayload(secureXml(sampleEkyc, false));
    expect(parsed.format).toBe('aadhaar-secure');
    expect(parsed.fields.extractedDob).toBe('15/08/1990');
  });

  it('handles a year-of-birth payload without a full date', () => {
    const parsed = parseQrPayload(secureXml({ name: 'ANJALI', yob: '1990', gender: 'F' }));
    expect(parsed.fields.extractedDob).toBeUndefined();
    expect(parsed.fields.extractedYearOfBirth).toBe('1990');
    expect(parsed.fields.extractedGender).toBe('Female');
  });

  it('keeps a masked reference number when the full UID is absent', () => {
    const parsed = parseQrPayload(secureXml({ name: 'ANJALI', dob: '1990-08-15', gender: 'F', uid: 'XXXX XXXX 9012' }));
    expect(parsed.fields.extractedAadhaar).toBe('XXXXXXXX9012');
  });

  it('strips the embedded photo from the retained raw payload', () => {
    const withPhoto = { ...sampleEkyc, photo: 'a'.repeat(4000) };
    const parsed = parseQrPayload(secureXml(withPhoto));
    expect(parsed.hasPhoto).toBe(true);
    expect(parsed.raw.length).toBeLessThan(500);
    expect(parsed.raw).not.toContain('a'.repeat(4000));
    expect(parsed.fields.extractedName).toBe('RAKESH KUMAR');
  });
});

describe('parseQrPayload — Aadhaar PrintLetterBarcodeData', () => {
  it('parses the current UIDAI offline QR attribute payload', () => {
    const parsed = parseQrPayload(
      printLetter('uid="483586226030" name="Niranjan Kumar" gender="M" yob="2000" co="S/O: Rajkumar Gupta" vtc="Salempur" po="Nandlalpur" dist="Vaishali" subdist="Vaishali" state="Bihar" pc="844113" dob="12/04/2000"'),
    );
    expect(parsed.format).toBe('aadhaar-print-letter');
    expect(parsed.fields.extractedName).toBe('Niranjan Kumar');
    expect(parsed.fields.extractedDob).toBe('12/04/2000');
    expect(parsed.fields.extractedGender).toBe('Male');
    expect(parsed.fields.extractedAadhaar).toBe('483586226030');
    expect(parsed.fields.extractedAddress).toBe('S/O: Rajkumar Gupta, Salempur, Nandlalpur, Vaishali, Vaishali, Bihar, 844113');
    expect(parsed.hasPhoto).toBe(false);
  });
});

describe('parseQrPayload — Aadhaar legacy numeric QR (V1/V2/V3)', () => {
  it('decodes the gzip/decimal/0xFF record and extracts fields', () => {
    const parsed = parseQrPayload(
      legacyNumericPayload(['Vilas Rakhe', '30-05-1995', 'M', '', 'Jalna', '', 'ROW H.n. 2 sonal nagar', '', '431203', 'Jalna', 'Maharashtra']),
    );
    expect(parsed.format).toBe('aadhaar-legacy-numeric');
    expect(parsed.fields.extractedName).toBe('Vilas Rakhe');
    expect(parsed.fields.extractedDob).toBe('30/05/1995');
    expect(parsed.fields.extractedGender).toBe('Male');
    expect(parsed.fields.extractedAddress).toContain('ROW H.n. 2 sonal nagar');
    expect(parsed.fields.extractedAddress).toContain('431203');
    expect(parsed.fields.extractedAddress).toContain('Maharashtra');
    expect(parsed.hasPhoto).toBe(true);
    expect(parsed.raw.length).toBeLessThan(100);
  });

  it('flags the embedded photo and omits it from the retained raw', () => {
    const parsed = parseQrPayload(legacyNumericPayload(['Vilas Rakhe', '30-05-1995', 'M', 'Jalna', '431203']));
    expect(parsed.hasPhoto).toBe(true);
    expect(parsed.raw).not.toContain('JJ2000');
    expect(parsed.fields.extractedName).toBe('Vilas Rakhe');
  });

  it('does not invent an Aadhaar number for the old format (UID absent)', () => {
    const parsed = parseQrPayload(legacyNumericPayload(['Vilas Rakhe', '30-05-1995', 'M', 'Jalna', '431203']));
    expect(parsed.fields.extractedAadhaar).toBeUndefined();
  });

  it('returns null content (generic) for a digit payload that is not the legacy format', () => {
    const parsed = parseQrPayload('1'.repeat(500));
    expect(parsed.format).toBe('generic');
    expect(parsed.fields.extractedName).toBeUndefined();
  });
});

describe('parseQrPayload — legacy formats', () => {
  it('parses a legacy XML payload', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<Auth>',
      '  <Uid>1234 5678 9012</Uid>',
      '  <Name>RAKESH KUMAR</Name>',
      '  <Dob>15-08-1990</Dob>',
      '  <Gender>M</Gender>',
      '  <Co>S/O SURESH KUMAR</Co>',
      '  <House>HOUSE NO 45</House>',
      '  <Vtc>SHAHDARA</Vtc>',
      '  <Dist>NORTH EAST DELHI</Dist>',
      '  <State>DELHI</State>',
      '  <Pc>110093</Pc>',
      '</Auth>',
    ].join('\n');
    const parsed = parseQrPayload(xml);
    expect(parsed.format).toBe('aadhaar-legacy-xml');
    expect(parsed.fields.extractedName).toBe('RAKESH KUMAR');
    expect(parsed.fields.extractedDob).toBe('15/08/1990');
    expect(parsed.fields.extractedAadhaar).toBe('123456789012');
    expect(parsed.fields.extractedAddress).toContain('SHAHDARA');
  });

  it('parses a pipe-delimited legacy text payload regardless of field order', () => {
    const text = 'RAKESH KUMAR||M||15-08-1990||123456789012||S/O SURESH KUMAR||HOUSE NO 45||SHAHDARA||110093';
    const parsed = parseQrPayload(text);
    expect(parsed.format).toBe('aadhaar-legacy-text');
    expect(parsed.fields.extractedName).toBe('RAKESH KUMAR');
    expect(parsed.fields.extractedGender).toBe('Male');
    expect(parsed.fields.extractedDob).toBe('15/08/1990');
    expect(parsed.fields.extractedAadhaar).toBe('123456789012');
    expect(parsed.fields.extractedAddress).toContain('110093');
  });
});

describe('parseQrPayload — generic payloads', () => {
  it('runs generic extractors over an unknown payload (e.g. a PAN QR)', () => {
    const parsed = parseQrPayload('INCOME TAX DEPARTMENT\nABCDE1234F\nName: RAKESH KUMAR\nDOB: 15/08/1990');
    expect(parsed.format).toBe('generic');
    expect(parsed.fields.extractedPan).toBe('ABCDE1234F');
    expect(parsed.fields.extractedName).toBe('RAKESH KUMAR');
    expect(parsed.fields.extractedDob).toBe('15/08/1990');
  });

  it('detects a driving licence number in an unknown payload', () => {
    const parsed = parseQrPayload('Transport Dept\nDL-09-2024-1234567\nROHAN MEHTA\nValid Till: 30/12/2030');
    expect(parsed.fields.extractedLicenseNumber).toBe('DL-09-2024-1234567');
    expect(parsed.fields.extractedValidity).toBe('30/12/2030');
  });
});

describe('parseQrPayload — defensive', () => {
  it('never throws on garbage', () => {
    expect(() => parseQrPayload('')).not.toThrow();
    expect(() => parseQrPayload('@@not a payload@@')).not.toThrow();
    expect(() => parseQrPayload('<Data>!!!not-base64!!!</Data>')).not.toThrow();
    expect(() => parseQrPayload('a'.repeat(100000))).not.toThrow();
  });

  it('rejects JSON that is not a plain object (e.g. array)', () => {
    const parsed = parseQrPayload(secureXml(['not', 'an', 'object']));
    expect(parsed.format).toBe('generic');
    expect(parsed.fields.extractedName).toBeUndefined();
  });

  it('does not surface embedded base64 blobs as fields', () => {
    const parsed = parseQrPayload(`random text ${Buffer.from('binary junk').toString('base64')} more text`);
    expect(parsed.hasPhoto).toBe(false);
    expect(parsed.fields.extractedName).toBeUndefined();
  });
});

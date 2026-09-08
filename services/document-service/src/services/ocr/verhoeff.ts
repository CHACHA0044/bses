/**
 * Verhoeff checksum — the official UIDAI Aadhaar checksum algorithm.
 *
 * The 12-digit Aadhaar number is printed with a Verhoeff check digit so that
 * single-digit substitutions and adjacent transpositions (the two most common
 * OCR misreads on a printed card) are caught. The tables below are the
 * canonical constants published by H. W. Verhoeff (1969); they are not derived
 * from any Aadhaar sample, so there is no risk of overfitting to test data.
 */

const D: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const P: ReadonlyArray<ReadonlyArray<number>> = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

const INV: ReadonlyArray<number> = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

const toDigit = (ch: string): number => {
  const code = ch.charCodeAt(0);
  if (code < 48 || code > 57) throw new Error(`Expected a digit, got '${ch}'`);
  return code - 48;
};

/** Computes the Verhoeff checksum over `digits` right-to-left. Valid == 0. */
export const verhoeffChecksum = (digits: string): number => {
  let c = 0;
  for (let i = 0; i < digits.length; i++) {
    const d = toDigit(digits[digits.length - 1 - i]!);
    c = D[c]![P[i % 8]![d]!]!;
  }
  return c;
};

/**
 * True when `digits` is a full 12-digit Aadhaar with a valid Verhoeff check
 * digit. Physically masked cards (`XXXX XXXX 1234`) are rejected here — the
 * caller decides how to treat those.
 */
export const isValidAadhaar = (digits: string): boolean => {
  if (!/^\d{12}$/.test(digits)) return false;
  return verhoeffChecksum(digits) === 0;
};

/**
 * Computes the Verhoeff check digit that turns an 11-digit prefix into a valid
 * 12-digit number. Useful for unit tests and for building synthetic fixtures.
 */
export const computeVerhoeffCheckDigit = (prefix: string): number => {
  if (!/^\d{11}$/.test(prefix)) throw new Error('Expected exactly 11 digits');
  let c = 0;
  for (let i = 0; i < prefix.length; i++) {
    const d = toDigit(prefix[prefix.length - 1 - i]!);
    c = D[c]![P[(i + 1) % 8]![d]!]!;
  }
  return INV[c]!;
};

/** Convenience: returns a valid 12-digit Aadhaar for the given 11-digit prefix. */
export const makeValidAadhaar = (prefix: string): string => {
  const clean = prefix.replace(/\D/g, '').slice(0, 11).padStart(11, '0');
  return `${clean}${computeVerhoeffCheckDigit(clean)}`;
};
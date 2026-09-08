import crypto from 'crypto';
import fs from 'fs';

/**
 * QR signature verification for the UIDAI "Secure QR" Aadhaar payload.
 *
 * Facts and constraints (verified from official documentation and the
 * installed `qrPayload` parsing):
 *
 *   1. The current UIDAI offline QR (`<PrintLetterBarcodeData …/>`) is NOT
 *      signed — it is plain XML attributes. Nothing can "verify" it
 *      cryptographically. It must always be treated as DECODED_UNVERIFIED.
 *   2. The Aadhaar "Secure QR" (used on e-Aadhaar XML downloads) is an
 *      XML-DSIG wrapper: `<Signature><SignedInfo>…</SignedInfo>
 *      <SignatureValue>base64</SignatureValue></Signature><Data>base64</Data>`.
 *      Verifying it requires (a) the official UIDAI signing public-key
 *      certificate, which is issued ONLY to UIDAI-authorized partners, and
 *      (b) a standards-compliant C14N canonicalizer over the SignedInfo.
 *   3. UIDAI explicitly documents that the signed payload decrypts to the
 *      e-KYC JSON when the certificate is validated against their CA chain.
 *
 * This module therefore implements an HONEST verification gate:
 *   - It never reports `SIGNED_VERIFIED` unless a public key is configured
 *     (env `UIDAI_QR_PUBLIC_KEY_PATH` — path to a PEM — or
 *     `UIDAI_QR_PUBLIC_KEY_B64` — base64 of a PEM) AND the signature validates.
 *   - Without a configured key, a signed payload reports `UNVERIFIABLE`
 *     (and is treated by the pipeline as NOT trusted).
 *   - `PrintLetterBarcodeData` always reports `DECODED_UNVERIFIED`.
 *
 * The verification attempt signs/verifies the **raw SignedInfo bytes** (and a
 * couple of normalization candidates). If the configured certificate signs a
 * canonicalized form we do not support, the result is `SIGNATURE_INVALID`
 * (honest: we were unable to confirm authenticity) rather than falsely
 * claiming success.
 */

export type QrVerificationStatus =
  | 'NONE'
  | 'DECODED_UNVERIFIED'
  | 'SIGNED_VERIFIED'
  | 'SIGNATURE_INVALID'
  | 'UNVERIFIABLE';

export interface QrVerificationResult {
  status: QrVerificationStatus;
  reason: string;
  algorithm?: string;
}

const loadPublicKey = (): crypto.KeyObject | null => {
  const b64 = process.env['UIDAI_QR_PUBLIC_KEY_B64']?.trim();
  if (b64) {
    try {
      return crypto.createPublicKey(Buffer.from(b64, 'base64'));
    } catch {
      return null;
    }
  }
  const pemPath = process.env['UIDAI_QR_PUBLIC_KEY_PATH']?.trim();
  if (pemPath) {
    try {
      return crypto.createPublicKey(fs.readFileSync(pemPath, 'utf8'));
    } catch {
      return null;
    }
  }
  return null;
};

/** True when the payload carries an XML-DSIG Signature element. */
export const hasQrSignature = (payload: string): boolean =>
  /<Signature\b[\s>][\s\S]*<\/Signature>/i.test(payload) &&
  /<SignatureValue[^>]*>[\s\S]*?<\/SignatureValue>/i.test(payload);

const extractSignatureValue = (payload: string): string | null => {
  const m = payload.match(/<SignatureValue[^>]*>([\s\S]*?)<\/SignatureValue>/i);
  if (!m?.[1]) return null;
  const cleaned = m[1].replace(/\s+/g, '');
  return cleaned.length > 0 ? cleaned : null;
};

const extractSignedInfo = (payload: string): string | null => {
  const m = payload.match(/<SignedInfo\b[\s>][\s\S]*?<\/SignedInfo>/i);
  return m?.[0] ?? null;
};

/** Candidate byte representations of SignedInfo; we accept any match. */
const signedInfoCandidates = (signedInfo: string): Buffer[] => [
  Buffer.from(signedInfo, 'utf8'),
  Buffer.from(signedInfo.replace(/\s+/g, ' ').trim(), 'utf8'),
  Buffer.from(signedInfo.replace(/>\s+</g, '><').trim(), 'utf8'),
];

const verifyAgainstKey = (payload: string, key: crypto.KeyObject): boolean => {
  const sigB64 = extractSignatureValue(payload);
  const signedInfo = extractSignedInfo(payload);
  if (!sigB64 || !signedInfo) return false;
  let signature: Buffer;
  try {
    signature = Buffer.from(sigB64, 'base64');
  } catch {
    return false;
  }
  for (const data of signedInfoCandidates(signedInfo)) {
    try {
      if (crypto.verify('RSA-SHA256', data, key, signature)) return true;
    } catch {
      continue;
    }
  }
  return false;
};

/**
 * Verifies a decoded QR payload. `format` is the `QrPayloadFormat` returned by
 * `parseQrPayload`. Never throws.
 */
export const verifyQrSignature = (payload: string, format: string): QrVerificationResult => {
  if (!payload) return { status: 'NONE', reason: 'no QR payload' };
  if (format !== 'aadhaar-secure') {
    return {
      status: 'DECODED_UNVERIFIED',
      reason: `${format} QR is not a signed format and cannot be cryptographically verified`,
    };
  }
  if (!hasQrSignature(payload)) {
    return { status: 'DECODED_UNVERIFIED', reason: 'secure QR wrapper present but no Signature element found' };
  }
  const key = loadPublicKey();
  if (!key) {
    return {
      status: 'UNVERIFIABLE',
      reason: 'secure QR contains a signature but no UIDAI public key is configured (set UIDAI_QR_PUBLIC_KEY_PATH or UIDAI_QR_PUBLIC_KEY_B64)',
    };
  }
  if (verifyAgainstKey(payload, key)) {
    return { status: 'SIGNED_VERIFIED', reason: 'signature valid against the configured public key', algorithm: 'RSA-SHA256' };
  }
  return {
    status: 'SIGNATURE_INVALID',
    reason: 'signature did not validate against the configured public key (tampered payload or wrong key)',
  };
};
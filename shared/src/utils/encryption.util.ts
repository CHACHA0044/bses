import crypto from 'crypto';
import { Transform } from 'stream';

export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';

  private getKey(keyVersion?: string): Buffer {
    // v2 envelopes carry a keyVersion so keys can be rotated without a data
    // migration: new records are written with the current key; old records
    // decrypt with the previous key until re-encrypted.
    const hexKey =
      keyVersion === 'k2'
        ? process.env.AES_SECRET_KEY_PREVIOUS
        : process.env.AES_SECRET_KEY;
    if (!hexKey || !/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error('AES_SECRET_KEY must be set to a 64 hex-character key');
    }
    return Buffer.from(hexKey, 'hex');
  }

  /** Legacy fixed IV — used for decrypting pre-v2 records and GridFS blobs. */
  private getIv(): Buffer {
    const hexIv = process.env.AES_IV;
    if (!hexIv || !/^[0-9a-fA-F]{32}$/.test(hexIv)) {
      throw new Error('AES_IV must be set to a 32 hex-character IV');
    }
    return Buffer.from(hexIv, 'hex');
  }

  // --- String Methods (for Postgres PII fields) ---

  /**
   * Encrypts a string field with per-record random IVs (v2 envelope):
   *   `v2:<keyVersion>:<ivHex>:<cipherHex>`
   * Random IVs eliminate the repeated-IV weakness of fixed-IV CBC. `decrypt`
   * transparently reads v2 and the legacy (fixed-IV) format, so nothing
   * already stored breaks.
   */
  public encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.getKey(), iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `v2:k1:${iv.toString('hex')}:${encrypted}`;
  }

  public decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;
    const v2 = ciphertext.match(/^v2:(k[12]):([0-9a-f]{32}):([0-9a-f]+)$/i);
    if (v2) {
      const keyVersion = v2[1] as 'k1' | 'k2';
      const iv = Buffer.from(v2[2]!, 'hex');
      const ciphertextHex = v2[3]!;
      const decipher = crypto.createDecipheriv(this.algorithm, this.getKey(keyVersion), iv);
      let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    // Legacy ciphertext (fixed shared IV) — kept readable forever.
    const decipher = crypto.createDecipheriv(this.algorithm, this.getKey(), this.getIv());
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  public hashSearchable(value: string): string {
    if (!value) return value;
    const normalized = value.trim().toLowerCase();
    return crypto.createHmac('sha256', this.getKey()).update(normalized).digest('hex');
  }

  // --- Buffer/Stream Methods (for MongoDB GridFS files) ---

  /** Encrypts an in-memory file buffer before it is written to GridFS. */
  public encryptBuffer(plaintext: Buffer): Buffer {
    const cipher = crypto.createCipheriv(this.algorithm, this.getKey(), this.getIv());
    return Buffer.concat([cipher.update(plaintext), cipher.final()]);
  }

  /** Decrypts an in-memory buffer previously produced by `encryptBuffer`. */
  public decryptBuffer(ciphertext: Buffer): Buffer {
    const decipher = crypto.createDecipheriv(this.algorithm, this.getKey(), this.getIv());
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /** Returns a Transform that decrypts an encrypted byte stream on read. */
  public decryptStream(): Transform {
    return crypto.createDecipheriv(this.algorithm, this.getKey(), this.getIv());
  }
}

export const encryptionService = new EncryptionService();


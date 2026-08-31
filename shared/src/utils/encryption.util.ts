import crypto from 'crypto';
import { Transform } from 'stream';

export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';

  private getKey(): Buffer {
    const hexKey = process.env.AES_SECRET_KEY || '0000000000000000000000000000000000000000000000000000000000000000';
    return Buffer.from(hexKey, 'hex');
  }

  private getIv(): Buffer {
    const hexIv = process.env.AES_IV || '00000000000000000000000000000000';
    return Buffer.from(hexIv, 'hex');
  }

  // --- String Methods (for Postgres PII fields) ---

  public encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;
    const cipher = crypto.createCipheriv(this.algorithm, this.getKey(), this.getIv());
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  public decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;
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

  /** Returns a Transform that decrypts an encrypted byte stream on read. */
  public decryptStream(): Transform {
    return crypto.createDecipheriv(this.algorithm, this.getKey(), this.getIv());
  }
}

export const encryptionService = new EncryptionService();


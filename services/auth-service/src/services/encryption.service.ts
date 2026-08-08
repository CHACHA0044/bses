import crypto from 'crypto';
import { config } from '../config';

/**
 * Service providing AES-256 encryption & decryption for sensitive PII (Aadhaar, Mobile Number)
 * and HMAC-SHA256 blind indexing for direct database searches.
 */
export class EncryptionService {
  private readonly algorithm = 'aes-256-cbc';
  private readonly key: Buffer;
  private readonly iv: Buffer;

  constructor() {
    this.key = Buffer.from(config.AES_SECRET_KEY, 'hex');
    this.iv = Buffer.from(config.AES_IV, 'hex');
  }

  /**
   * Encrypts plaintext string using AES-256-CBC.
   */
  public encrypt(plaintext: string): string {
    if (!plaintext) return plaintext;
    const cipher = crypto.createCipheriv(this.algorithm, this.key, this.iv);
    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  /**
   * Decrypts ciphertext string using AES-256-CBC.
   */
  public decrypt(ciphertext: string): string {
    if (!ciphertext) return ciphertext;
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, this.iv);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Generates a deterministic HMAC-SHA256 hash for searchable fields (e.g. mobile number).
   * Allows O(1) duplicate checking without decrypting full database tables.
   */
  public hashSearchable(value: string): string {
    if (!value) return value;
    const normalized = value.trim().toLowerCase();
    return crypto.createHmac('sha256', this.key).update(normalized).digest('hex');
  }
}

export const encryptionService = new EncryptionService();

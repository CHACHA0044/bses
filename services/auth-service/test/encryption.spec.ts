import { describe, it, expect } from 'vitest';
import { encryptionService } from '@bses/shared';

describe('EncryptionService (AES-256 & HMAC-SHA256)', () => {
  it('should encrypt and decrypt plaintext accurately', () => {
    const sensitiveData = '9876543210';
    const encrypted = encryptionService.encrypt(sensitiveData);

    expect(encrypted).not.toBe(sensitiveData);
    expect(encrypted.length).toBeGreaterThan(0);

    const decrypted = encryptionService.decrypt(encrypted);
    expect(decrypted).toBe(sensitiveData);
  });

  it('should generate consistent HMAC-SHA256 blind hashes for identical input', () => {
    const mobile1 = '9876543210';
    const mobile2 = '9876543210';

    const hash1 = encryptionService.hashSearchable(mobile1);
    const hash2 = encryptionService.hashSearchable(mobile2);

    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // 256 bits = 64 hex chars
  });
});

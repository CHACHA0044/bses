import { describe, it, expect } from 'vitest';
import { passwordService } from '../src/services/password.service';

describe('PasswordService (Bcrypt & Complexity)', () => {
  it('should hash and compare passwords correctly', async () => {
    const plain = 'BsesPass@2026!';
    const hash = await passwordService.hashPassword(plain);

    expect(hash).not.toBe(plain);
    const match = await passwordService.comparePassword(plain, hash);
    expect(match).toBe(true);

    const wrongMatch = await passwordService.comparePassword('WrongPassword1!', hash);
    expect(wrongMatch).toBe(false);
  });

  it('should reject passwords failing complexity rules', () => {
    expect(passwordService.validatePasswordStrength('short').valid).toBe(false);
    expect(passwordService.validatePasswordStrength('nouppercase1!').valid).toBe(false);
    expect(passwordService.validatePasswordStrength('NOLOWERCASE1!').valid).toBe(false);
    expect(passwordService.validatePasswordStrength('NoSpecialChar123').valid).toBe(false);
    expect(passwordService.validatePasswordStrength('BsesPass@2026!').valid).toBe(true);
  });
});

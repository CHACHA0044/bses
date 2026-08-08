import bcrypt from 'bcrypt';
import { config } from '../config';

export class PasswordService {
  private readonly saltRounds: number;

  constructor() {
    this.saltRounds = config.BCRYPT_ROUNDS;
  }

  /**
   * Hashes plain password using Bcrypt with configured salt rounds (default 12).
   */
  public async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  /**
   * Compares plain password with stored bcrypt hash.
   */
  public async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Validates password complexity requirements:
   * - At least 8 characters long
   * - Contains uppercase letter
   * - Contains lowercase letter
   * - Contains digit
   * - Contains special character
   */
  public validatePasswordStrength(password: string): { valid: boolean; message?: string } {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one special character' };
    }
    return { valid: true };
  }
}

export const passwordService = new PasswordService();

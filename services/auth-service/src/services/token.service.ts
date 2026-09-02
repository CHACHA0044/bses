import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'crypto';
import { UserRole, JwtAccessPayload, JwtRefreshPayload } from '@bses/shared';
import { config } from '../config';

export class TokenService {
  /**
   * Generates JWT Access Token (15 minutes expiry)
   */
  public generateAccessToken(payload: {
    userId: string;
    username: string;
    role: UserRole;
    firstName?: string | undefined;
    lastName?: string | undefined;
    email?: string | undefined;
  }): string {
    const accessPayload: JwtAccessPayload = {
      sub: payload.userId,
      username: payload.username,
      role: payload.role,
      firstName: payload.firstName,
      lastName: payload.lastName,
      email: payload.email,
    };

    const options: SignOptions = {
      expiresIn: config.JWT_EXPIRES_IN as any,
    };

    return jwt.sign(accessPayload, config.JWT_SECRET, options);
  }

  /**
   * Generates JWT Refresh Token (7 days expiry)
   */
  public generateRefreshToken(userId: string): string {
    const refreshPayload: JwtRefreshPayload = {
      sub: userId,
    };

    const options: SignOptions = {
      expiresIn: config.JWT_REFRESH_EXPIRES_IN as any,
    };

    return jwt.sign(refreshPayload, config.JWT_REFRESH_SECRET, options);
  }

  /**
   * Verifies Access Token
   */
  public verifyAccessToken(token: string): JwtAccessPayload {
    return jwt.verify(token, config.JWT_SECRET) as JwtAccessPayload;
  }

  /**
   * Verifies Refresh Token
   */
  public verifyRefreshToken(token: string): JwtRefreshPayload {
    return jwt.verify(token, config.JWT_REFRESH_SECRET) as JwtRefreshPayload;
  }

  /**
   * Hashes token using SHA-256 for secure database storage & token revocation lookups.
   */
  public hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Generates secure random hex token for password reset flow.
   */
  public generateResetToken(): { rawToken: string; hashedToken: string; expiresAt: Date } {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry
    return { rawToken, hashedToken, expiresAt };
  }
}

export const tokenService = new TokenService();

import { UserRole, AuditAction, ConsentType, Gender } from '@prisma/client';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ForbiddenError,
  createLogger,
} from '@bses/shared';
import { userRepository, CreateUserData } from '../repositories/user.repository';
import { adminRepository } from '../repositories/admin.repository';
import { refreshTokenRepository } from '../repositories/refreshToken.repository';
import { passwordService } from './password.service';
import { encryptionService } from '@bses/shared';
import { tokenService } from './token.service';
import { consentService } from './consent.service';
import { auditService } from './audit.service';
import { captchaService } from './captcha.service';
import { notificationClient } from './notification.client';
import { getPrismaClient } from '../db/db.client';
import { config } from '../config';

const logger = createLogger({ service: 'auth-service-logic' });

export interface RegisterDTO {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: Gender;
  email: string;
  mobile: string;
  username: string;
  password: string;
  confirmPassword: string;
  aadhaar?: string | null;
  caNumber?: string | null;
  meterNumber?: string | null;
  dpdpConsent: boolean;
  privacyPolicyAccepted: boolean;
  captchaToken?: string;
  captchaInput?: string;
  ipAddress: string;
}

export interface LoginDTO {
  identifier: string; // username or email
  password: string;
  rememberMe?: boolean;
  ipAddress: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export class AuthenticationService {
  /**
   * Registers a new consumer user with DPDP consent and encrypted PII.
   */
  public async register(dto: RegisterDTO): Promise<{ user: any; tokens: AuthTokens }> {
    // 0. Verify CAPTCHA
    captchaService.verifyCaptcha(dto.captchaToken, dto.captchaInput);

    // 1. Validate password match & complexity
    if (dto.password !== dto.confirmPassword) {
      throw new ValidationError('Passwords do not match', { confirmPassword: ['Password confirmation does not match password'] });
    }

    const passValidation = passwordService.validatePasswordStrength(dto.password);
    if (!passValidation.valid) {
      throw new ValidationError(passValidation.message || 'Invalid password complexity', { password: [passValidation.message || 'Password failed complexity validation'] });
    }

    // 2. Validate DPDP Consent
    if (!dto.dpdpConsent || !dto.privacyPolicyAccepted) {
      throw new ValidationError('Explicit DPDP consent and Privacy Policy acceptance are required for registration', {
        dpdpConsent: ['Consent is required under DPDP Act 2023'],
      });
    }

    // 3. Duplicate checks
    const existingEmail = await userRepository.findByEmail(dto.email);
    if (existingEmail) {
      throw new ConflictError('A user with this email address already exists');
    }

    const existingUsername = await userRepository.findByUsername(dto.username);
    if (existingUsername) {
      throw new ConflictError('This username is already taken');
    }

    const mobileHash = encryptionService.hashSearchable(dto.mobile);
    const existingMobile = await userRepository.findByMobileHash(mobileHash);
    if (existingMobile) {
      throw new ConflictError('A user with this mobile number already exists');
    }

    if (dto.caNumber) {
      const existingCa = await userRepository.findByCaNumber(dto.caNumber);
      if (existingCa) {
        throw new ConflictError('This CA Number is already registered');
      }
    }

    if (dto.meterNumber) {
      const existingMeter = await userRepository.findByMeterNumber(dto.meterNumber);
      if (existingMeter) {
        throw new ConflictError('This Meter Number is already registered');
      }
    }

    // 4. Encrypt PII & Hash Password
    const passwordHash = await passwordService.hashPassword(dto.password);
    const mobileEncrypted = encryptionService.encrypt(dto.mobile);
    const aadhaarEncrypted = dto.aadhaar ? encryptionService.encrypt(dto.aadhaar) : null;

    // 5. Database transaction for user + consent creation
    const prisma = getPrismaClient();
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await userRepository.createUser(
        {
          firstName: dto.firstName,
          middleName: dto.middleName ?? null,
          lastName: dto.lastName,
          gender: dto.gender,
          email: dto.email,
          mobileEncrypted,
          mobileHash,
          aadhaarEncrypted,
          username: dto.username,
          passwordHash,
          caNumber: dto.caNumber ?? null,
          meterNumber: dto.meterNumber ?? null,
          role: UserRole.CONSUMER,
        },
        tx,
      );

      await consentService.recordRegistrationConsent(newUser.id, dto.ipAddress);
      return newUser;
    });

    // 6. Generate Tokens
    const accessToken = tokenService.generateAccessToken({ userId: user.id, username: user.username, role: user.role as any });
    const refreshToken = tokenService.generateRefreshToken(user.id);
    const refreshTokenHash = tokenService.hashToken(refreshToken);

    const refreshTokenExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await refreshTokenRepository.createRefreshToken({ userId: user.id, tokenHash: refreshTokenHash, expiresAt: refreshTokenExpiresAt });

    // 7. Audit log
    await auditService.logAction({
      userId: user.id,
      performedBy: user.username,
      action: AuditAction.USER_REGISTERED,
      module: 'AUTH',
      ipAddress: dto.ipAddress,
    });

    // 8. Dispatch Registration Successful Notification (SMS + WhatsApp - SRS 4.7)
    await notificationClient.notifyRegistrationSuccess(dto.mobile, user.username);

    return {
      user: this.sanitizeUser(user),
      tokens: { accessToken, refreshToken },
    };
  }

  /**
   * Log in user or admin with brute-force protection and account locking.
   */
  public async login(dto: LoginDTO): Promise<{ user: any; tokens: AuthTokens }> {
    // 1. Find user or admin
    let user = await userRepository.findByUsernameOrEmail(dto.identifier);

    if (!user) {
      // Check admin table
      const admin = await adminRepository.findByEmail(dto.identifier);
      if (!admin) {
        throw new AuthenticationError('Invalid credentials');
      }
      const match = await passwordService.comparePassword(dto.password, admin.passwordHash);
      if (!match) {
        throw new AuthenticationError('Invalid credentials');
      }

      const accessToken = tokenService.generateAccessToken({ userId: admin.id, username: admin.email, role: admin.role as any });
      const refreshToken = tokenService.generateRefreshToken(admin.id);
      const refreshTokenHash = tokenService.hashToken(refreshToken);

      await refreshTokenRepository.createRefreshToken({ adminId: admin.id, tokenHash: refreshTokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });
      // Audit logs reference users only — admin id does not exist in users (FK)
      await auditService.logAction({ userId: null, performedBy: admin.email, action: AuditAction.USER_LOGIN, module: 'AUTH', ipAddress: dto.ipAddress });

      return {
        user: this.sanitizeAdmin(admin),
        tokens: { accessToken, refreshToken },
      };
    }

    // 2. Check if account is locked
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const remainingMinutes = Math.ceil((user.lockedUntil.getTime() - Date.now()) / (60 * 1000));
      throw new AuthenticationError(`Account locked due to multiple failed login attempts. Try again in ${remainingMinutes} minutes.`);
    }

    // 3. Verify password
    const isPasswordValid = await passwordService.comparePassword(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      const { failedLoginAttempts, lockedUntil } = await userRepository.incrementFailedAttempts(user.id);

      await auditService.logAction({
        userId: user.id,
        performedBy: user.username,
        action: AuditAction.USER_LOGIN,
        module: 'AUTH_FAILED',
        ipAddress: dto.ipAddress,
      });

      if (lockedUntil) {
        throw new AuthenticationError('Account locked due to 5 consecutive failed login attempts. Please try again after 15 minutes.');
      }
      throw new AuthenticationError(`Invalid credentials. ${5 - failedLoginAttempts} attempt(s) remaining before account lockout.`);
    }

    // 4. Successful login — update last login timestamp and reset failed attempts
    await userRepository.updateLastLogin(user.id);

    // 5. Issue JWT tokens
    const accessToken = tokenService.generateAccessToken({ userId: user.id, username: user.username, role: user.role as any });
    const refreshToken = tokenService.generateRefreshToken(user.id);
    const refreshTokenHash = tokenService.hashToken(refreshToken);

    const refreshTokenExpiresAt = new Date(Date.now() + (dto.rememberMe ? 30 : 7) * 24 * 60 * 60 * 1000);
    await refreshTokenRepository.createRefreshToken({ userId: user.id, tokenHash: refreshTokenHash, expiresAt: refreshTokenExpiresAt });

    // 6. Audit log
    await auditService.logAction({
      userId: user.id,
      performedBy: user.username,
      action: AuditAction.USER_LOGIN,
      module: 'AUTH',
      ipAddress: dto.ipAddress,
    });

    return {
      user: this.sanitizeUser(user),
      tokens: { accessToken, refreshToken },
    };
  }

  /**
   * Refreshes Access Token using a valid, unrevoked Refresh Token (with refresh token rotation).
   */
  public async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    if (!rawRefreshToken) {
      throw new AuthenticationError('Refresh token required');
    }

    const payload = tokenService.verifyRefreshToken(rawRefreshToken);
    const tokenHash = tokenService.hashToken(rawRefreshToken);

    const storedToken = await refreshTokenRepository.findByTokenHash(tokenHash);
    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    // Admin session refresh
    if (storedToken.adminId) {
      const admin = await adminRepository.findById(storedToken.adminId);
      if (!admin) {
        throw new AuthenticationError('Admin associated with refresh token no longer exists');
      }

      const newAccessToken = tokenService.generateAccessToken({ userId: admin.id, username: admin.email, role: admin.role as any });
      const newRefreshToken = tokenService.generateRefreshToken(admin.id);
      const newRefreshTokenHash = tokenService.hashToken(newRefreshToken);

      await refreshTokenRepository.revokeToken(storedToken.id, newRefreshTokenHash);
      await refreshTokenRepository.createRefreshToken({ adminId: admin.id, tokenHash: newRefreshTokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });

      return {
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
      };
    }

    const user = await userRepository.findById(payload.sub);
    if (!user) {
      throw new AuthenticationError('User associated with refresh token no longer exists');
    }

    // Generate new access and refresh tokens (Rotation)
    const newAccessToken = tokenService.generateAccessToken({ userId: user.id, username: user.username, role: user.role as any });
    const newRefreshToken = tokenService.generateRefreshToken(user.id);
    const newRefreshTokenHash = tokenService.hashToken(newRefreshToken);

    // Revoke old token & store new token
    await refreshTokenRepository.revokeToken(storedToken.id, newRefreshTokenHash);
    await refreshTokenRepository.createRefreshToken({ userId: user.id, tokenHash: newRefreshTokenHash, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  /**
   * Logs out user by revoking current refresh token.
   */
  public async logout(userId: string, rawRefreshToken?: string, ipAddress = '0.0.0.0'): Promise<void> {
    if (rawRefreshToken) {
      const tokenHash = tokenService.hashToken(rawRefreshToken);
      const stored = await refreshTokenRepository.findByTokenHash(tokenHash);
      if (stored) {
        await refreshTokenRepository.revokeToken(stored.id);
      }
    } else {
      const admin = await adminRepository.findById(userId);
      if (admin) {
        await refreshTokenRepository.revokeAllAdminTokens(userId);
      } else {
        await refreshTokenRepository.revokeAllUserTokens(userId);
      }
    }

    await auditService.logAction({
      userId: null,
      performedBy: userId,
      action: AuditAction.USER_LOGOUT,
      module: 'AUTH',
      ipAddress,
    });
  }

  /**
   * Initiates forgot password flow — logs reset token in dev environment.
   */
  public async forgotPassword(email: string, ipAddress: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Do not reveal email existence to prevent user enumeration
      logger.info(`Forgot password requested for non-existent email: ${email}`);
      return;
    }

    const { rawToken, hashedToken, expiresAt } = tokenService.generateResetToken();
    await userRepository.setResetPasswordToken(user.id, hashedToken, expiresAt);

    // Reset link generated from FRONTEND_URL (env-driven) so production
    // password-reset links point at the real frontend, not localhost.
    const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${rawToken}`;
    logger.info(`=======================================================`);
    logger.info(`[DEV NOTIFICATION SIMULATOR] PASSWORD RESET LINK GENERATED:`);
    logger.info(`Recipient: ${user.email} (${user.username})`);
    logger.info(`Reset Link: ${resetUrl}`);
    logger.info(`Expires At: ${expiresAt.toISOString()}`);
    logger.info(`=======================================================`);
  }

  /**
   * Resets password using a valid reset token.
   */
  public async resetPassword(rawToken: string, newPassword: string, ipAddress: string): Promise<void> {
    const passValidation = passwordService.validatePasswordStrength(newPassword);
    if (!passValidation.valid) {
      throw new ValidationError(passValidation.message || 'Password failed complexity requirements');
    }

    const tokenHash = tokenService.hashToken(rawToken);
    const user = await userRepository.findByResetTokenHash(tokenHash);
    if (!user) {
      throw new ValidationError('Invalid or expired password reset token');
    }

    const newPasswordHash = await passwordService.hashPassword(newPassword);
    await userRepository.updatePassword(user.id, newPasswordHash);
    await refreshTokenRepository.revokeAllUserTokens(user.id);

    await auditService.logAction({
      userId: user.id,
      performedBy: user.username,
      action: AuditAction.PASSWORD_CHANGED,
      module: 'AUTH',
      ipAddress,
    });

    if (user.mobileEncrypted) {
      const mobile = encryptionService.decrypt(user.mobileEncrypted);
      await notificationClient.notifyPasswordChanged(mobile);
    }
  }

  /**
   * Changes current password for logged-in user.
   */
  public async changePassword(userId: string, currentPass: string, newPass: string, ipAddress: string): Promise<void> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const isValid = await passwordService.comparePassword(currentPass, user.passwordHash);
    if (!isValid) {
      throw new ValidationError('Current password is incorrect', { currentPassword: ['Current password does not match'] });
    }

    const passValidation = passwordService.validatePasswordStrength(newPass);
    if (!passValidation.valid) {
      throw new ValidationError(passValidation.message || 'New password failed complexity requirements', { newPassword: [passValidation.message || 'Complexity check failed'] });
    }

    const newPasswordHash = await passwordService.hashPassword(newPass);
    await userRepository.updatePassword(user.id, newPasswordHash);

    await auditService.logAction({
      userId: user.id,
      performedBy: user.username,
      action: AuditAction.PASSWORD_CHANGED,
      module: 'AUTH',
      ipAddress,
    });

    if (user.mobileEncrypted) {
      const mobile = encryptionService.decrypt(user.mobileEncrypted);
      await notificationClient.notifyPasswordChanged(mobile);
    }
  }

  /**
   * Returns current user profile with decrypted sensitive fields for authorized owner.
   */
  public async getCurrentUser(userId: string): Promise<any> {
    const user = await userRepository.findById(userId);
    if (!user) {
      // Check admin
      const admin = await adminRepository.findById(userId);
      if (!admin) throw new NotFoundError('User');
      return this.sanitizeAdmin(admin);
    }

    return this.sanitizeUser(user, true);
  }

  /**
   * Normalizes an admin into the same user shape consumers get, so the
   * frontend `UserProfile` contract (firstName/lastName/username/status) holds
   * for every authenticated identity. The `Admin` model only stores a single
   * `name` field — it is split into first/last for display parity.
   */
  private sanitizeAdmin(admin: any): any {
    const parts = (admin.name || '').trim().split(/\s+/);
    const firstName = parts.shift() || admin.email;
    const lastName = parts.join(' ') || '';

    return {
      id: admin.id,
      firstName,
      middleName: null,
      lastName,
      gender: 'OTHER',
      email: admin.email,
      username: admin.email,
      role: admin.role,
      status: 'ACTIVE',
      createdAt: admin.createdAt,
    };
  }

  /**
   * Strips password hash and decrypts PII for user profile responses.
   */
  private sanitizeUser(user: any, includeDecrypted = false): any {
    const decryptedMobile = user.mobileEncrypted ? encryptionService.decrypt(user.mobileEncrypted) : null;
    const decryptedAadhaar = user.aadhaarEncrypted ? encryptionService.decrypt(user.aadhaarEncrypted) : null;

    return {
      id: user.id,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
      gender: user.gender,
      email: user.email,
      username: user.username,
      mobile: includeDecrypted ? decryptedMobile : undefined,
      aadhaar: includeDecrypted ? decryptedAadhaar : undefined,
      caNumber: user.caNumber,
      meterNumber: user.meterNumber,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    };
  }
}

export const authenticationService = new AuthenticationService();

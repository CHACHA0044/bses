import { User, UserRole, UserStatus, Gender, Prisma } from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

export interface CreateUserData {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  gender: Gender;
  email: string;
  mobileEncrypted: string;
  mobileHash: string;
  aadhaarEncrypted?: string | null;
  username: string;
  passwordHash: string;
  caNumber?: string | null;
  meterNumber?: string | null;
  role?: UserRole;
}

export class UserRepository {
  private get prisma() {
    return getPrismaClient();
  }

  public async createUser(data: CreateUserData, tx?: Prisma.TransactionClient): Promise<User> {
    const db = tx || this.prisma;
    return db.user.create({
      data: {
        firstName: data.firstName,
        middleName: data.middleName || null,
        lastName: data.lastName,
        gender: data.gender,
        email: data.email.toLowerCase(),
        mobileEncrypted: data.mobileEncrypted,
        mobileHash: data.mobileHash,
        aadhaarEncrypted: data.aadhaarEncrypted || null,
        username: data.username.toLowerCase(),
        passwordHash: data.passwordHash,
        caNumber: data.caNumber || null,
        meterNumber: data.meterNumber || null,
        role: data.role || UserRole.CONSUMER,
        status: UserStatus.ACTIVE,
      },
    });
  }

  public async findById(id: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
    });
  }

  public async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null },
    });
  }

  public async findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { username: username.toLowerCase(), deletedAt: null },
    });
  }

  public async findByMobileHash(mobileHash: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { mobileHash, deletedAt: null },
    });
  }

  public async findByCaNumber(caNumber: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { caNumber, deletedAt: null },
    });
  }

  public async findByMeterNumber(meterNumber: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { meterNumber, deletedAt: null },
    });
  }

  public async findByUsernameOrEmail(identifier: string): Promise<User | null> {
    const lower = identifier.toLowerCase();
    return this.prisma.user.findFirst({
      where: {
        OR: [{ email: lower }, { username: lower }],
        deletedAt: null,
      },
    });
  }

  public async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        lastLoginAt: new Date(),
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  public async incrementFailedAttempts(id: string, lockDurationMinutes = 15): Promise<{ failedLoginAttempts: number; lockedUntil: Date | null }> {
    const user = await this.findById(id);
    if (!user) throw new Error('User not found');

    const failedLoginAttempts = user.failedLoginAttempts + 1;
    let lockedUntil: Date | null = null;

    if (failedLoginAttempts >= 5) {
      lockedUntil = new Date(Date.now() + lockDurationMinutes * 60 * 1000);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts,
        lockedUntil,
      },
    });

    return {
      failedLoginAttempts: updated.failedLoginAttempts,
      lockedUntil: updated.lockedUntil,
    };
  }

  public async resetFailedAttempts(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  public async setResetPasswordToken(id: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpiresAt: expiresAt,
      },
    });
  }

  public async findByResetTokenHash(tokenHash: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: {
        resetPasswordTokenHash: tokenHash,
        resetPasswordExpiresAt: { gt: new Date() },
        deletedAt: null,
      },
    });
  }

  public async updatePassword(id: string, newPasswordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: {
        passwordHash: newPasswordHash,
        resetPasswordTokenHash: null,
        resetPasswordExpiresAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }
}

export const userRepository = new UserRepository();

import { RefreshToken } from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

export interface CreateRefreshTokenData {
  userId?: string | null;
  adminId?: string | null;
  tokenHash: string;
  expiresAt: Date;
}

export class RefreshTokenRepository {
  private get prisma() {
    return getPrismaClient();
  }

  public async createRefreshToken(data: CreateRefreshTokenData): Promise<RefreshToken> {
    return this.prisma.refreshToken.create({
      data: {
        userId: data.userId ?? null,
        adminId: data.adminId ?? null,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
      },
    });
  }

  public async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.prisma.refreshToken.findUnique({
      where: { tokenHash },
    });
  }

  public async revokeToken(id: string, replacedByToken?: string): Promise<void> {
    await this.prisma.refreshToken.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        replacedByToken: replacedByToken || null,
      },
    });
  }

  public async revokeAllUserTokens(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  public async revokeAllAdminTokens(adminId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();

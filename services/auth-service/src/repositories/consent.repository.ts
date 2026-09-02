import { ConsentRecord, ConsentType, Prisma } from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

export interface CreateConsentData {
  userId: string;
  consentType: ConsentType;
  accepted: boolean;
  ipAddress: string;
  privacyPolicyVersion?: string;
}

export class ConsentRepository {
  private get prisma() {
    return getPrismaClient();
  }

  public async createConsent(data: CreateConsentData, tx?: Prisma.TransactionClient): Promise<ConsentRecord> {
    const db = tx || this.prisma;
    const rawIp = typeof data.ipAddress === 'string' ? (data.ipAddress.split(',')[0]?.trim() || '0.0.0.0') : '0.0.0.0';
    const ipAddress = rawIp.substring(0, 45) || '0.0.0.0';

    return db.consentRecord.create({
      data: {
        userId: data.userId,
        consentType: data.consentType,
        accepted: data.accepted,
        ipAddress,
        privacyPolicyVersion: data.privacyPolicyVersion || 'v1.0',
      },
    });
  }

  public async findByUserId(userId: string): Promise<ConsentRecord[]> {
    return this.prisma.consentRecord.findMany({
      where: { userId },
      orderBy: { acceptedAt: 'desc' },
    });
  }
}

export const consentRepository = new ConsentRepository();

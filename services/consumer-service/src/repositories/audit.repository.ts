import { AuditLog, AuditAction, Prisma } from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

export interface CreateAuditLogData {
  userId?: string | null;
  performedBy: string;
  action: AuditAction;
  module: string;
  ipAddress: string;
  /** Structured workflow context: actor role, old/new status, remarks, request ID. */
  metadata?: Prisma.InputJsonValue | undefined;
}

export class AuditRepository {
  private get prisma() {
    return getPrismaClient();
  }

  public async createAuditLog(data: CreateAuditLogData): Promise<AuditLog> {
    const rawIp = typeof data.ipAddress === 'string' ? (data.ipAddress.split(',')[0]?.trim() || '0.0.0.0') : '0.0.0.0';
    const ipAddress = rawIp.substring(0, 45) || '0.0.0.0';
    const performedBy = (data.performedBy || 'system').substring(0, 100);
    const moduleName = (data.module || 'CONSUMER').substring(0, 50);

    return this.prisma.auditLog.create({
      data: {
        userId: data.userId || null,
        performedBy,
        action: data.action,
        module: moduleName,
        ipAddress,
        ...(data.metadata !== undefined && { metadata: data.metadata }),
      },
    });
  }

  public async listRecentLogs(limit = 10, userId?: string): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      where: userId ? { userId } : {},
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }
}

export const auditRepository = new AuditRepository();

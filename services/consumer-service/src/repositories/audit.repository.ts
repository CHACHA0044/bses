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
    return this.prisma.auditLog.create({
      data: {
        userId: data.userId || null,
        performedBy: data.performedBy,
        action: data.action,
        module: data.module,
        ipAddress: data.ipAddress,
        ...(data.metadata !== undefined && { metadata: data.metadata }),
      },
    });
  }

  public async listRecentLogs(limit = 10): Promise<AuditLog[]> {
    return this.prisma.auditLog.findMany({
      take: limit,
      orderBy: { timestamp: 'desc' },
    });
  }
}

export const auditRepository = new AuditRepository();

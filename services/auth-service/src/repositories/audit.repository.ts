import { AuditLog, AuditAction } from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

export interface CreateAuditLogData {
  userId?: string | null;
  performedBy: string;
  action: AuditAction;
  module: string;
  ipAddress: string;
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
      },
    });
  }
}

export const auditRepository = new AuditRepository();

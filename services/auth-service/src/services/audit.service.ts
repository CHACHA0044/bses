import { AuditAction } from '@prisma/client';
import { auditRepository, CreateAuditLogData } from '../repositories/audit.repository';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'audit-service' });

export class AuditService {
  public async logAction(data: CreateAuditLogData): Promise<void> {
    try {
      await auditRepository.createAuditLog(data);
    } catch (err: unknown) {
      logger.error('Failed to create audit log entry', {
        error: err instanceof Error ? err.message : String(err),
        action: data.action,
        performedBy: data.performedBy,
      });
    }
  }
}

export const auditService = new AuditService();

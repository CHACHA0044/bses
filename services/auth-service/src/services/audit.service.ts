import { AuditAction } from '@prisma/client';
import { auditRepository, CreateAuditLogData } from '../repositories/audit.repository';
import { createLogger } from '@bses/shared';

const logger = createLogger({ service: 'auth' });

export class AuditService {
  public async logAction(data: CreateAuditLogData): Promise<void> {
    try {
      await auditRepository.createAuditLog(data);
    } catch (err: unknown) {
      logger.error(`❌ Audit log write failed | action=${data.action} | error=${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

export const auditService = new AuditService();

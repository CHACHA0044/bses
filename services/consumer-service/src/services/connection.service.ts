import { ConnectionStatus, ConnectionType, AuditAction, WorkflowActionType } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError } from '@bses/shared';
import { connectionRepository, UpdateConnectionData } from '../repositories/connection.repository';
import { workflowRepository } from '../repositories/workflow.repository';
import { userRepository } from '../repositories/user.repository';
import { auditRepository } from '../repositories/audit.repository';
import { workflowService } from './workflow.service';
import { encryptionService } from './encryption.service';
import { IN_PROGRESS_STATUSES, SUCCESS_STATUSES } from '../config/connectionWorkflow';

export interface ApplyConnectionDTO {
  connectionType: ConnectionType;
  requiredLoad: number;
  propertyAddress: string;
  isDraft?: boolean;
  ipAddress: string;
}

export interface UpdateConnectionDTO {
  connectionType?: ConnectionType | undefined;
  requiredLoad?: number | undefined;
  propertyAddress?: string | undefined;
  isSubmit?: boolean | undefined;
  ipAddress: string;
}

export class ConnectionService {
  /**
   * Generates a unique BSES Connection Application Number (e.g. BSES-2026-X89A12)
   */
  private generateApplicationNumber(): string {
    const year = new Date().getFullYear();
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `BSES-${year}-${randomHex}`;
  }

  public async applyConnection(userId: string, dto: ApplyConnectionDTO): Promise<any> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const applicationNumber = this.generateApplicationNumber();

    const connection = await connectionRepository.create({
      userId,
      applicationNumber,
      connectionType: dto.connectionType,
      requiredLoad: dto.requiredLoad,
      propertyAddress: dto.propertyAddress,
      status: ConnectionStatus.DRAFT,
    });

    await workflowRepository.createTimeline({
      connectionRequestId: connection.id,
      action: WorkflowActionType.APPLICATION_CREATED,
      status: ConnectionStatus.DRAFT,
      performedBy: user.username,
      notes: dto.isDraft ? 'Draft application created' : 'Application created',
    });

    await auditRepository.createAuditLog({
      userId,
      performedBy: user.username,
      action: AuditAction.CONNECTION_APPLIED,
      module: 'CONNECTION',
      ipAddress: dto.ipAddress,
    });

    if (!dto.isDraft) {
      // Routes through the workflow engine: DRAFT -> SUBMITTED
      return workflowService.submitApplication(
        connection.id,
        { id: userId, username: user.username, role: user.role },
        dto.ipAddress,
      );
    }

    return connection;
  }

  public async getUserConnections(userId: string): Promise<any[]> {
    return connectionRepository.findByUserId(userId);
  }

  public async getConnectionById(userId: string, connectionId: string, isAdmin = false): Promise<any> {
    const connection = await connectionRepository.findById(connectionId);
    if (!connection) throw new NotFoundError('Connection Application');

    if (!isAdmin && connection.userId !== userId) {
      throw new ValidationError('Access denied to this connection application');
    }

    return connection;
  }

  public async updateConnection(userId: string, connectionId: string, dto: UpdateConnectionDTO): Promise<any> {
    const connection = await connectionRepository.findById(connectionId);
    if (!connection) throw new NotFoundError('Connection Application');

    if (connection.userId !== userId) {
      throw new ValidationError('Access denied to this connection application');
    }

    if (connection.status !== ConnectionStatus.DRAFT && connection.status !== ConnectionStatus.DOCUMENTS_PENDING) {
      throw new ValidationError('Only DRAFT or DOCUMENTS_PENDING applications can be modified');
    }

    // Persist edits to the application details (if any) before transition
    if (
      dto.connectionType !== undefined ||
      dto.requiredLoad !== undefined ||
      dto.propertyAddress !== undefined
    ) {
      const editPayload: UpdateConnectionData = {
        ...(dto.connectionType && { connectionType: dto.connectionType }),
        ...(dto.requiredLoad !== undefined && { requiredLoad: dto.requiredLoad }),
        ...(dto.propertyAddress && { propertyAddress: dto.propertyAddress }),
      };
      await connectionRepository.update(connectionId, editPayload);
    }

    if (dto.isSubmit) {
      const user = await userRepository.findById(userId);
      if (!user) throw new NotFoundError('User');
      // Routes through the workflow engine:
      //  - DRAFT -> SUBMITTED
      //  - DOCUMENTS_PENDING -> UNDER_VERIFICATION (after document re-upload)
      return workflowService.submitApplication(
        connectionId,
        { id: userId, username: user.username, role: user.role },
        dto.ipAddress,
      );
    }

    return connectionRepository.findById(connectionId);
  }

  public async getDashboardData(userId: string): Promise<any> {
    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const connections = await connectionRepository.findByUserId(userId);
    const recentLogs = await auditRepository.listRecentLogs(5);

    const decryptedMobile = user.mobileEncrypted ? encryptionService.decrypt(user.mobileEncrypted) : null;

    return {
      consumer: {
        id: user.id,
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        mobile: decryptedMobile,
        caNumber: user.caNumber,
        meterNumber: user.meterNumber,
        status: user.status,
        createdAt: user.createdAt,
      },
      stats: {
        totalApplications: connections.length,
        pendingCount: connections.filter((c) => IN_PROGRESS_STATUSES.includes(c.status)).length,
        approvedCount: connections.filter((c) => SUCCESS_STATUSES.includes(c.status)).length,
        rejectedCount: connections.filter((c) => c.status === ConnectionStatus.REJECTED).length,
        completedCount: connections.filter((c) => c.status === ConnectionStatus.CONNECTION_COMPLETED).length,
      },
      recentConnections: connections.slice(0, 5),
      recentActivity: recentLogs,
    };
  }
}

export const connectionService = new ConnectionService();

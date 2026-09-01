import { ConnectionStatus, ConnectionType, AuditAction, WorkflowActionType } from '@prisma/client';
import { NotFoundError, ValidationError, ConflictError, createLogger } from '@bses/shared';
import { connectionRepository, UpdateConnectionData } from '../repositories/connection.repository';
import { workflowRepository } from '../repositories/workflow.repository';
import { userRepository } from '../repositories/user.repository';
import { auditRepository } from '../repositories/audit.repository';
import { workflowService } from './workflow.service';
import { encryptionService, toDocumentViews } from '@bses/shared';
import { IN_PROGRESS_STATUSES, SUCCESS_STATUSES } from '../config/connectionWorkflow';
import { getPrismaClient } from '../db/db.client';

const logger = createLogger({ service: 'connection-service' });

export interface ApplyConnectionDTO {
  connectionType: ConnectionType;
  requiredLoad: number;
  propertyAddress: string;
  isDraft?: boolean;
  documentIds?: string[];
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
  private get prisma() {
    return getPrismaClient();
  }

  /**
   * Strips encrypted document columns and returns masked OCR data on every
   * connection payload before it reaches a consumer-facing response.
   */
  private toSafeConnection(connection: any): any {
    return {
      ...connection,
      documents: toDocumentViews(connection.documents),
    };
  }

  private toSafeConnections(connections: any[]): any[] {
    return connections.map((c) => this.toSafeConnection(c));
  }
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

    // Attach documents uploaded during the wizard. Only the user's own
    // unattached documents are linked — never docs already belonging to
    // another application.
    if (dto.documentIds && dto.documentIds.length > 0) {
      await this.prisma.document.updateMany({
        where: {
          id: { in: dto.documentIds },
          userId,
          connectionRequestId: null,
          deletedAt: null,
        },
        data: { connectionRequestId: connection.id },
      });
    }

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
    return this.toSafeConnections(await connectionRepository.findByUserId(userId));
  }

  public async getConnectionById(
    userId: string,
    connectionId: string,
    isAdmin = false,
  ): Promise<any> {
    const connection = await connectionRepository.findById(connectionId);
    if (!connection) throw new NotFoundError('Connection Application');

    if (!isAdmin && connection.userId !== userId) {
      throw new ValidationError('Access denied to this connection application');
    }

    return this.toSafeConnection(connection);
  }

  public async updateConnection(
    userId: string,
    connectionId: string,
    dto: UpdateConnectionDTO,
  ): Promise<any> {
    const connection = await connectionRepository.findById(connectionId);
    if (!connection) throw new NotFoundError('Connection Application');

    if (connection.userId !== userId) {
      throw new ValidationError('Access denied to this connection application');
    }

    if (
      connection.status !== ConnectionStatus.DRAFT &&
      connection.status !== ConnectionStatus.DOCUMENTS_PENDING
    ) {
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

    return this.toSafeConnection(await connectionRepository.findById(connectionId));
  }

  public async getDashboardData(userId: string): Promise<any> {
    // [DASHBOARD_FETCH_START] — fires immediately on handler entry so we can
    // correlate the Render log to the exact user+timestamp of the dashboard
    // request, even if Postgres is slow/unreachable downstream.
    logger.info(`[DASHBOARD_FETCH_START] userId=${userId} timestamp=${new Date().toISOString()}`);

    const user = await userRepository.findById(userId);
    if (!user) throw new NotFoundError('User');

    const connections = await connectionRepository.findByUserId(userId);
    // Scope the activity feed to this consumer only — other users' audit logs
    // must never appear on a consumer's dashboard.
    const recentLogs = await auditRepository.listRecentLogs(5, userId);

    const decryptedMobile = user.mobileEncrypted
      ? encryptionService.decrypt(user.mobileEncrypted)
      : null;

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
        completedCount: connections.filter(
          (c) => c.status === ConnectionStatus.CONNECTION_COMPLETED,
        ).length,
      },
      recentConnections: this.toSafeConnections(connections.slice(0, 5)),
      recentActivity: recentLogs,
    };
  }
}

export const connectionService = new ConnectionService();

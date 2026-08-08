import { ConnectionStatus, AuditAction, WorkflowActionType, VerificationResult, DocumentStatus, AssignmentStatus, Prisma, User } from '@prisma/client';
import { ConflictError, NotFoundError, ValidationError } from '@bses/shared';
import { connectionRepository } from '../repositories/connection.repository';
import { workflowRepository } from '../repositories/workflow.repository';
import { documentRepository } from '../repositories/document.repository';
import { userRepository } from '../repositories/user.repository';
import { auditRepository } from '../repositories/audit.repository';
import { notificationClient } from './notification.client';
import { encryptionService } from './encryption.service';
import { ADMIN_ROLES, connectionWorkflow, WORKFLOW_ACTION_LABELS, IN_PROGRESS_STATUSES, SUCCESS_STATUSES } from '../config/connectionWorkflow';

export interface Actor {
  id: string;
  username: string;
  role: string;
}

export interface DocumentVerdict {
  documentId: string;
  action: VerificationResult;
  comment?: string | undefined;
}

interface TransitionInput {
  connection: any;
  action: WorkflowActionType;
  to: ConnectionStatus;
  actor: Actor;
  ipAddress: string;
  auditAction: AuditAction;
  comment?: string | null;
  notes?: string;
  metadata?: Prisma.InputJsonValue;
  requestId?: string;
}

export class WorkflowService {
  private assertOwner(connection: any, actorId: string): void {
    if (connection.userId !== actorId) {
      throw new ValidationError('Access denied to this connection application');
    }
  }

  private formatOfficerName(user: User): string {
    return [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' ');
  }

  private async loadConnection(connectionId: string): Promise<any> {
    const connection = await connectionRepository.findById(connectionId);
    if (!connection) throw new NotFoundError('Connection Application');
    return connection;
  }

  private async notifyConsumer(connection: any, notify: (mobile: string) => Promise<void>): Promise<void> {
    const mobile = connection.user?.mobileEncrypted ? encryptionService.decrypt(connection.user.mobileEncrypted) : null;
    if (mobile) await notify(mobile);
  }

  /**
   * Core transition primitive. Loads nothing (connection passed in), validates the
   * transition against the engine, persists status + workflow action + timeline +
   * audit log, and returns the recorded action plus the connection.
   */
  private async transition(input: TransitionInput): Promise<{ connection: any; action: any }> {
    const from = input.connection.status as ConnectionStatus;

    const rule = connectionWorkflow.assertTransition(from, input.to, input.actor.role);

    const updated =
      from !== input.to
        ? await connectionRepository.update(input.connection.id, { status: input.to })
        : input.connection;

    const action = await workflowRepository.recordWorkflowAction({
      connectionRequestId: input.connection.id,
      action: input.action,
      fromStatus: from,
      toStatus: input.to,
      performedById: input.actor.id,
      performedByName: input.actor.username,
      performedByRole: input.actor.role,
      comment: input.comment ?? null,
    });

    await workflowRepository.createTimeline({
      connectionRequestId: input.connection.id,
      action: input.action,
      status: input.to,
      performedBy: input.actor.username,
      notes: input.notes ?? input.comment ?? rule.label ?? input.action,
      ...(input.metadata !== undefined && { metadata: input.metadata }),
    });

    await auditRepository.createAuditLog({
      userId: input.connection.userId,
      performedBy: input.actor.username,
      action: input.auditAction,
      module: 'CONNECTION_WORKFLOW',
      ipAddress: input.ipAddress,
      metadata: {
        role: input.actor.role,
        fromStatus: from,
        toStatus: input.to,
        ...(input.comment !== undefined && { remark: input.comment }),
        ...(input.requestId !== undefined && { requestId: input.requestId }),
      },
    });

    return { connection: updated, action };
  }

  // ── Consumer actions ─────────────────────────────────────────────────────────

  public async submitApplication(connectionId: string, actor: Actor, ipAddress: string, comment?: string, requestId?: string): Promise<any> {
    const connection = await this.loadConnection(connectionId);
    this.assertOwner(connection, actor.id);

    const to = connection.status === ConnectionStatus.DRAFT ? ConnectionStatus.SUBMITTED : ConnectionStatus.UNDER_VERIFICATION;

    const { connection: updated } = await this.transition({
      connection,
      action: WorkflowActionType.SUBMIT,
      to,
      actor,
      ipAddress,
      auditAction: AuditAction.APPLICATION_SUBMITTED,
      ...(comment !== undefined && { comment }),
      ...(requestId !== undefined && { requestId }),
    });

    await this.notifyConsumer(updated, (mobile) =>
      notificationClient.notifyApplicationSubmitted(mobile, updated.applicationNumber),
    );

    return updated;
  }

  // ── Admin actions ────────────────────────────────────────────────────────────

  public async assignApplication(
    connectionId: string,
    assigneeId: string,
    actor: Actor,
    ipAddress: string,
    comment?: string,
    requestId?: string,
  ): Promise<any> {
    const connection = await this.loadConnection(connectionId);

    const assignee = await userRepository.findById(assigneeId);
    if (!assignee) throw new NotFoundError('Assignable officer');
    if (!ADMIN_ROLES.includes(assignee.role)) {
      throw new ValidationError('Assignments can only be made to ADMIN or SUPER_ADMIN officers');
    }

    const active = await workflowRepository.getActiveAssignment(connectionId);
    if (active && active.assignedToId === assigneeId) {
      throw new ConflictError('Application is already assigned to this officer');
    }

    const isReassign = active || connection.status !== ConnectionStatus.SUBMITTED;

    const { connection: updated, action } = await this.transition({
      connection,
      action: isReassign ? WorkflowActionType.REASSIGN : WorkflowActionType.ASSIGN,
      to: ConnectionStatus.ASSIGNED,
      actor,
      ipAddress,
      auditAction: isReassign ? AuditAction.APPLICATION_REASSIGNED : AuditAction.APPLICATION_ASSIGNED,
      ...(comment !== undefined && { comment }),
      notes: isReassign ? `Reassigned to ${this.formatOfficerName(assignee)}` : `Assigned to ${this.formatOfficerName(assignee)}`,
      ...(requestId !== undefined && { requestId }),
    });

    if (active) {
      await workflowRepository.releaseAssignment(active.id, AssignmentStatus.REPLACED, comment);
    }

    await workflowRepository.createAssignment({
      connectionRequestId: connection.id,
      assignedToId: assignee.id,
      assignedToName: this.formatOfficerName(assignee),
      assignedToRole: assignee.role,
      assignedById: actor.id,
      assignedByName: actor.username,
      ...(comment !== undefined && { notes: comment }),
      actionId: action.id,
    });

    await this.notifyConsumer(updated, (mobile) =>
      notificationClient.notifyApplicationAssigned(mobile, updated.applicationNumber, this.formatOfficerName(assignee)),
    );

    return updated;
  }

  public async startVerification(connectionId: string, actor: Actor, ipAddress: string, comment?: string, requestId?: string): Promise<any> {
    const connection = await this.loadConnection(connectionId);

    const { connection: updated } = await this.transition({
      connection,
      action: WorkflowActionType.START_VERIFICATION,
      to: ConnectionStatus.UNDER_VERIFICATION,
      actor,
      ipAddress,
      auditAction: AuditAction.VERIFICATION_STARTED,
      ...(comment !== undefined && { comment }),
      ...(requestId !== undefined && { requestId }),
    });

    return updated;
  }

  public async requestDocuments(
    connectionId: string,
    actor: Actor,
    ipAddress: string,
    opts: { documentIds?: string[] | undefined; comment?: string | undefined },
    requestId?: string,
  ): Promise<any> {
    const connection = await this.loadConnection(connectionId);

    const { connection: updated } = await this.transition({
      connection,
      action: WorkflowActionType.REQUEST_DOCUMENTS,
      to: ConnectionStatus.DOCUMENTS_PENDING,
      actor,
      ipAddress,
      auditAction: AuditAction.DOCUMENT_REQUESTED,
      ...(opts.comment !== undefined && { comment: opts.comment }),
      notes: opts.comment ?? 'Additional documents requested',
      ...(opts.documentIds !== undefined && { metadata: { documentIds: opts.documentIds } }),
      ...(requestId !== undefined && { requestId }),
    });

    for (const documentId of opts.documentIds ?? []) {
      await workflowRepository.recordVerification({
        connectionRequestId: connection.id,
        documentId,
        performedById: actor.id,
        performedByName: actor.username,
        performedByRole: actor.role,
        action: VerificationResult.REQUESTED,
        ...(opts.comment !== undefined && { comment: opts.comment }),
      });
    }

    await this.notifyConsumer(updated, (mobile) =>
      notificationClient.notifyDocumentsRequested(mobile, updated.applicationNumber),
    );

    return updated;
  }

  public async completeVerification(
    connectionId: string,
    actor: Actor,
    ipAddress: string,
    opts: { documentVerdicts?: DocumentVerdict[] | undefined; comment?: string | undefined },
    requestId?: string,
  ): Promise<any> {
    const connection = await this.loadConnection(connectionId);

    const { connection: updated } = await this.transition({
      connection,
      action: WorkflowActionType.COMPLETE_VERIFICATION,
      to: ConnectionStatus.VERIFICATION_COMPLETE,
      actor,
      ipAddress,
      auditAction: AuditAction.VERIFICATION_COMPLETED,
      ...(opts.comment !== undefined && { comment: opts.comment }),
      ...(opts.documentVerdicts !== undefined && {
        metadata: {
          documentVerdicts: opts.documentVerdicts.map((v) => ({ documentId: v.documentId, action: v.action })),
        },
      }),
      ...(requestId !== undefined && { requestId }),
    });

    for (const verdict of opts.documentVerdicts ?? []) {
      const doc = await documentRepository.findById(verdict.documentId);
      if (!doc) throw new NotFoundError('Document');

      await documentRepository.updateStatus(
        verdict.documentId,
        verdict.action === VerificationResult.APPROVED ? DocumentStatus.VERIFIED : DocumentStatus.REJECTED,
      );

      await workflowRepository.recordVerification({
        connectionRequestId: connection.id,
        documentId: verdict.documentId,
        performedById: actor.id,
        performedByName: actor.username,
        performedByRole: actor.role,
        action: verdict.action,
        ...(verdict.comment !== undefined && { comment: verdict.comment }),
      });
    }

    await this.notifyConsumer(updated, (mobile) =>
      notificationClient.notifyVerificationCompleted(mobile, updated.applicationNumber),
    );

    return updated;
  }

  public async approveApplication(connectionId: string, actor: Actor, ipAddress: string, comment?: string, requestId?: string): Promise<any> {
    const connection = await this.loadConnection(connectionId);

    const { connection: updated } = await this.transition({
      connection,
      action: WorkflowActionType.APPROVE,
      to: ConnectionStatus.APPROVED,
      actor,
      ipAddress,
      auditAction: AuditAction.WORKFLOW_TRANSITION,
      ...(comment !== undefined && { comment }),
      ...(requestId !== undefined && { requestId }),
    });

    await this.notifyConsumer(updated, (mobile) =>
      notificationClient.notifyApplicationApproved(mobile, updated.applicationNumber),
    );

    return updated;
  }

  public async rejectApplication(
    connectionId: string,
    actor: Actor,
    ipAddress: string,
    opts: { reason: string; comment?: string | undefined },
    requestId?: string,
  ): Promise<any> {
    const connection = await this.loadConnection(connectionId);

    const { connection: updated } = await this.transition({
      connection,
      action: WorkflowActionType.REJECT,
      to: ConnectionStatus.REJECTED,
      actor,
      ipAddress,
      auditAction: AuditAction.WORKFLOW_TRANSITION,
      comment: opts.reason,
      notes: opts.reason,
      ...(requestId !== undefined && { requestId }),
    });

    await this.notifyConsumer(updated, (mobile) =>
      notificationClient.notifyApplicationRejected(mobile, updated.applicationNumber, opts.reason),
    );

    return updated;
  }

  public async scheduleConnection(
    connectionId: string,
    actor: Actor,
    ipAddress: string,
    opts: { scheduledDate?: string | undefined; comment?: string | undefined },
    requestId?: string,
  ): Promise<any> {
    const connection = await this.loadConnection(connectionId);

    const { connection: updated } = await this.transition({
      connection,
      action: WorkflowActionType.SCHEDULE_CONNECTION,
      to: ConnectionStatus.CONNECTION_SCHEDULED,
      actor,
      ipAddress,
      auditAction: AuditAction.CONNECTION_SCHEDULED,
      ...(opts.comment !== undefined && { comment: opts.comment }),
      ...(opts.scheduledDate !== undefined && { metadata: { scheduledDate: opts.scheduledDate } }),
      ...(requestId !== undefined && { requestId }),
    });

    await this.notifyConsumer(updated, (mobile) =>
      notificationClient.notifyConnectionScheduled(mobile, updated.applicationNumber, opts.scheduledDate),
    );

    return updated;
  }

  public async completeConnection(connectionId: string, actor: Actor, ipAddress: string, comment?: string, requestId?: string): Promise<any> {
    const connection = await this.loadConnection(connectionId);

    const { connection: updated } = await this.transition({
      connection,
      action: WorkflowActionType.COMPLETE_CONNECTION,
      to: ConnectionStatus.CONNECTION_COMPLETED,
      actor,
      ipAddress,
      auditAction: AuditAction.CONNECTION_COMPLETED,
      ...(comment !== undefined && { comment }),
      ...(requestId !== undefined && { requestId }),
    });

    await this.notifyConsumer(updated, (mobile) =>
      notificationClient.notifyConnectionCompleted(mobile, updated.applicationNumber),
    );

    return updated;
  }

  public async addRemark(connectionId: string, actor: Actor, ipAddress: string, remark: string, requestId?: string): Promise<any> {
    const connection = await this.loadConnection(connectionId);

    await workflowRepository.recordWorkflowAction({
      connectionRequestId: connection.id,
      action: WorkflowActionType.ADD_REMARK,
      fromStatus: connection.status,
      toStatus: connection.status,
      performedById: actor.id,
      performedByName: actor.username,
      performedByRole: actor.role,
      comment: remark,
    });

    await workflowRepository.createTimeline({
      connectionRequestId: connection.id,
      action: WorkflowActionType.ADD_REMARK,
      status: connection.status,
      performedBy: actor.username,
      notes: remark,
    });

    await auditRepository.createAuditLog({
      userId: connection.userId,
      performedBy: actor.username,
      action: AuditAction.REMARK_ADDED,
      module: 'CONNECTION_WORKFLOW',
      ipAddress,
      metadata: {
        role: actor.role,
        fromStatus: connection.status,
        toStatus: connection.status,
        remark,
        ...(requestId !== undefined && { requestId }),
      },
    });

    return connection;
  }

  // ── Query / read side ────────────────────────────────────────────────────────

  private async assertViewAccess(connectionId: string, actor: Actor): Promise<any> {
    const connection = await this.loadConnection(connectionId);
    if (actor.role === 'CONSUMER') {
      this.assertOwner(connection, actor.id);
    }
    return connection;
  }

  public async getApplicationDetail(connectionId: string, actor: Actor): Promise<any> {
    const connection = await connectionRepository.findWorkflowDetail(connectionId);
    if (!connection) throw new NotFoundError('Connection Application');
    if (actor.role === 'CONSUMER') {
      this.assertOwner(connection, actor.id);
    }

    const allowedTransitions = connectionWorkflow
      .getAllowedTransitions(connection.status, actor.role)
      .map((rule) => ({ action: rule.action, from: rule.from, to: rule.to, label: rule.label }));

    const timeline = (connection.timeline ?? []).map((entry: any) => ({
      ...entry,
      label: WORKFLOW_ACTION_LABELS[entry.action as WorkflowActionType] ?? entry.action,
    }));

    const { mobileEncrypted, ...user } = connection.user ?? {};

    return {
      ...connection,
      user,
      timeline,
      allowedTransitions,
      stage: this.getStageInfo(connection.status),
    };
  }

  public async getTimeline(connectionId: string, actor: Actor): Promise<any> {
    await this.assertViewAccess(connectionId, actor);
    const timeline = await workflowRepository.getTimeline(connectionId);
    return timeline.map((entry) => ({
      ...entry,
      label: WORKFLOW_ACTION_LABELS[entry.action as WorkflowActionType] ?? entry.action,
    }));
  }

  public async getAssignments(connectionId: string, actor: Actor): Promise<any> {
    await this.assertViewAccess(connectionId, actor);
    return workflowRepository.getAssignments(connectionId);
  }

  public async getVerifications(connectionId: string, actor: Actor): Promise<any> {
    await this.assertViewAccess(connectionId, actor);
    return workflowRepository.getVerificationHistory(connectionId);
  }

  public async listOfficers(): Promise<any> {
    return workflowRepository.findOfficers();
  }

  /** Returns the milestone category for dashboard / progress UI. */
  public getStageInfo(status: ConnectionStatus): {
    status: string;
    category: 'draft' | 'in_progress' | 'approved' | 'rejected' | 'completed';
  } {
    if (status === ConnectionStatus.DRAFT) return { status, category: 'draft' };
    if (status === ConnectionStatus.REJECTED) return { status, category: 'rejected' };
    if (status === ConnectionStatus.CONNECTION_COMPLETED) return { status, category: 'completed' };
    if (SUCCESS_STATUSES.includes(status)) return { status, category: 'approved' };
    if (IN_PROGRESS_STATUSES.includes(status)) return { status, category: 'in_progress' };
    return { status, category: 'in_progress' };
  }
}

export const workflowService = new WorkflowService();

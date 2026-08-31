import {
  ApplicationTimeline,
  ApplicationAssignment,
  VerificationHistory,
  WorkflowAction,
  AssignmentStatus,
  ConnectionStatus,
  VerificationResult,
  WorkflowActionType,
  Prisma,
  User,
} from '@prisma/client';
import { getPrismaClient } from '../db/db.client';

// In-memory TTL cache for rarely-changing data (officers list).
// Invalidated by time only — officers are added/removed very infrequently.
const officersCache = new Map<string, { data: any; expiresAt: number }>();
const OFFICERS_CACHE_TTL_MS = 60_000;

export interface CreateTimelineData {
  connectionRequestId: string;
  action: WorkflowActionType;
  status: ConnectionStatus;
  performedBy: string;
  notes?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export interface RecordWorkflowActionData {
  connectionRequestId: string;
  action: WorkflowActionType;
  fromStatus: ConnectionStatus;
  toStatus: ConnectionStatus;
  performedById: string;
  performedByName: string;
  performedByRole: string;
  comment?: string | null;
  previousActionId?: string | null;
}

export interface CreateAssignmentData {
  connectionRequestId: string;
  assignedToId: string;
  assignedToName: string;
  assignedToRole: string;
  assignedById: string;
  assignedByName: string;
  notes?: string | null;
  actionId?: string | null;
}

export interface RecordVerificationData {
  connectionRequestId: string;
  documentId: string;
  performedById: string;
  performedByName: string;
  performedByRole: string;
  action: VerificationResult;
  comment?: string | null;
}

export class WorkflowRepository {
  private get prisma() {
    return getPrismaClient();
  }

  public async createTimeline(data: CreateTimelineData): Promise<ApplicationTimeline> {
    return this.prisma.applicationTimeline.create({ data });
  }

  public async getTimeline(connectionRequestId: string): Promise<ApplicationTimeline[]> {
    return this.prisma.applicationTimeline.findMany({
      where: { connectionRequestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async recordWorkflowAction(data: RecordWorkflowActionData): Promise<WorkflowAction> {
    return this.prisma.workflowAction.create({ data });
  }

  public async getWorkflowActions(connectionRequestId: string): Promise<WorkflowAction[]> {
    return this.prisma.workflowAction.findMany({
      where: { connectionRequestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async createAssignment(data: CreateAssignmentData): Promise<ApplicationAssignment> {
    return this.prisma.applicationAssignment.create({ data });
  }

  public async getActiveAssignment(connectionRequestId: string): Promise<ApplicationAssignment | null> {
    return this.prisma.applicationAssignment.findFirst({
      where: { connectionRequestId, status: AssignmentStatus.ACTIVE },
      orderBy: { assignedAt: 'desc' },
    });
  }

  public async getAssignments(connectionRequestId: string): Promise<ApplicationAssignment[]> {
    return this.prisma.applicationAssignment.findMany({
      where: { connectionRequestId },
      orderBy: { assignedAt: 'desc' },
    });
  }

  public async releaseAssignment(
    assignmentId: string,
    status: AssignmentStatus,
    notes?: string | null,
  ): Promise<ApplicationAssignment> {
    return this.prisma.applicationAssignment.update({
      where: { id: assignmentId },
      data: {
        status,
        releasedAt: new Date(),
        ...(notes !== undefined && { notes }),
      },
    });
  }

  public async recordVerification(data: RecordVerificationData): Promise<VerificationHistory> {
    return this.prisma.verificationHistory.create({ data });
  }

  public async getVerificationHistory(connectionRequestId: string): Promise<VerificationHistory[]> {
    return this.prisma.verificationHistory.findMany({
      where: { connectionRequestId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Assignable officers = active ADMIN / SUPER_ADMIN users. */
  public async findOfficers(): Promise<Pick<User, 'id' | 'firstName' | 'middleName' | 'lastName' | 'email' | 'username' | 'role'>[]> {
    const cacheKey = 'officers:active';
    const cached = officersCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    const officers = await this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        email: true,
        username: true,
        role: true,
      },
      orderBy: { firstName: 'asc' },
    });

    officersCache.set(cacheKey, { data: officers, expiresAt: Date.now() + OFFICERS_CACHE_TTL_MS });
    return officers;
  }
}

export const workflowRepository = new WorkflowRepository();

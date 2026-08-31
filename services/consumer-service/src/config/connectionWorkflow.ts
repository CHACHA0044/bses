import { ConnectionStatus, UserRole, WorkflowActionType } from '@prisma/client';
import { WorkflowEngine, WorkflowTransitionRule } from '@bses/shared';

export const ADMIN_ROLES: string[] = [UserRole.ADMIN, UserRole.SUPER_ADMIN];

/**
 * Connection application state machine.
 *
 *   DRAFT ──SUBMIT──► SUBMITTED ──ASSIGN──► ASSIGNED ──START_VERIFICATION──► UNDER_VERIFICATION ──COMPLETE_VERIFICATION──► VERIFICATION_COMPLETE ──APPROVE──► APPROVED ──SCHEDULE_CONNECTION──► CONNECTION_SCHEDULED ──COMPLETE_CONNECTION──► CONNECTION_COMPLETED
 *     │ │                                  │                    │                            │
 *     │ └──SUBMIT (docs missing)──► DOCUMENTS_PENDING          │                            │
 *     │                          ▲        │                    ├──REASSIGN──► ASSIGNED ◄──REASSIGN───────────────┘
 *     │                          │        └──SUBMIT (still missing)──► DOCUMENTS_PENDING   └─────── REJECT ────────┴──────► REJECTED (terminal)
 *     │                          └──SUBMIT (re-upload OK)──► UNDER_VERIFICATION
 *     UNDER_VERIFICATION ──REQUEST_DOCUMENTS──► DOCUMENTS_PENDING ──SUBMIT (consumer re-upload)──► UNDER_VERIFICATION
 *     VERIFICATION_COMPLETE ──REJECT──► REJECTED
 */
export const connectionTransitions: WorkflowTransitionRule<ConnectionStatus, WorkflowActionType>[] = [
  // ── Consumer actions ──
  { action: WorkflowActionType.SUBMIT, from: ConnectionStatus.DRAFT, to: ConnectionStatus.SUBMITTED, roles: [UserRole.CONSUMER], label: 'Submit application' },
  // Auto-held submission: required documents missing / flagged at submit time.
  { action: WorkflowActionType.SUBMIT, from: ConnectionStatus.DRAFT, to: ConnectionStatus.DOCUMENTS_PENDING, roles: [UserRole.CONSUMER], label: 'Submit with documents pending' },
  // Re-submission after documents were requested
  { action: WorkflowActionType.SUBMIT, from: ConnectionStatus.DOCUMENTS_PENDING, to: ConnectionStatus.UNDER_VERIFICATION, roles: [UserRole.CONSUMER], label: 'Re-submit with documents' },
  // Re-submission while required documents are STILL missing/flagged (stays pending).
  { action: WorkflowActionType.SUBMIT, from: ConnectionStatus.DOCUMENTS_PENDING, to: ConnectionStatus.DOCUMENTS_PENDING, roles: [UserRole.CONSUMER], label: 'Re-submit (documents still pending)' },

  // ── Admin assignment ──
  { action: WorkflowActionType.ASSIGN, from: ConnectionStatus.SUBMITTED, to: ConnectionStatus.ASSIGNED, roles: ADMIN_ROLES, label: 'Assign officer' },
  { action: WorkflowActionType.REASSIGN, from: ConnectionStatus.ASSIGNED, to: ConnectionStatus.ASSIGNED, roles: ADMIN_ROLES, label: 'Reassign officer' },
  { action: WorkflowActionType.REASSIGN, from: ConnectionStatus.UNDER_VERIFICATION, to: ConnectionStatus.ASSIGNED, roles: ADMIN_ROLES, label: 'Reassign officer' },
  { action: WorkflowActionType.REASSIGN, from: ConnectionStatus.DOCUMENTS_PENDING, to: ConnectionStatus.ASSIGNED, roles: ADMIN_ROLES, label: 'Reassign officer' },
  { action: WorkflowActionType.REASSIGN, from: ConnectionStatus.VERIFICATION_COMPLETE, to: ConnectionStatus.ASSIGNED, roles: ADMIN_ROLES, label: 'Reassign officer' },

  // ── Admin verification ──
  { action: WorkflowActionType.START_VERIFICATION, from: ConnectionStatus.ASSIGNED, to: ConnectionStatus.UNDER_VERIFICATION, roles: ADMIN_ROLES, label: 'Start verification' },
  { action: WorkflowActionType.REQUEST_DOCUMENTS, from: ConnectionStatus.UNDER_VERIFICATION, to: ConnectionStatus.DOCUMENTS_PENDING, roles: ADMIN_ROLES, label: 'Request additional documents' },
  { action: WorkflowActionType.COMPLETE_VERIFICATION, from: ConnectionStatus.UNDER_VERIFICATION, to: ConnectionStatus.VERIFICATION_COMPLETE, roles: ADMIN_ROLES, label: 'Complete verification' },

  // ── Admin decision ──
  { action: WorkflowActionType.REJECT, from: ConnectionStatus.ASSIGNED, to: ConnectionStatus.REJECTED, roles: ADMIN_ROLES, label: 'Reject application' },
  { action: WorkflowActionType.REJECT, from: ConnectionStatus.UNDER_VERIFICATION, to: ConnectionStatus.REJECTED, roles: ADMIN_ROLES, label: 'Reject application' },
  { action: WorkflowActionType.REJECT, from: ConnectionStatus.DOCUMENTS_PENDING, to: ConnectionStatus.REJECTED, roles: ADMIN_ROLES, label: 'Reject application' },
  { action: WorkflowActionType.REJECT, from: ConnectionStatus.VERIFICATION_COMPLETE, to: ConnectionStatus.REJECTED, roles: ADMIN_ROLES, label: 'Reject application' },
  { action: WorkflowActionType.APPROVE, from: ConnectionStatus.VERIFICATION_COMPLETE, to: ConnectionStatus.APPROVED, roles: ADMIN_ROLES, label: 'Approve application' },

  // ── Connection installation ──
  { action: WorkflowActionType.SCHEDULE_CONNECTION, from: ConnectionStatus.APPROVED, to: ConnectionStatus.CONNECTION_SCHEDULED, roles: ADMIN_ROLES, label: 'Schedule connection' },
  { action: WorkflowActionType.COMPLETE_CONNECTION, from: ConnectionStatus.CONNECTION_SCHEDULED, to: ConnectionStatus.CONNECTION_COMPLETED, roles: ADMIN_ROLES, label: 'Complete connection' },
];

export const connectionWorkflow = new WorkflowEngine<ConnectionStatus, WorkflowActionType>(connectionTransitions);

/** Human-readable labels for timeline actions. */
export const WORKFLOW_ACTION_LABELS: Record<WorkflowActionType, string> = {
  [WorkflowActionType.APPLICATION_CREATED]: 'Application created',
  [WorkflowActionType.DOCUMENT_UPLOADED]: 'Document uploaded',
  [WorkflowActionType.SUBMIT]: 'Application submitted',
  [WorkflowActionType.ASSIGN]: 'Officer assigned',
  [WorkflowActionType.REASSIGN]: 'Officer reassigned',
  [WorkflowActionType.START_VERIFICATION]: 'Verification started',
  [WorkflowActionType.REQUEST_DOCUMENTS]: 'Additional documents requested',
  [WorkflowActionType.COMPLETE_VERIFICATION]: 'Verification completed',
  [WorkflowActionType.APPROVE]: 'Application approved',
  [WorkflowActionType.REJECT]: 'Application rejected',
  [WorkflowActionType.SCHEDULE_CONNECTION]: 'Connection scheduled',
  [WorkflowActionType.COMPLETE_CONNECTION]: 'Connection completed',
  [WorkflowActionType.ADD_REMARK]: 'Remark added',
  [WorkflowActionType.DOCUMENT_APPROVE]: 'Document approved',
  [WorkflowActionType.DOCUMENT_REJECT]: 'Document rejected',
  [WorkflowActionType.DOCUMENT_REQUEST]: 'Document requested',
};

/** Statuses that count as "in progress" for dashboards. */
export const IN_PROGRESS_STATUSES: ConnectionStatus[] = [
  ConnectionStatus.SUBMITTED,
  ConnectionStatus.ASSIGNED,
  ConnectionStatus.UNDER_VERIFICATION,
  ConnectionStatus.DOCUMENTS_PENDING,
  ConnectionStatus.VERIFICATION_COMPLETE,
];

export const SUCCESS_STATUSES: ConnectionStatus[] = [
  ConnectionStatus.APPROVED,
  ConnectionStatus.CONNECTION_SCHEDULED,
  ConnectionStatus.CONNECTION_COMPLETED,
];

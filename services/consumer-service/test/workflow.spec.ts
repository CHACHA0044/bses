import { describe, it, expect } from 'vitest';
import { ConnectionStatus, ConnectionType, UserRole, WorkflowActionType } from '@prisma/client';
import { WorkflowError } from '@bses/shared';
import { connectionWorkflow, ADMIN_ROLES, WORKFLOW_ACTION_LABELS } from '../src/config/connectionWorkflow';
import {
  assignApplicationSchema,
  rejectApplicationSchema,
  requestDocumentsSchema,
  completeVerificationSchema,
  scheduleConnectionSchema,
} from '../src/validators/workflow.validator';
import { requireAdmin, requireConsumer } from '../src/middlewares/auth.middleware';
import { assessDocumentCompleteness, REQUIRED_DOCUMENT_GROUPS } from '../src/config/requiredDocuments';

describe('Connection Workflow Configuration', () => {
  it('is a terminal state for REJECTED and CONNECTION_COMPLETED', () => {
    expect(connectionWorkflow.isTerminal(ConnectionStatus.REJECTED)).toBe(true);
    expect(connectionWorkflow.isTerminal(ConnectionStatus.CONNECTION_COMPLETED)).toBe(true);
    expect(connectionWorkflow.isTerminal(ConnectionStatus.SUBMITTED)).toBe(false);
  });

  it('allows the full happy-path lifecycle', () => {
    const path: Array<[ConnectionStatus, WorkflowActionType, ConnectionStatus, UserRole]> = [
      [ConnectionStatus.DRAFT, WorkflowActionType.SUBMIT, ConnectionStatus.SUBMITTED, UserRole.CONSUMER],
      [ConnectionStatus.SUBMITTED, WorkflowActionType.ASSIGN, ConnectionStatus.ASSIGNED, UserRole.ADMIN],
      [ConnectionStatus.ASSIGNED, WorkflowActionType.START_VERIFICATION, ConnectionStatus.UNDER_VERIFICATION, UserRole.ADMIN],
      [ConnectionStatus.UNDER_VERIFICATION, WorkflowActionType.COMPLETE_VERIFICATION, ConnectionStatus.VERIFICATION_COMPLETE, UserRole.ADMIN],
      [ConnectionStatus.VERIFICATION_COMPLETE, WorkflowActionType.APPROVE, ConnectionStatus.APPROVED, UserRole.ADMIN],
      [ConnectionStatus.APPROVED, WorkflowActionType.SCHEDULE_CONNECTION, ConnectionStatus.CONNECTION_SCHEDULED, UserRole.ADMIN],
      [ConnectionStatus.CONNECTION_SCHEDULED, WorkflowActionType.COMPLETE_CONNECTION, ConnectionStatus.CONNECTION_COMPLETED, UserRole.ADMIN],
    ];

    for (const [from, action, to, role] of path) {
      const rule = connectionWorkflow.findTransition(from, to);
      expect(rule).toBeDefined();
      expect(rule!.action).toBe(action);
      expect(() => connectionWorkflow.assertTransition(from, to, role)).not.toThrow();
    }
  });

  it('routes the documents-requested loop back to verification on consumer re-submit', () => {
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.UNDER_VERIFICATION, ConnectionStatus.DOCUMENTS_PENDING, UserRole.ADMIN),
    ).not.toThrow();
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.DOCUMENTS_PENDING, ConnectionStatus.UNDER_VERIFICATION, UserRole.CONSUMER),
    ).not.toThrow();
  });

  it('auto-holds a submission to DOCUMENTS_PENDING when required documents are missing', () => {
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.DRAFT, ConnectionStatus.DOCUMENTS_PENDING, UserRole.CONSUMER),
    ).not.toThrow();
  });

  it('keeps DOCUMENTS_PENDING when re-submitting with documents still missing', () => {
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.DOCUMENTS_PENDING, ConnectionStatus.DOCUMENTS_PENDING, UserRole.CONSUMER),
    ).not.toThrow();
  });

  it('gates the auto-hold transitions away from admins', () => {
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.DRAFT, ConnectionStatus.DOCUMENTS_PENDING, UserRole.ADMIN),
    ).toThrow(WorkflowError);
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.DOCUMENTS_PENDING, ConnectionStatus.DOCUMENTS_PENDING, UserRole.ADMIN),
    ).toThrow(WorkflowError);
  });

  it('gates consumer-only transitions away from admins', () => {
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.DRAFT, ConnectionStatus.SUBMITTED, UserRole.ADMIN),
    ).toThrow(WorkflowError);
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.DRAFT, ConnectionStatus.SUBMITTED, UserRole.CONSUMER),
    ).not.toThrow();
  });

  it('gates admin-only transitions away from consumers', () => {
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.SUBMITTED, ConnectionStatus.ASSIGNED, UserRole.CONSUMER),
    ).toThrow(WorkflowError);
    expect(() =>
      connectionWorkflow.assertTransition(ConnectionStatus.VERIFICATION_COMPLETE, ConnectionStatus.APPROVED, UserRole.CONSUMER),
    ).toThrow(WorkflowError);
  });

  it('allows both ADMIN and SUPER_ADMIN for admin transitions', () => {
    for (const role of ADMIN_ROLES) {
      expect(() =>
        connectionWorkflow.assertTransition(ConnectionStatus.ASSIGNED, ConnectionStatus.UNDER_VERIFICATION, role),
      ).not.toThrow();
      expect(() =>
        connectionWorkflow.assertTransition(ConnectionStatus.APPROVED, ConnectionStatus.CONNECTION_SCHEDULED, role),
      ).not.toThrow();
    }
  });

  it('supports reassignment from in-progress states', () => {
    for (const state of [
      ConnectionStatus.ASSIGNED,
      ConnectionStatus.UNDER_VERIFICATION,
      ConnectionStatus.DOCUMENTS_PENDING,
      ConnectionStatus.VERIFICATION_COMPLETE,
    ]) {
      expect(() => connectionWorkflow.assertTransition(state, ConnectionStatus.ASSIGNED, UserRole.ADMIN)).not.toThrow();
    }
  });

  it('rejects illegal jumps', () => {
    expect(() => connectionWorkflow.assertTransition(ConnectionStatus.SUBMITTED, ConnectionStatus.APPROVED, UserRole.ADMIN)).toThrow(WorkflowError);
    expect(() => connectionWorkflow.assertTransition(ConnectionStatus.DRAFT, ConnectionStatus.APPROVED, UserRole.ADMIN)).toThrow(WorkflowError);
    expect(() => connectionWorkflow.assertTransition(ConnectionStatus.REJECTED, ConnectionStatus.APPROVED, UserRole.ADMIN)).toThrow(WorkflowError);
  });

  it('exposes the consumer submit action in DOCUMENTS_PENDING', () => {
    const transitions = connectionWorkflow.getAllowedTransitions(ConnectionStatus.DOCUMENTS_PENDING, UserRole.CONSUMER);
    expect(transitions.some((t) => t.action === WorkflowActionType.SUBMIT)).toBe(true);
  });

  it('has a human-readable label for every timeline action', () => {
    const actions = Object.values(WorkflowActionType);
    for (const action of actions) {
      expect(WORKFLOW_ACTION_LABELS[action as WorkflowActionType]).toBeTruthy();
    }
  });
});

describe('Required Document Completeness Gate', () => {
  const baseDoc = (overrides: Partial<{ documentType: string; documentName: string; isUnreadable: boolean; needsReview: boolean }>) => ({
    documentName: 'doc.pdf',
    ...overrides,
  });

  it('declares identity and ownership/address groups for every connection type', () => {
    for (const type of Object.values(ConnectionType)) {
      const groups = REQUIRED_DOCUMENT_GROUPS[type];
      expect(groups.length).toBe(2);
    }
  });

  it('is incomplete when no documents are attached', () => {
    const result = assessDocumentCompleteness([], ConnectionType.DOMESTIC);
    expect(result.complete).toBe(false);
    expect(result.issues.length).toBe(2);
    expect(result.issues[0]).toContain('Identity Proof');
    expect(result.issues[1]).toContain('Ownership');
  });

  it('is complete when identity + ownership docs are acceptable', () => {
    const docs = [
      baseDoc({ documentType: 'AADHAAR_CARD', documentName: 'aadhaar.jpg' }),
      baseDoc({ documentType: 'OWNERSHIP_PROOF', documentName: 'lease.pdf' }),
    ];
    const result = assessDocumentCompleteness(docs, ConnectionType.DOMESTIC);
    expect(result.complete).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('accepts an alternative type within a group (PAN in place of Aadhaar)', () => {
    const docs = [
      baseDoc({ documentType: 'PAN_CARD', documentName: 'pan.jpg' }),
      baseDoc({ documentType: 'ADDRESS_PROOF', documentName: 'bill.pdf' }),
    ];
    const result = assessDocumentCompleteness(docs, ConnectionType.DOMESTIC);
    expect(result.complete).toBe(true);
  });

  it('flags a group when its only upload is unreadable or flagged for review', () => {
    const docs = [
      baseDoc({ documentType: 'AADHAAR_CARD', documentName: 'aadhaar.jpg', isUnreadable: true }),
      baseDoc({ documentType: 'OWNERSHIP_PROOF', documentName: 'lease.pdf' }),
    ];
    const result = assessDocumentCompleteness(docs, ConnectionType.DOMESTIC);
    expect(result.complete).toBe(false);
    expect(result.issues[0]).toContain('Identity Proof');
    expect(result.issues[0]).toContain('flagged for review');
  });

  it('accepts a readable duplicate when another copy of the same type is flagged', () => {
    const docs = [
      baseDoc({ documentType: 'AADHAAR_CARD', documentName: 'blurry.jpg', needsReview: true }),
      baseDoc({ documentType: 'AADHAAR_CARD', documentName: 'clear.jpg' }),
      baseDoc({ documentType: 'OWNERSHIP_PROOF', documentName: 'lease.pdf' }),
    ];
    const result = assessDocumentCompleteness(docs, ConnectionType.DOMESTIC);
    expect(result.complete).toBe(true);
  });
});

describe('Workflow Validators', () => {
  it('requires a reason for rejection', () => {
    expect(rejectApplicationSchema.safeParse({}).success).toBe(false);
    expect(rejectApplicationSchema.safeParse({ reason: 'Incomplete documents' }).success).toBe(true);
  });

  it('requires a valid assigneeId for assignment', () => {
    expect(assignApplicationSchema.safeParse({}).success).toBe(false);
    expect(assignApplicationSchema.safeParse({ assigneeId: 'officer-1' }).success).toBe(true);
  });

  it('accepts document ids for a document request', () => {
    const ok = requestDocumentsSchema.safeParse({ documentIds: ['doc-1', 'doc-2'], comment: 'Please upload' });
    expect(ok.success).toBe(true);
  });

  it('validates document verdicts on verification completion', () => {
    const ok = completeVerificationSchema.safeParse({
      documentVerdicts: [{ documentId: 'doc-1', action: 'APPROVED' }],
    });
    expect(ok.success).toBe(true);
    const bad = completeVerificationSchema.safeParse({
      documentVerdicts: [{ documentId: 'doc-1', action: 'UNKNOWN' }],
    });
    expect(bad.success).toBe(false);
  });

  it('validates schedule payload', () => {
    expect(scheduleConnectionSchema.safeParse({ scheduledDate: '2026-08-15' }).success).toBe(true);
    expect(scheduleConnectionSchema.safeParse({ scheduledDate: '2026-08-15', comment: 'Morning slot' }).success).toBe(true);
  });
});

describe('Workflow Authorization Middleware', () => {
  const makeReq = (role?: string) => ({ user: role ? { sub: 'u1', username: 'u1', role } : undefined });

  const invoke = (mw: (req: any, res: any, next: (err?: unknown) => void) => void, req: any) =>
    new Promise((resolve) => mw(req, {}, (err?: unknown) => resolve(err)));

  it('allows ADMIN and SUPER_ADMIN through requireAdmin', async () => {
    expect(await invoke(requireAdmin, makeReq(UserRole.ADMIN))).toBeUndefined();
    expect(await invoke(requireAdmin, makeReq(UserRole.SUPER_ADMIN))).toBeUndefined();
  });

  it('blocks CONSUMER from admin endpoints', async () => {
    const err = await invoke(requireAdmin, makeReq(UserRole.CONSUMER));
    expect(err).toBeDefined();
    expect((err as any).statusCode).toBe(403);
  });

  it('blocks unauthenticated requests', async () => {
    const err = await invoke(requireAdmin, makeReq(undefined));
    expect(err).toBeDefined();
    expect((err as any).statusCode).toBe(401);
  });

  it('allows CONSUMER through requireConsumer and blocks ADMIN', async () => {
    expect(await invoke(requireConsumer, makeReq(UserRole.CONSUMER))).toBeUndefined();
    const err = await invoke(requireConsumer, makeReq(UserRole.ADMIN));
    expect((err as any).statusCode).toBe(403);
  });
});

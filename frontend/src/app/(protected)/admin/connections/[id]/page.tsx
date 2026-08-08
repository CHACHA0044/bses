'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useApiResource } from '@/hooks/useApiResource';
import { Modal } from '@/components/ui/Modal';
import { Button, type ButtonVariant } from '@/components/ui/Button';
import { StatusChip } from '@/components/ui/Badge';
import { WorkflowModal } from '@/components/workflow/WorkflowModal';
import { ApplicationTimeline } from '@/components/workflow/ApplicationTimeline';
import { AssignmentHistory } from '@/components/workflow/AssignmentHistory';
import { VerificationHistory } from '@/components/workflow/VerificationHistory';
import {
  assignApplication,
  approveApplication,
  completeConnection,
  completeVerification,
  rejectApplication,
  requestDocuments,
  scheduleConnection,
  startVerification,
  addRemark,
} from '@/lib/workflowApi';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/utils';
import {
  ArrowLeft,
  Building2,
  CalendarPlus,
  Eye,
  FileText,
  Gauge,
  MapPin,
  MessageSquarePlus,
  ShieldCheck,
  User,
  UserCheck,
} from 'lucide-react';
import type {
  ConnectionDetail,
  DocumentRecord,
  Officer,
  StageCategory,
  WorkflowActionType,
} from '@/types/workflow';

type ModalKind =
  | 'assign'
  | 'start-verification'
  | 'request-documents'
  | 'complete-verification'
  | 'approve'
  | 'reject'
  | 'schedule'
  | 'complete'
  | 'remark'
  | 'preview'
  | null;

interface ActionConfig {
  modal: Exclude<ModalKind, 'preview'>;
  label: string;
  variant: ButtonVariant;
  description: string;
}

const ACTION_CONFIG: Partial<Record<WorkflowActionType, ActionConfig>> = {
  ASSIGN: {
    modal: 'assign',
    label: 'Assign Officer',
    variant: 'secondary',
    description: 'Select an officer who will own this application',
  },
  REASSIGN: {
    modal: 'assign',
    label: 'Reassign Officer',
    variant: 'secondary',
    description: 'Transfer this application to another officer',
  },
  START_VERIFICATION: {
    modal: 'start-verification',
    label: 'Start Verification',
    variant: 'secondary',
    description: 'Begin technical and document verification',
  },
  REQUEST_DOCUMENTS: {
    modal: 'request-documents',
    label: 'Request Documents',
    variant: 'secondary',
    description: 'Request re-upload of documents from the consumer',
  },
  COMPLETE_VERIFICATION: {
    modal: 'complete-verification',
    label: 'Complete Verification',
    variant: 'secondary',
    description: 'Record verdicts for each uploaded document',
  },
  APPROVE: { modal: 'approve', label: 'Approve', variant: 'amber', description: 'Approve the connection application' },
  REJECT: { modal: 'reject', label: 'Reject', variant: 'danger', description: 'Reject the connection application' },
  SCHEDULE_CONNECTION: {
    modal: 'schedule',
    label: 'Schedule Connection',
    variant: 'amber',
    description: 'Schedule the physical connection date',
  },
  COMPLETE_CONNECTION: {
    modal: 'complete',
    label: 'Complete Connection',
    variant: 'amber',
    description: 'Mark the connection as installed / completed',
  },
};

const STAGE_META: Record<StageCategory, { label: string; chip: string }> = {
  draft: { label: 'Draft', chip: 'bg-slate-100 text-slate-700 border-slate-200' },
  in_progress: { label: 'In Progress', chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  approved: { label: 'Approved', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  rejected: { label: 'Rejected', chip: 'bg-red-50 text-red-700 border-red-200' },
  completed: { label: 'Completed', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
};

const TERMINAL_STATUSES = ['REJECTED', 'CONNECTION_COMPLETED'];

const inputClass =
  'w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400';

export default function AdminConnectionDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  const detailUrl = `/admin/connection-requests/${id}`;
  const { data, loading, revalidate } = useApiResource<{ connection: ConnectionDetail }>(id ? detailUrl : null, {
    enabled: !!id,
  });
  const { data: officersData } = useApiResource<{ officers: Officer[] }>('/admin/officers');

  const connection = data?.connection;
  const officers = officersData?.officers ?? [];
  const documents = connection?.documents ?? [];
  const events = connection?.timeline ?? [];

  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [verdicts, setVerdicts] = useState<Record<string, { action: 'APPROVED' | 'REJECTED'; comment: string }>>({});
  const [remark, setRemark] = useState('');
  const [previewDoc, setPreviewDoc] = useState<DocumentRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const activeAssignment = useMemo(
    () => (connection?.assignments ?? []).find((a) => a.status === 'ACTIVE'),
    [connection],
  );

  // Unique transition actions offered by the workflow engine for this status.
  const actionButtons = useMemo(() => {
    const seen = new Set<WorkflowActionType>();
    const buttons: { action: WorkflowActionType; config: ActionConfig }[] = [];
    for (const t of connection?.allowedTransitions ?? []) {
      if (seen.has(t.action)) continue;
      seen.add(t.action);
      const config = ACTION_CONFIG[t.action];
      if (config) buttons.push({ action: t.action, config });
    }
    return buttons;
  }, [connection]);

  const isTerminal = connection ? TERMINAL_STATUSES.includes(connection.status) : false;
  const isReassign = actionButtons.some((b) => b.action === 'REASSIGN');
  const eligibleOfficers = isReassign
    ? officers.filter((o) => o.id !== activeAssignment?.assignedToId)
    : officers;

  const openModal = (kind: ModalKind): void => {
    setError('');
    setComment('');
    setReason('');
    setScheduledDate('');
    setRemark('');
    setSelectedDocumentIds([]);
    setVerdicts({});
    if (kind === 'assign') {
      setAssigneeId(eligibleOfficers[0]?.id ?? '');
    }
    if (kind === 'complete-verification') {
      setVerdicts(
        Object.fromEntries(documents.map((d) => [d.id, { action: 'APPROVED' as const, comment: '' }])),
      );
    }
    setActiveModal(kind);
  };

  const closeModal = (): void => {
    if (!saving) {
      setActiveModal(null);
      setPreviewDoc(null);
    }
  };

  const run = async (fn: () => Promise<unknown>): Promise<void> => {
    setSaving(true);
    setError('');
    try {
      await fn();
      closeModal();
      await revalidate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = (): Promise<void> =>
    run(() =>
      assignApplication(id, {
        assigneeId,
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    );

  const handleStartVerification = (): Promise<void> =>
    run(() =>
      startVerification(id, {
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    );

  const handleRequestDocuments = (): Promise<void> =>
    run(() =>
      requestDocuments(id, {
        ...(selectedDocumentIds.length > 0 && { documentIds: selectedDocumentIds }),
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    );

  const handleCompleteVerification = (): Promise<void> =>
    run(() =>
      completeVerification(id, {
        documentVerdicts: documents.map((d) => {
          const v = verdicts[d.id] ?? { action: 'APPROVED' as const, comment: '' };
          return {
            documentId: d.id,
            action: v.action,
            ...(v.comment.trim() && { comment: v.comment.trim() }),
          };
        }),
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    );

  const handleApprove = (): Promise<void> =>
    run(() =>
      approveApplication(id, {
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    );

  const handleReject = (): Promise<void> =>
    run(() =>
      rejectApplication(id, {
        reason: reason.trim(),
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    );

  const handleSchedule = (): Promise<void> =>
    run(() =>
      scheduleConnection(id, {
        ...(scheduledDate && { scheduledDate: new Date(scheduledDate).toISOString() }),
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    );

  const handleComplete = (): Promise<void> =>
    run(() =>
      completeConnection(id, {
        ...(comment.trim() && { comment: comment.trim() }),
      }),
    );

  const handleRemark = (): Promise<void> => run(() => addRemark(id, { remark: remark.trim() }));

  if (loading) {
    return <div className="p-8 text-slate-500 animate-pulse">Loading application workflow...</div>;
  }

  if (!connection) {
    return (
      <div className="p-8 text-red-500">
        Application not found.{' '}
        <Link href="/admin/connections" className="underline font-semibold">
          Back to applications
        </Link>
      </div>
    );
  }

  const user = connection.user;
  const applicantName = [user?.firstName, user?.middleName, user?.lastName].filter(Boolean).join(' ');

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-2">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/admin/connections"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to applications
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-bold text-slate-900">{connection.applicationNumber}</h1>
            <StatusChip status={connection.status} />
            {connection.stage && (
              <span
                className={`px-3 py-1 rounded-full border text-xs font-bold uppercase tracking-wide ${
                  STAGE_META[connection.stage.category].chip
                }`}
              >
                {STAGE_META[connection.stage.category].label}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Submitted {formatDate(connection.createdAt)} · Last updated {formatDateTime(connection.updatedAt)}
          </p>
        </div>
      </div>

      {/* Action bar */}
      {!isTerminal && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Workflow Actions</p>
          <div className="flex flex-wrap gap-2">
            {actionButtons.map(({ action, config }) => (
              <Button key={action} variant={config.variant} size="sm" onClick={() => openModal(config.modal)}>
                {config.label}
              </Button>
            ))}
            <Button variant="ghost" size="sm" leftIcon={<MessageSquarePlus className="w-4 h-4" />} onClick={() => openModal('remark')}>
              Add Remark
            </Button>
          </div>
          {actionButtons.length === 0 && (
            <p className="text-xs text-slate-400 mt-1">No actions are available in the current state.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Application details */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Application Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                <span className="flex items-center gap-1.5 font-bold text-slate-400 uppercase">
                  <User className="w-3.5 h-3.5" /> Applicant
                </span>
                <p className="text-sm font-bold text-slate-800">{applicantName || '—'}</p>
                <p className="text-slate-500">{user?.email}</p>
                {user?.username && <p className="text-slate-500">@{user.username}</p>}
              </div>
              <div className="p-4 bg-slate-50 rounded-xl space-y-1">
                <span className="flex items-center gap-1.5 font-bold text-slate-400 uppercase">
                  <Building2 className="w-3.5 h-3.5" /> Connection
                </span>
                <p className="text-sm font-bold text-slate-800">{connection.connectionType}</p>
                <p className="flex items-center gap-1 text-slate-500">
                  <Gauge className="w-3.5 h-3.5" /> {connection.requiredLoad} kW
                </p>
              </div>
              <div className="sm:col-span-2 p-4 bg-slate-50 rounded-xl space-y-1">
                <span className="flex items-center gap-1.5 font-bold text-slate-400 uppercase">
                  <MapPin className="w-3.5 h-3.5" /> Property Address
                </span>
                <p className="text-sm font-bold text-slate-800">{connection.propertyAddress}</p>
              </div>
              {(user?.caNumber || user?.meterNumber) && (
                <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {user?.caNumber && (
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <span className="block font-bold text-slate-400 uppercase mb-1">CA Number</span>
                      <p className="text-sm font-bold text-slate-800">{user.caNumber}</p>
                    </div>
                  )}
                  {user?.meterNumber && (
                    <div className="p-4 bg-slate-50 rounded-xl">
                      <span className="block font-bold text-slate-400 uppercase mb-1">Meter Number</span>
                      <p className="text-sm font-bold text-slate-800">{user.meterNumber}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Uploaded Documents</h2>
              <span className="text-xs font-semibold text-slate-400">{documents.length} file(s)</span>
            </div>

            {documents.length === 0 ? (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-6 text-center">
                No documents uploaded yet.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div className="h-10 w-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-800 truncate" title={doc.documentName}>
                        {doc.documentName}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {doc.documentType.replaceAll('_', ' ')} · {formatFileSize(doc.fileSize)} ·{' '}
                        {formatDate(doc.uploadDate)}
                      </p>
                      <span className="mt-1 inline-block">
                        <StatusChip status={doc.status} showDot={false} />
                      </span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Eye className="w-4 h-4" />}
                      onClick={() => setPreviewDoc(doc)}
                    >
                      Preview
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity timeline */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Activity Timeline</h2>
            <ApplicationTimeline events={events} />
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Status summary */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Status Summary</h2>
            <div className="space-y-3 text-xs">
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <span className="flex items-center gap-2 font-bold text-slate-500 uppercase">
                  <ShieldCheck className="w-4 h-4" /> Current Stage
                </span>
                <span className="font-bold text-slate-900">
                  {connection.stage ? STAGE_META[connection.stage.category].label : connection.status}
                </span>
              </div>
              <div className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                <span className="flex items-center gap-2 font-bold text-slate-500 uppercase">
                  <UserCheck className="w-4 h-4" /> Assigned Officer
                </span>
                <span className="font-bold text-slate-900 text-right">
                  {activeAssignment?.assignedToName ?? '—'}
                </span>
              </div>
              {connection.stage?.category === 'in_progress' && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-amber-800">
                  {actionButtons[0] ? (
                    <>
                      Next step:{' '}
                      <button
                        className="font-bold underline hover:text-amber-950"
                        onClick={() => openModal(actionButtons[0].config.modal)}
                      >
                        {actionButtons[0].config.label}
                      </button>
                    </>
                  ) : (
                    'Awaiting the consumer to take the next step.'
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Assignments */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Assignment History</h2>
            <AssignmentHistory assignments={connection.assignments ?? []} />
          </div>

          {/* Verification history */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Document Verification</h2>
            <VerificationHistory verifications={connection.verifications ?? []} documents={documents} />
          </div>
        </div>
      </div>

      {/* ── Assign / Reassign modal ── */}
      <WorkflowModal
        isOpen={activeModal === 'assign'}
        onClose={closeModal}
        title={isReassign ? 'Reassign Officer' : 'Assign Officer'}
        description={
          isReassign
            ? `Application is currently with ${activeAssignment?.assignedToName ?? 'an officer'}.`
            : 'Select an officer who will own this application'
        }
        submitLabel={isReassign ? 'Reassign' : 'Assign'}
        isLoading={saving}
        error={error}
        onSubmit={handleAssign}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Select Officer</label>
            <select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={saving} className={inputClass}>
              <option value="" disabled>
                Choose an officer…
              </option>
              {eligibleOfficers.map((o) => (
                <option key={o.id} value={o.id}>
                  {[o.firstName, o.middleName, o.lastName].filter(Boolean).join(' ')} ({o.role})
                </option>
              ))}
            </select>
            {eligibleOfficers.length === 0 && (
              <p className="text-[11px] text-amber-700 mt-1">No other active officers available to assign.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Comment (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={saving} rows={2} className={inputClass} placeholder="Reason for assignment…" />
          </div>
        </div>
      </WorkflowModal>

      {/* ── Start verification modal ── */}
      <WorkflowModal
        isOpen={activeModal === 'start-verification'}
        onClose={closeModal}
        title="Start Verification"
        description={ACTION_CONFIG.START_VERIFICATION?.description}
        submitLabel="Start Verification"
        isLoading={saving}
        error={error}
        onSubmit={handleStartVerification}
      >
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Comment (optional)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={saving} rows={3} className={inputClass} placeholder="Notes for the verification officer…" />
        </div>
      </WorkflowModal>

      {/* ── Request documents modal ── */}
      <WorkflowModal
        isOpen={activeModal === 'request-documents'}
        onClose={closeModal}
        title="Request Additional Documents"
        description={ACTION_CONFIG.REQUEST_DOCUMENTS?.description}
        submitLabel="Request Documents"
        isLoading={saving}
        error={error}
        onSubmit={handleRequestDocuments}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Select documents to re-request</label>
            <div className="space-y-1.5 max-h-44 overflow-y-auto border border-slate-200 rounded-xl p-2">
              {documents.length === 0 && <p className="text-xs text-slate-400 p-2">No documents to select.</p>}
              {documents.map((doc) => (
                <label key={doc.id} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-amber-500"
                    checked={selectedDocumentIds.includes(doc.id)}
                    disabled={saving}
                    onChange={(e) =>
                      setSelectedDocumentIds((prev) =>
                        e.target.checked ? [...prev, doc.id] : prev.filter((x) => x !== doc.id),
                      )
                    }
                  />
                  <span className="text-xs font-semibold text-slate-700 truncate">{doc.documentName}</span>
                </label>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Leave unchecked to request documents without specifying files.</p>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Message to consumer (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={saving} rows={2} className={inputClass} placeholder="Explain what is missing…" />
          </div>
        </div>
      </WorkflowModal>

      {/* ── Complete verification modal ── */}
      <WorkflowModal
        isOpen={activeModal === 'complete-verification'}
        onClose={closeModal}
        title="Complete Verification"
        description={ACTION_CONFIG.COMPLETE_VERIFICATION?.description}
        submitLabel="Complete Verification"
        maxWidth="lg"
        isLoading={saving}
        error={error}
        onSubmit={handleCompleteVerification}
      >
        <div className="space-y-4">
          {documents.length === 0 && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-xl p-4">
              No documents are attached to this application. You can still complete verification.
            </p>
          )}
          <div className="space-y-3">
            {documents.map((doc) => {
              const v = verdicts[doc.id] ?? { action: 'APPROVED' as const, comment: '' };
              return (
                <div key={doc.id} className="border border-slate-200 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-800 truncate" title={doc.documentName}>
                      {doc.documentName}
                    </p>
                    <select
                      value={v.action}
                      disabled={saving}
                      className="shrink-0 bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 text-xs font-semibold"
                      onChange={(e) =>
                        setVerdicts((prev) => ({
                          ...prev,
                          [doc.id]: { ...prev[doc.id], action: e.target.value as 'APPROVED' | 'REJECTED' },
                        }))
                      }
                    >
                      <option value="APPROVED">Approve</option>
                      <option value="REJECTED">Reject</option>
                    </select>
                  </div>
                  <input
                    type="text"
                    value={v.comment}
                    disabled={saving}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs"
                    placeholder="Per-document remark (optional)"
                    onChange={(e) =>
                      setVerdicts((prev) => ({
                        ...prev,
                        [doc.id]: { ...prev[doc.id], comment: e.target.value },
                      }))
                    }
                  />
                </div>
              );
            })}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Overall comment (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={saving} rows={2} className={inputClass} />
          </div>
        </div>
      </WorkflowModal>

      {/* ── Approve modal ── */}
      <WorkflowModal
        isOpen={activeModal === 'approve'}
        onClose={closeModal}
        title="Approve Application"
        description={ACTION_CONFIG.APPROVE?.description}
        submitLabel="Approve Application"
        submitVariant="amber"
        isLoading={saving}
        error={error}
        onSubmit={handleApprove}
      >
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Comment (optional)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={saving} rows={3} className={inputClass} placeholder="Approval notes…" />
        </div>
      </WorkflowModal>

      {/* ── Reject modal ── */}
      <WorkflowModal
        isOpen={activeModal === 'reject'}
        onClose={closeModal}
        title="Reject Application"
        description={ACTION_CONFIG.REJECT?.description}
        submitLabel="Reject Application"
        submitVariant="danger"
        isLoading={saving}
        error={error}
        onSubmit={handleReject}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Rejection Reason *</label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} disabled={saving} rows={3} className={inputClass} placeholder="Reason shown to the consumer…" />
            {reason.trim().length > 0 && reason.trim().length < 3 && (
              <p className="text-[11px] text-red-600 mt-1">Reason must be at least 3 characters.</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Internal comment (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={saving} rows={2} className={inputClass} />
          </div>
        </div>
      </WorkflowModal>

      {/* ── Schedule modal ── */}
      <WorkflowModal
        isOpen={activeModal === 'schedule'}
        onClose={closeModal}
        title="Schedule Connection"
        description={ACTION_CONFIG.SCHEDULE_CONNECTION?.description}
        submitLabel="Schedule Connection"
        submitVariant="amber"
        maxWidth="lg"
        isLoading={saving}
        error={error}
        onSubmit={handleSchedule}
      >
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Installation Date & Time *</label>
            <div className="relative">
              <CalendarPlus className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input type="datetime-local" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} disabled={saving} className={`${inputClass} pl-9`} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Comment (optional)</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={saving} rows={2} className={inputClass} />
          </div>
        </div>
      </WorkflowModal>

      {/* ── Complete modal ── */}
      <WorkflowModal
        isOpen={activeModal === 'complete'}
        onClose={closeModal}
        title="Complete Connection"
        description={ACTION_CONFIG.COMPLETE_CONNECTION?.description}
        submitLabel="Complete Connection"
        submitVariant="amber"
        isLoading={saving}
        error={error}
        onSubmit={handleComplete}
      >
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Comment (optional)</label>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} disabled={saving} rows={3} className={inputClass} placeholder="Installation summary…" />
        </div>
      </WorkflowModal>

      {/* ── Remark modal ── */}
      <WorkflowModal
        isOpen={activeModal === 'remark'}
        onClose={closeModal}
        title="Add Remark"
        description="Add an internal note to the application timeline (not a status change)."
        submitLabel="Add Remark"
        isLoading={saving}
        error={error}
        onSubmit={handleRemark}
      >
        <div>
          <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Remark *</label>
          <textarea value={remark} onChange={(e) => setRemark(e.target.value)} disabled={saving} rows={3} className={inputClass} placeholder="Internal note for the team…" />
        </div>
      </WorkflowModal>

      {/* ── Document preview modal ── */}
      <Modal
        isOpen={!!previewDoc}
        onClose={() => !saving && setPreviewDoc(null)}
        title={previewDoc?.documentName ?? ''}
        description={`${previewDoc?.documentType.replaceAll('_', ' ') ?? ''} · ${previewDoc ? formatFileSize(previewDoc.fileSize) : ''}`}
        maxWidth="xl"
      >
        {previewDoc && (
          <div className="space-y-3">
            <iframe
              src={`/api/documents/${previewDoc.id}`}
              title={previewDoc.documentName}
              className="w-full h-[440px] rounded-xl border border-slate-200 bg-slate-50"
            />
            <div className="flex justify-end">
              <a
                href={`/api/documents/${previewDoc.id}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700 hover:text-amber-600 transition"
              >
                <Eye className="w-4 h-4" /> Open in new tab
              </a>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

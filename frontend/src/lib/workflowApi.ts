import { apiClient } from '@/lib/apiClient';
import type {
  Assignment,
  ConnectionDetail,
  Officer,
  TimelineEvent,
  VerificationRecord,
  VerificationResult,
} from '@/types/workflow';

interface ApiEnvelope<T> {
  success: boolean;
  data: T;
}

export interface ApiErrorPayload {
  response?: { data?: { error?: { message?: string } } };
}

/** Extracts the backend's error message from an axios rejection. */
export function apiErrorMessage(err: unknown, fallback = 'Request failed'): string {
  const server = (err as ApiErrorPayload)?.response?.data?.error?.message;
  return server || (err instanceof Error ? err.message : fallback);
}

/* ── Reads ─────────────────────────────────────────────────────────────── */

export async function getAdminConnectionDetail(id: string): Promise<ConnectionDetail> {
  const res = await apiClient.get<ApiEnvelope<{ connection: ConnectionDetail }>>(`/admin/connection-requests/${id}`);
  return res.data.data.connection;
}

export async function getAdminTimeline(id: string): Promise<TimelineEvent[]> {
  const res = await apiClient.get<ApiEnvelope<{ timeline: TimelineEvent[] }>>(`/admin/connection-requests/${id}/timeline`);
  return res.data.data.timeline;
}

export async function getAssignments(id: string): Promise<Assignment[]> {
  const res = await apiClient.get<ApiEnvelope<{ assignments: Assignment[] }>>(`/admin/connection-requests/${id}/assignments`);
  return res.data.data.assignments;
}

export async function getVerifications(id: string): Promise<VerificationRecord[]> {
  const res = await apiClient.get<ApiEnvelope<{ verifications: VerificationRecord[] }>>(`/admin/connection-requests/${id}/verifications`);
  return res.data.data.verifications;
}

export async function listOfficers(): Promise<Officer[]> {
  const res = await apiClient.get<ApiEnvelope<{ officers: Officer[] }>>('/admin/officers');
  return res.data.data.officers;
}

/* ── Mutations (all return the refreshed application) ──────────────────── */

interface CommentPayload {
  comment?: string;
}

const POST = async <T>(url: string, body: unknown): Promise<T> => {
  try {
    const res = await apiClient.post<ApiEnvelope<T>>(url, body ?? {});
    return res.data.data;
  } catch (err) {
    throw new Error(apiErrorMessage(err));
  }
};

export function assignApplication(id: string, body: { assigneeId: string; comment?: string }): Promise<{ connection: ConnectionDetail }> {
  return POST(`/admin/connection-requests/${id}/assign`, body);
}

export function startVerification(id: string, body: CommentPayload = {}): Promise<{ connection: ConnectionDetail }> {
  return POST(`/admin/connection-requests/${id}/verification/start`, body);
}

export function requestDocuments(
  id: string,
  body: { documentIds?: string[]; comment?: string },
): Promise<{ connection: ConnectionDetail }> {
  return POST(`/admin/connection-requests/${id}/documents/request`, body);
}

export interface DocumentVerdict {
  documentId: string;
  action: VerificationResult;
  comment?: string;
}

export function completeVerification(
  id: string,
  body: { documentVerdicts?: DocumentVerdict[]; comment?: string },
): Promise<{ connection: ConnectionDetail }> {
  return POST(`/admin/connection-requests/${id}/verification/complete`, body);
}

export function approveApplication(id: string, body: CommentPayload = {}): Promise<{ connection: ConnectionDetail }> {
  return POST(`/admin/connection-requests/${id}/approve`, body);
}

export function rejectApplication(
  id: string,
  body: { reason: string; comment?: string },
): Promise<{ connection: ConnectionDetail }> {
  return POST(`/admin/connection-requests/${id}/reject`, body);
}

export function scheduleConnection(
  id: string,
  body: { scheduledDate?: string; comment?: string },
): Promise<{ connection: ConnectionDetail }> {
  return POST(`/admin/connection-requests/${id}/schedule`, body);
}

export function completeConnection(id: string, body: CommentPayload = {}): Promise<{ connection: ConnectionDetail }> {
  return POST(`/admin/connection-requests/${id}/complete`, body);
}

export function addRemark(id: string, body: { remark: string }): Promise<{ connection: ConnectionDetail }> {
  return POST(`/admin/connection-requests/${id}/remarks`, body);
}

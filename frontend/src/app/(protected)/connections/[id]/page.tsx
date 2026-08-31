'use client';

import React, { useState } from 'react';
import { useParams } from 'next/navigation';
import { useApiResource } from '@/hooks/useApiResource';
import { StatusChip } from '@/components/ui/Badge';
import { ConnectionDetailSkeleton } from '@/components/ui/Skeleton';
import { ApplicationTimeline } from '@/components/workflow/ApplicationTimeline';
import { DocumentCard } from '@/components/workflow/DocumentCard';
import { formatDate, formatDateTime } from '@/lib/utils';
import { apiClient } from '@/lib/apiClient';
import { Alert } from '@/components/ui/Alert';
import { AlertSlot } from '@/components/ui/AlertSlot';
import { validateDocumentFile, uploadGuidanceText, ACCEPT_ATTR } from '@/lib/documentUpload';
import { Building2, Gauge, MapPin, Upload, Send, Loader2 } from 'lucide-react';
import type { ConnectionDetail } from '@/types/workflow';

const REUPLOAD_DOC_TYPES = [
  { value: 'AADHAAR_CARD', label: 'Aadhaar Card' },
  { value: 'PAN_CARD', label: 'PAN Card' },
  { value: 'ADDRESS_PROOF', label: 'Address Proof' },
  { value: 'OWNERSHIP_PROOF', label: 'Ownership / Lease Proof' },
  { value: 'PASSPORT_PHOTO', label: 'Passport Photo' },
  { value: 'OTHER', label: 'Other' },
];

export default function ConnectionDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  // SWR-backed detail — warmed by the dashboard / list-row PrefetchLink
  // (dataUrl /connections/${id}/detail), so a hovered "Track" link renders instantly.
  const { data, loading, revalidate } = useApiResource<{ connection: ConnectionDetail }>(
    id ? `/connections/${id}/detail` : null,
    { enabled: !!id },
  );
  const connection = data?.connection;

  const [docType, setDocType] = useState('AADHAAR_CARD');
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionWarning, setActionWarning] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !connection) return;

    setOptimizing(true);
    setActionError(null);
    setActionWarning(null);
    try {
      // Large photos are optimized in-browser first (Canvas → ≤2000px JPEG) so
      // the 2 MB limit is rarely hit and no oversized file wastes an OCR cycle.
      // imageCompressor is loaded on demand so its code never sits in the
      // initial route chunk.
      const { prepareUploadFile } = await import('@/lib/imageCompressor');
      const { file: uploadFile } = await prepareUploadFile(file);

      // Client-side pre-upload checks (type, size, image quality) so a bad
      // file never reaches the server or wastes an OCR cycle.
      const check = await validateDocumentFile(uploadFile);
      if (!check.ok) {
        setActionError(check.errors[0] ?? 'This file cannot be uploaded. Please try a different file.');
        setActionWarning(null);
        setUploading(false);
        e.target.value = '';
        return;
      }
      setActionWarning(check.warnings[0] ?? null);

      setUploading(true);
      setActionSuccess(null);
      try {
        const formData = new FormData();
        formData.append('file', uploadFile);
        formData.append('documentType', docType);
        formData.append('connectionRequestId', connection.id);

        const res = await apiClient.post('/documents/upload', formData, {
          withCredentials: true,
          timeout: 60_000,
          headers: { 'Content-Type': null },
        });
        if (res.data.success) {
          setActionSuccess(`"${uploadFile.name}" uploaded successfully.`);
          setActionWarning(null);
          e.target.value = '';
        }
        await revalidate();
      } catch (err: any) {
        setActionError(err.response?.data?.error?.message || 'Failed to upload document.');
      } finally {
        setUploading(false);
      }
    } finally {
      setOptimizing(false);
    }
  };

  const handleResubmit = async () => {
    if (!connection) return;
    setResubmitting(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await apiClient.put(`/connections/${connection.id}`, { isSubmit: true });
      if (res.data.success) {
        setActionSuccess('Your documents have been submitted for verification.');
      }
      await revalidate();
    } catch (err: any) {
      setActionError(err.response?.data?.error?.message || 'Failed to resubmit documents.');
    } finally {
      setResubmitting(false);
    }
  };

  if (loading) {
    return <ConnectionDetailSkeleton />;
  }

  if (!connection) {
    return <div className="p-8 text-red-500">Application not found</div>;
  }

  const events = connection.timeline ?? [];
  const documents = connection.documents ?? [];

  return (
    <div className="max-w-4xl mx-auto space-y-6 p-2">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Application Number</span>
            <h1 className="text-2xl font-bold text-slate-900">{connection.applicationNumber}</h1>
            <p className="text-xs text-slate-500">
              Submitted on: {formatDate(connection.createdAt)} · Last updated {formatDateTime(connection.updatedAt)}
            </p>
          </div>

          <StatusChip status={connection.status} />
        </div>

        {/* Connection Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <span className="flex items-center gap-1.5 font-bold text-slate-400 uppercase">
              <Building2 className="w-3.5 h-3.5" /> Connection Type
            </span>
            <p className="text-sm font-bold text-slate-800">{connection.connectionType}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl space-y-1">
            <span className="flex items-center gap-1.5 font-bold text-slate-400 uppercase">
              <Gauge className="w-3.5 h-3.5" /> Required Load
            </span>
            <p className="text-sm font-bold text-slate-800">{connection.requiredLoad} kW</p>
          </div>

          <div className="md:col-span-2 p-4 bg-slate-50 rounded-xl space-y-1">
            <span className="flex items-center gap-1.5 font-bold text-slate-400 uppercase">
              <MapPin className="w-3.5 h-3.5" /> Property Address
            </span>
            <p className="text-sm font-bold text-slate-800">{connection.propertyAddress}</p>
          </div>
        </div>
      </div>

      <AlertSlot show={!!actionError || !!actionWarning || !!actionSuccess} gap={24}>
        {actionError && (
          <Alert type="error" onClose={() => setActionError(null)}>
            {actionError}
          </Alert>
        )}
        {actionWarning && (
          <Alert type="warning" onClose={() => setActionWarning(null)}>
            {actionWarning}
          </Alert>
        )}
        {actionSuccess && (
          <Alert type="success" onClose={() => setActionSuccess(null)}>
            {actionSuccess}
          </Alert>
        )}
      </AlertSlot>

      {connection.status === 'DOCUMENTS_PENDING' && (
        <div className="bg-white rounded-2xl border-2 border-amber-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-amber-800 uppercase tracking-wide">Additional Documents Requested</h2>
              <p className="text-xs text-slate-500 mt-1">
                {uploadGuidanceText()} BSES has requested clearer copies of some documents. Upload them below and resubmit for verification.
              </p>
            </div>
            <Send className="w-6 h-6 text-amber-500 shrink-0" />
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Document Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                disabled={uploading || resubmitting}
                className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-sm text-slate-900"
              >
                {REUPLOAD_DOC_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Choose File</label>
              <input
                type="file"
                accept={ACCEPT_ATTR}
                disabled={uploading || resubmitting}
                onChange={handleUpload}
                className="block w-full text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:text-amber-400 file:font-bold file:text-xs file:py-2 file:px-3 hover:file:bg-slate-800 file:cursor-pointer"
              />
            </div>
            <button
              type="button"
              onClick={handleResubmit}
              disabled={uploading || resubmitting}
              className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-bold text-xs py-2.5 px-5 rounded-xl shadow transition disabled:opacity-50"
            >
              {resubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{resubmitting ? 'Submitting...' : 'Resubmit for Verification'}</span>
            </button>
          </div>
          {optimizing && (
            <p className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Optimizing image… large photos are compressed in your browser before upload.
            </p>
          )}
        </div>
      )}

      {/* Documents */}
      {documents.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Uploaded Documents</h2>
            <span className="text-xs font-semibold text-slate-400">{documents.length} file(s)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {documents.map((doc) => (
              <DocumentCard key={doc.id} doc={doc} variant="consumer" />
            ))}
          </div>
        </div>
      )}

      {/* Live workflow timeline */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide mb-4">Application Tracking Progress</h2>
        <ApplicationTimeline events={events} />
      </div>
    </div>
  );
}

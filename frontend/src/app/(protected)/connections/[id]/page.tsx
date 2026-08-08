'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useApiResource } from '@/hooks/useApiResource';
import { StatusChip } from '@/components/ui/Badge';
import { ApplicationTimeline } from '@/components/workflow/ApplicationTimeline';
import { formatDate, formatDateTime, formatFileSize } from '@/lib/utils';
import { Building2, FileText, Gauge, MapPin } from 'lucide-react';
import type { ConnectionDetail } from '@/types/workflow';

export default function ConnectionDetailPage() {
  const params = useParams();
  const id = params?.id as string;

  // SWR-backed detail — warmed by the dashboard / list-row PrefetchLink
  // (dataUrl /connections/${id}/detail), so a hovered "Track" link renders instantly.
  const { data, loading } = useApiResource<{ connection: ConnectionDetail }>(
    id ? `/connections/${id}/detail` : null,
    { enabled: !!id },
  );
  const connection = data?.connection;

  if (loading) {
    return <div className="p-8 text-slate-500 animate-pulse">Loading application timeline...</div>;
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

      {/* Documents */}
      {documents.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Uploaded Documents</h2>
            <span className="text-xs font-semibold text-slate-400">{documents.length} file(s)</span>
          </div>
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
                    {doc.documentType.replaceAll('_', ' ')} · {formatFileSize(doc.fileSize)}
                  </p>
                </div>
                <StatusChip status={doc.status} showDot={false} />
              </div>
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

'use client';

import React from 'react';
import { useApiResource } from '@/hooks/useApiResource';
import { PrefetchLink } from '@/components/ui/PrefetchLink';
import { StatusChip } from '@/components/ui/Badge';
import { ConnectionsSkeleton } from '@/components/ui/Skeleton';
import { FilePlus, FolderOpen, ArrowRight, Clock } from 'lucide-react';

export interface ConnectionsPayload {
  connections?: any[];
}

export function ConnectionsView({ initialData }: { initialData?: ConnectionsPayload }) {
  // Server-resolved initialData renders the list instantly; SWR keeps it fresh
  // in the background. The idle PrefetchProvider also warms /connections so
  // dashboard → track-applications navigation is instant.
  const { data, loading } = useApiResource<ConnectionsPayload>('/connections', { initialData });
  const connections = data?.connections || [];

  if (loading) {
    return <ConnectionsSkeleton />;
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6 p-2">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Track Applications</h1>
          <p className="text-xs text-slate-500">Monitor live status and timeline of electricity connection requests</p>
        </div>
        <PrefetchLink
          href="/connections/apply"
          className="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs py-2.5 px-4 rounded-xl shadow transition"
        >
          <FilePlus className="w-4 h-4" />
          <span>New Application</span>
        </PrefetchLink>
      </div>

      {connections.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4 shadow-sm">
          <FolderOpen className="w-12 h-12 text-slate-400 mx-auto" />
          <h2 className="text-lg font-bold text-slate-800">No Connection Requests</h2>
          <p className="text-xs text-slate-500 max-w-md mx-auto">You have not submitted any new electricity connection requests yet.</p>
          <PrefetchLink
            href="/connections/apply"
            className="inline-block bg-slate-900 text-white font-semibold text-xs py-2.5 px-5 rounded-xl hover:bg-slate-800 transition"
          >
            Apply for Connection
          </PrefetchLink>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {connections.map((conn) => (
            <div key={conn.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-slate-900">{conn.applicationNumber}</span>
                  <StatusChip status={conn.status} />
                </div>
                <p className="text-xs text-slate-500">
                  {conn.connectionType} Connection • Required Load: {conn.requiredLoad} kW
                </p>
                <p className="text-xs text-slate-400">Address: {conn.propertyAddress}</p>
              </div>

              <div className="flex items-center gap-4 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                <div className="text-right text-xs text-slate-400 hidden sm:block">
                  <p>Last updated</p>
                  <p className="font-semibold text-slate-600">{new Date(conn.updatedAt).toLocaleDateString()}</p>
                </div>
                <PrefetchLink
                  href={`/connections/${conn.id}`}
                  dataUrls={[`/connections/${conn.id}/detail`]}
                  className="inline-flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded-xl transition"
                >
                  <span>Track Application</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </PrefetchLink>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

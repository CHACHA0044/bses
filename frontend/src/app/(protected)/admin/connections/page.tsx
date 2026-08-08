'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useApiResource } from '@/hooks/useApiResource';
import { TableSkeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import { PrefetchLink } from '@/components/ui/PrefetchLink';
import { StatusChip } from '@/components/ui/Badge';
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react';
import type { AdminConnectionListItem, ConnectionStatus } from '@/types/workflow';
import { cn } from '@/lib/utils';

const STATUS_FILTERS: { label: string; value: ConnectionStatus | '' }[] = [
  { label: 'All', value: '' },
  { label: 'Submitted', value: 'SUBMITTED' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Verification', value: 'UNDER_VERIFICATION' },
  { label: 'Docs Pending', value: 'DOCUMENTS_PENDING' },
  { label: 'Ready to Approve', value: 'VERIFICATION_COMPLETE' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Scheduled', value: 'CONNECTION_SCHEDULED' },
  { label: 'Completed', value: 'CONNECTION_COMPLETED' },
  { label: 'Rejected', value: 'REJECTED' },
];

interface ListResponse {
  requests: AdminConnectionListItem[];
  total: number;
  page: number;
  totalPages: number;
}

export default function AdminConnectionsPage() {
  const [status, setStatus] = useState<ConnectionStatus | ''>('');
  const [page, setPage] = useState(1);

  const query = new URLSearchParams();
  if (status) query.set('status', status);
  query.set('page', String(page));

  // Default state matches the idle-prefetch URL so navigation is instant.
  const url =
    status || page > 1 ? `/admin/connection-requests?${query.toString()}` : '/admin/connection-requests';
  const { data, loading, isValidating } = useApiResource<ListResponse>(url);
  const requests = data?.requests ?? [];
  const totalPages = data?.totalPages ?? 1;

  const changeFilter = (value: ConnectionStatus | ''): void => {
    setStatus(value);
    setPage(1);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 p-2">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Electricity Connection Applications</h1>
          <p className="text-xs text-slate-500">
            {data ? `${data.total} application(s)` : 'Manage'} · every change routes through the workflow engine
          </p>
        </div>
        <div className="text-xs font-semibold text-slate-400">
          Page {page} of {Math.max(totalPages, 1)}
        </div>
      </div>

      {/* Status filter */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            onClick={() => changeFilter(f.value)}
            className={cn(
              'px-3 py-1.5 rounded-full border text-xs font-bold transition',
              status === f.value
                ? 'bg-slate-900 text-amber-400 border-slate-900 shadow'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400',
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
                <tr>
                  <th className="p-3">App No.</th>
                  <th className="p-3">Consumer</th>
                  <th className="p-3">Type / Load</th>
                  <th className="p-3">Assigned Officer</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Updated</th>
                  <th className="p-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {requests.map((r) => {
                  const assignee = (r.assignments ?? []).find((a) => a.status === 'ACTIVE');
                  return (
                    <tr key={r.id} className="hover:bg-slate-50 transition">
                      <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">{r.applicationNumber}</td>
                      <td className="p-3 whitespace-nowrap">
                        <p className="font-semibold text-slate-800">
                          {r.user?.firstName} {r.user?.lastName}
                        </p>
                        <p className="text-[11px] text-slate-400">{r.user?.email}</p>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <p className="capitalize">{String(r.connectionType).toLowerCase()}</p>
                        <p className="text-[11px] text-slate-400">{r.requiredLoad} kW</p>
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        {assignee ? (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                            {assignee.assignedToName}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <StatusChip status={r.status} />
                      </td>
                      <td className="p-3 text-xs text-slate-400 whitespace-nowrap">
                        {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="p-3 whitespace-nowrap">
                        <PrefetchLink
                          href={`/admin/connections/${r.id}`}
                          dataUrls={[`/admin/connection-requests/${r.id}`]}
                          className="inline-flex items-center gap-1.5 bg-slate-100 border border-slate-200 hover:bg-slate-200 active:bg-slate-300 shadow-sm hover:shadow-md text-slate-900 font-semibold px-3 py-1.5 text-xs rounded-lg transition"
                        >
                          Manage
                        </PrefetchLink>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {requests.length === 0 && (
              <div className="p-12 text-center space-y-2">
                <Inbox className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-700">No applications found</p>
                <p className="text-xs text-slate-400">Try a different status filter.</p>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<ChevronLeft className="w-4 h-4" />}
                disabled={page <= 1 || isValidating}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs font-semibold text-slate-500">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                rightIcon={<ChevronRight className="w-4 h-4" />}
                disabled={page >= totalPages || isValidating}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import React from 'react';
import { UserCheck, History, ShieldAlert } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { Assignment } from '@/types/workflow';

const ASSIGNMENT_STATUS_STYLES: Record<string, { chip: string; dot: string }> = {
  ACTIVE: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  REPLACED: { chip: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500' },
  CLOSED: { chip: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
};

const ROLE_STYLES: Record<string, string> = {
  SUPER_ADMIN: 'bg-slate-900 text-amber-400',
  ADMIN: 'bg-slate-100 text-slate-700',
};

export interface AssignmentHistoryProps {
  assignments: Assignment[];
  className?: string;
}

/** History of officer assignments (and reassignments) for an application. */
export const AssignmentHistory: React.FC<AssignmentHistoryProps> = ({ assignments, className = '' }) => {
  if (assignments.length === 0) {
    return (
      <div className={cn('bg-slate-50 rounded-xl p-6 text-center', className)}>
        <UserCheck className="w-6 h-6 text-slate-400 mx-auto mb-1" />
        <p className="text-xs font-semibold text-slate-500">No officers assigned yet</p>
      </div>
    );
  }

  const active = assignments.find((a) => a.status === 'ACTIVE');

  return (
    <div className={cn('space-y-3', className)}>
      {active && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <UserCheck className="w-5 h-5 text-emerald-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-emerald-800">
              Currently assigned to: <span className="font-black">{active.assignedToName}</span>
            </p>
            <p className="text-[11px] text-emerald-700">
              Assigned by {active.assignedByName} on {formatDateTime(active.assignedAt)}
            </p>
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {assignments.map((a) => {
          const status = ASSIGNMENT_STATUS_STYLES[a.status] ?? ASSIGNMENT_STATUS_STYLES.CLOSED;
          return (
            <li key={a.id} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <History className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-bold text-slate-900 truncate">{a.assignedToName}</span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-full text-[10px] font-bold uppercase',
                      ROLE_STYLES[a.assignedToRole] ?? 'bg-slate-100 text-slate-700',
                    )}
                  >
                    {a.assignedToRole}
                  </span>
                </div>
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase',
                    status.chip,
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
                  {a.status}
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Assigned by <span className="font-semibold text-slate-700">{a.assignedByName}</span> ·{' '}
                {formatDateTime(a.assignedAt)}
                {a.releasedAt && (
                  <>
                    {' '}
                    · Released {formatDateTime(a.releasedAt)}
                  </>
                )}
              </p>
              {a.notes && (
                <p className="flex items-start gap-1.5 text-xs text-slate-600">
                  <ShieldAlert className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                  {a.notes}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

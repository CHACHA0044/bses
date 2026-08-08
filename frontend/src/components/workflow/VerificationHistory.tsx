'use client';

import React from 'react';
import { FileCheck2, FileX2, FileWarning, FolderSearch } from 'lucide-react';
import { formatDateTime } from '@/lib/utils';
import { cn } from '@/lib/utils';
import type { DocumentRecord, VerificationRecord, VerificationResult } from '@/types/workflow';

const VERDICT_STYLES: Record<VerificationResult | string, { chip: string; dot: string }> = {
  APPROVED: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', dot: 'bg-emerald-500' },
  REJECTED: { chip: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
  REQUESTED: { chip: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500' },
};

const VERDICT_ICONS: Record<VerificationResult | string, React.ComponentType<{ className?: string }>> = {
  APPROVED: FileCheck2,
  REJECTED: FileX2,
  REQUESTED: FileWarning,
};

export interface VerificationHistoryProps {
  verifications: VerificationRecord[];
  /** Documents map so history rows can show the human-readable file name. */
  documents?: DocumentRecord[];
  className?: string;
}

/** Per-document verification trail (approve / reject / request re-upload). */
export const VerificationHistory: React.FC<VerificationHistoryProps> = ({
  verifications,
  documents = [],
  className = '',
}) => {
  if (verifications.length === 0) {
    return (
      <div className={cn('bg-slate-50 rounded-xl p-6 text-center', className)}>
        <FolderSearch className="w-6 h-6 text-slate-400 mx-auto mb-1" />
        <p className="text-xs font-semibold text-slate-500">No document verifications recorded yet</p>
      </div>
    );
  }

  const nameFor = (documentId: string): string =>
    documents.find((d) => d.id === documentId)?.documentName ?? documentId;

  return (
    <ul className={cn('space-y-2', className)}>
      {verifications.map((v) => {
        const style = VERDICT_STYLES[v.action] ?? VERDICT_STYLES.REQUESTED;
        const Icon = VERDICT_ICONS[v.action] ?? FileWarning;
        return (
          <li key={v.id} className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-sm space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Icon className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="text-sm font-bold text-slate-900 truncate">{nameFor(v.documentId)}</span>
              </div>
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-bold uppercase',
                  style.chip,
                )}
              >
                <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
                {v.action}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {v.performedByRole} · <span className="font-semibold text-slate-700">{v.performedByName}</span> ·{' '}
              {formatDateTime(v.createdAt)}
            </p>
            {v.comment && <p className="text-xs text-slate-600">{v.comment}</p>}
          </li>
        );
      })}
    </ul>
  );
};

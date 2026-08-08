import React from 'react';

export interface StatusChipProps {
  status: string;
  className?: string;
  showDot?: boolean;
}

export const StatusChip: React.FC<StatusChipProps> = ({ status, className = '', showDot = true }) => {
  const statusMap: Record<string, { bg: string; text: string; dot: string; label: string }> = {
    APPROVED: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'APPROVED' },
    CONNECTION_COMPLETED: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'METER INSTALLED' },
    REJECTED: { bg: 'bg-red-50 border-red-200', text: 'text-red-800', dot: 'bg-red-500', label: 'REJECTED' },
    SUBMITTED: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500', label: 'SUBMITTED' },
    ASSIGNED: { bg: 'bg-violet-50 border-violet-200', text: 'text-violet-800', dot: 'bg-violet-500', label: 'ASSIGNED' },
    UNDER_VERIFICATION: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-800', dot: 'bg-blue-500', label: 'UNDER VERIFICATION' },
    DOCUMENTS_PENDING: { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-800', dot: 'bg-orange-500', label: 'DOCS REQUIRED' },
    VERIFICATION_COMPLETE: { bg: 'bg-teal-50 border-teal-200', text: 'text-teal-800', dot: 'bg-teal-500', label: 'VERIFICATION DONE' },
    CONNECTION_SCHEDULED: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-800', dot: 'bg-sky-500', label: 'INSTALLATION SCHEDULED' },
    DRAFT: { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-700', dot: 'bg-slate-400', label: 'DRAFT' },
    ACTIVE: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'ACTIVE' },
    INACTIVE: { bg: 'bg-slate-100 border-slate-200', text: 'text-slate-600', dot: 'bg-slate-400', label: 'INACTIVE' },
    PENDING: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500', label: 'PENDING' },
    VERIFIED: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'VERIFIED' },
  };

  const config = statusMap[status.toUpperCase()] || {
    bg: 'bg-slate-100 border-slate-200',
    text: 'text-slate-700',
    dot: 'bg-slate-400',
    label: status,
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-bold tracking-wide uppercase shadow-2xs ${config.bg} ${config.text} ${className}`}
    >
      {showDot && <span className={`h-1.5 w-1.5 rounded-full ${config.dot} animate-pulse`} />}
      <span>{config.label}</span>
    </span>
  );
};

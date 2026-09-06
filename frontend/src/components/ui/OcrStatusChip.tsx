import React from 'react';
import type { OcrStatus } from '@/types/workflow';

const OCR_CONFIG: Record<OcrStatus, { bg: string; text: string; dot: string; label: string }> = {
  PENDING: { bg: 'bg-slate-50 border-slate-300', text: 'text-slate-600', dot: 'bg-slate-400', label: 'OCR QUEUED' },
  PROCESSING: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500', label: 'OCR PROCESSING' },
  EXTRACTED: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'OCR READY' },
  PARTIAL: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-800', dot: 'bg-sky-500', label: 'PARTIAL EXTRACT' },
  NEEDS_REVIEW: { bg: 'bg-amber-50 border-amber-300', text: 'text-amber-900', dot: 'bg-amber-600', label: 'VERIFY REQUIRED' },
  UNREADABLE: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-800', dot: 'bg-rose-500', label: 'OCR UNREADABLE' },
  FAILED: { bg: 'bg-rose-50 border-rose-300', text: 'text-rose-900', dot: 'bg-rose-600', label: 'OCR FAILED' },
};

const ACTIVE_OCR_STATUSES: ReadonlySet<OcrStatus> = new Set(['PENDING', 'PROCESSING']);

export interface OcrStatusChipProps {
  status?: OcrStatus | null;
  className?: string;
}

export const OcrStatusChip: React.FC<OcrStatusChipProps> = ({ status, className = '' }) => {
  if (!status) return null;
  const config = OCR_CONFIG[status];
  if (!config) return null;

  const animating = ACTIVE_OCR_STATUSES.has(status);

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold tracking-wide uppercase ${config.bg} ${config.text} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${animating ? 'animate-pulse' : ''}`} />
      <span>{config.label}</span>
    </span>
  );
};
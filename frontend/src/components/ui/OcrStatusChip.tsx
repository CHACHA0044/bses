import React from 'react';
import type { OcrStatus } from '@/types/workflow';

const OCR_CONFIG: Record<OcrStatus, { bg: string; text: string; dot: string; label: string }> = {
  EXTRACTED: { bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-800', dot: 'bg-emerald-500', label: 'OCR READY' },
  PROCESSING: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', dot: 'bg-amber-500', label: 'OCR PROCESSING' },
  UNREADABLE: { bg: 'bg-rose-50 border-rose-200', text: 'text-rose-800', dot: 'bg-rose-500', label: 'OCR UNREADABLE' },
  NEEDS_REVIEW: { bg: 'bg-amber-50 border-amber-300', text: 'text-amber-900', dot: 'bg-amber-600', label: 'VERIFY REQUIRED' },
};

export interface OcrStatusChipProps {
  status?: OcrStatus | null;
  className?: string;
}

export const OcrStatusChip: React.FC<OcrStatusChipProps> = ({ status, className = '' }) => {
  if (!status) return null;
  const config = OCR_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-bold tracking-wide uppercase ${config.bg} ${config.text} ${className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} ${status === 'PROCESSING' ? 'animate-pulse' : ''}`} />
      <span>{config.label}</span>
    </span>
  );
};

import React from 'react';
import { AlertCircle } from 'lucide-react';

/* ── FormField ─────────────────────────────────────────────────── */
export interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export const FormField: React.FC<FormFieldProps> = ({
  label,
  htmlFor,
  error,
  required,
  hint,
  children,
  className = '',
}) => (
  <div className={`flex flex-col gap-1.5 ${className}`}>
    <label
      htmlFor={htmlFor}
      className="text-xs font-bold uppercase tracking-wider text-slate-600"
    >
      {label}
      {required && <span className="ml-0.5 text-error-DEFAULT">*</span>}
    </label>
    {children}
    {hint && !error && (
      <p className="text-[11px] text-slate-400">{hint}</p>
    )}
    {error && <ErrorMessage message={error} />}
  </div>
);

/* ── ErrorMessage ──────────────────────────────────────────────── */
export interface ErrorMessageProps {
  message: string;
  className?: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, className = '' }) => (
  <p className={`flex items-center gap-1.5 text-[11px] font-medium text-error ${className}`} role="alert">
    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
    <span>{message}</span>
  </p>
);

/* ── FieldInput ────────────────────────────────────────────────── */
export const fieldInputClass = (hasError?: boolean) =>
  [
    'w-full rounded-xl border px-3.5 py-2.5 text-sm text-slate-900',
    'placeholder:text-slate-400 bg-white/80',
    'transition-all duration-150',
    'focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary',
    hasError
      ? 'border-error focus:ring-error/30 focus:border-error'
      : 'border-slate-300 hover:border-slate-400',
  ].join(' ');

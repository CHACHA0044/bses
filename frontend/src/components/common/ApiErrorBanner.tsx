'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ApiErrorBannerProps {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  /** True while a retry request is in flight — disables the button + shows "Retrying...". */
  retrying?: boolean;
}

/** Extracts a human-readable message from an unknown error object. */
function extractMessage(err: unknown): string {
  if (!err) return 'An unknown error occurred.';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  // Axios error shape
  const axiosErr = err as {
    response?: { data?: { error?: { message?: string } } };
    message?: string;
  };
  if (axiosErr.response?.data?.error?.message) return axiosErr.response.data.error.message;
  if (typeof axiosErr.message === 'string') return axiosErr.message;
  return 'An unexpected error occurred.';
}

/**
 * ApiErrorBanner — shows a user-friendly error banner with retry option.
 * Handles 502/503/504 (upstream proxy errors), 401 (auth), 500 (server), etc.
 * Does NOT catch 400 client errors — those are shown via field-level validation.
 */
export function ApiErrorBanner({ error, onRetry, title, retrying = false }: ApiErrorBannerProps) {
  if (!error) return null;

  const message = extractMessage(error);
  const isRetryable = onRetry !== undefined;
  // Use a boolean guard so TS doesn't complain about `unknown` in JSX
  const showRetry: boolean = isRetryable;
  void showRetry;

  // Determine the likely cause from the error message for better UX
  const isUpstreamError =
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('upstream') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('network');

  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-red-700">{title ?? 'Failed to load data'}</p>
          <p className="text-xs text-red-600 mt-1">{message}</p>
          {isUpstreamError && (
            <p className="text-xs text-red-500 mt-1">
              The backend service may be starting up. If the problem persists, the server may be
              temporarily unavailable.
            </p>
          )}
        </div>
      </div>
      {isRetryable && (
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={retrying}
            isLoading={retrying}
            loadingLabel="Retrying..."
            className="border-red-300 text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}

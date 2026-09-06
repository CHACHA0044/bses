'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/Button';

/**
 * Admin section error boundary — catches errors thrown anywhere in the admin
 * subtree (page.tsx, sub-routes, child components). This is where
 * ChunkLoaderError and similar stale-deployment errors get a chance to render
 * a useful UI instead of an infinite spinner.
 *
 * We do NOT auto-reload on ChunkLoaderError here — that would create an
 * infinite reload loop on flaky connections. We expose a single Reload button
 * so the user is always in control.
 */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error to console so it's visible in browser devtools.
    // eslint-disable-next-line no-console
    console.error('[ADMIN_ERROR]', error);
  }, [error]);

  const isChunkError =
    error.message?.includes('Loading chunk') ||
    error.message?.includes('ChunkLoaderError') ||
    error.name === 'ChunkLoadError';
  const isNetworkError =
    error.message?.includes('Failed to fetch') || error.message?.includes('NetworkError');

  return (
    <div className="max-w-2xl mx-auto p-4 sm:p-6">
      <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6 sm:p-8 space-y-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {isChunkError
                ? 'A new version is being deployed'
                : isNetworkError
                  ? 'Network error'
                  : 'Something went wrong'}
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1.5 leading-relaxed">
              {isChunkError
                ? 'The page was loading code from a previous deployment that is no longer available. A reload will fetch the latest version.'
                : isNetworkError
                  ? 'We could not reach the server. Please check your internet connection and try again.'
                  : 'An unexpected error occurred while loading this page. Please try again.'}
            </p>
            {error.digest && (
              <p className="text-[10px] text-slate-400 mt-2 font-mono">Error ID: {error.digest}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={reset} variant="primary" size="sm">
            <RefreshCw className="w-3.5 h-3.5" />
            Try Again
          </Button>
          <Button
            onClick={() => {
              // Full reload for ChunkLoaderError so the browser fetches the
              // latest chunk manifest. window.location.reload() is intentional
              // here — Next's soft reset is not enough for chunk mismatches.
              window.location.reload();
            }}
            variant="outline"
            size="sm"
          >
            Reload Page
          </Button>
          <Link href="/admin/dashboard">
            <Button variant="ghost" size="sm">
              <Home className="w-3.5 h-3.5" />
              Go to Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled Application Error:', error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
      <div className="rounded-full bg-red-100 p-4 text-bses-red mb-4">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <h2 className="text-2xl font-bold text-slate-800">Something went wrong</h2>
      <p className="mt-2 text-sm text-slate-500 max-w-md">
        An unhandled system error occurred. Our engineering logs have captured this incident.
      </p>
      <button
        onClick={() => reset()}
        className="mt-6 inline-flex items-center gap-2 rounded-lg bg-bses-navy px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 transition-colors shadow-sm"
      >
        <RefreshCw className="h-4 w-4" />
        Reload Application
      </button>
    </div>
  );
}

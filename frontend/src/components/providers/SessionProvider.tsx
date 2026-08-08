'use client';

import React, { useEffect } from 'react';
import { useAuthStore } from '@/store/authStore';

/**
 * SessionProvider — boots once per client page-load.
 *
 * Calls checkSession() exactly once so the auth store is hydrated from the
 * auth-service before any guarded page/AuthGuard makes a routing decision.
 * Without this, a hard refresh on a protected page left `isLoading` stuck at
 * `true` and the nav bar showing the logged-out state.
 */
export const SessionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const checkSession = useAuthStore((s) => s.checkSession);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  return <>{children}</>;
};

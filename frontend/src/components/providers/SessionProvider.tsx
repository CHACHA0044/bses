'use client';

import React, { useEffect } from 'react';
import { getInitialUser, useAuthStore } from '@/store/authStore';
import { warmPostLogin } from '@/lib/prefetch';
import type { ServerSession } from '@/lib/sessionTypes';

/**
 * SessionProvider — boots the auth store once per client page-load.
 *
 * Normally it calls checkSession() so the store is hydrated from the
 * auth-service before any guarded page/AuthGuard makes a routing decision.
 * Without this, a hard refresh on a protected page left `isLoading` stuck at
 * `true` and the nav bar showing the logged-out state.
 *
 * When the server has already resolved the session (RSC `getServerSession()`),
 * the resolved session is passed in via `initialSession` and the store is
 * seeded synchronously on mount — zero network round-trip for the session, so
 * the AuthGuard, Navbar and Sidebar render the correct state immediately.
 *
 * `unknown` (cookies present but the server could not validate) is deliberately
 * NOT seeded: the client must resolve it via checkSession() so the single-flight
 * refresh interceptor can silently recover an expired access token.
 */
export const SessionProvider: React.FC<{
  children: React.ReactNode;
  initialSession?: ServerSession;
}> = ({ children, initialSession }) => {
  const checkSession = useAuthStore((s) => s.checkSession);
  const setUser = useAuthStore((s) => s.setUser);

  useEffect(() => {
    if (initialSession?.status === 'authenticated') {
      setUser(initialSession.user);
      warmPostLogin(initialSession.user.role);
      return;
    }
    if (initialSession?.status === 'unauthenticated') {
      setUser(null);
      return;
    }
    // Unknown session (or no prop) — restore any locally cached session first
    // (fast path, so the nav never flashes), then verify it against the auth
    // service. Restoring in an effect keeps SSR and the first client render
    // identical (both show the loading state), avoiding hydration mismatches.
    const cached = getInitialUser();
    if (cached) setUser(cached);
    checkSession();
  }, [initialSession, checkSession, setUser]);

  return <>{children}</>;
};

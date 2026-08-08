'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { usePrefetch } from '@/hooks/usePrefetch';
import { cancelIdle, getPrefetchTargets, isVerySlowConnection, scheduleIdle } from '@/lib/prefetch';

/** Window of quiet time required after the last interaction before warming runs. */
const INTERACTION_QUIET_WINDOW_MS = 2000;

/**
 * PrefetchProvider — intelligent background page preparation.
 *
 * Mounted once inside the (protected) layout. It only acts while the user is
 * on the dashboard (the origin of the common navigation flow) and runs the
 * role-prioritized warming batch during browser idle time, ~1s after render
 * so the dashboard paints and settles first.
 *
 * Guarantees:
 *  - Never blocks the current page: work starts only via requestIdleCallback
 *    (with a hard fallback timeout so it still runs under load).
 *  - Auto-cancels on navigation (effect cleanup) and on active interaction
 *    (pointerdown / keydown / wheel / touchstart).
 *  - Opts out entirely on very slow connections.
 *  - Idempotent: routes and payloads are deduplicated, and already-cached data
 *    is never re-requested.
 */
export const PrefetchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const role = useAuthStore((s) => s.user?.role);
  const pathname = usePathname();
  const { prefetchRoute } = usePrefetch();

  const isDashboard = pathname === '/dashboard' || pathname === '/admin/dashboard';
  const scheduledRef = useRef<ReturnType<typeof scheduleIdle> | null>(null);
  const lastInteractionRef = useRef(0);

  useEffect(() => {
    if (!isDashboard || isVerySlowConnection()) return;

    const targets = getPrefetchTargets(role);

    scheduledRef.current = scheduleIdle(
      () => {
        scheduledRef.current = null;
        if (Date.now() - lastInteractionRef.current < INTERACTION_QUIET_WINDOW_MS) return;
        for (const target of targets) {
          prefetchRoute(target.href, target.dataUrls ?? []);
        }
      },
      /* fallback timeout (ms): run even under sustained load */
      2500,
    );

    return () => {
      if (scheduledRef.current !== null) {
        cancelIdle(scheduledRef.current);
        scheduledRef.current = null;
      }
    };
  }, [isDashboard, role, prefetchRoute]);

  useEffect(() => {
    if (!isDashboard) return;

    const onInteract = () => {
      lastInteractionRef.current = Date.now();
      if (scheduledRef.current !== null) {
        cancelIdle(scheduledRef.current);
        scheduledRef.current = null;
      }
    };

    window.addEventListener('pointerdown', onInteract, { passive: true });
    window.addEventListener('keydown', onInteract, { passive: true });
    window.addEventListener('wheel', onInteract, { passive: true });
    window.addEventListener('touchstart', onInteract, { passive: true });

    return () => {
      window.removeEventListener('pointerdown', onInteract);
      window.removeEventListener('keydown', onInteract);
      window.removeEventListener('wheel', onInteract);
      window.removeEventListener('touchstart', onInteract);
    };
  }, [isDashboard]);

  return <>{children}</>;
};

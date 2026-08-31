'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { usePrefetch } from '@/hooks/usePrefetch';
import { cancelIdle, getPrefetchTargets, isVerySlowConnection, scheduleIdle } from '@/lib/prefetch';

/** Window of quiet time required after the last interaction before warming runs. */
const INTERACTION_QUIET_WINDOW_MS = 300;

/**
 * PrefetchProvider — intelligent background page preparation.
 *
 * Mounted once inside the (protected) layout. It acts while the user is on any
 * protected route: dashboards warm the full role-prioritized batch, while
 * other pages warm only the top-weighted sibling destinations. Work runs
 * during browser idle time, ~1s after render so the current page settles first.
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
  // Activate warming on ANY protected route, not just dashboards — otherwise
  // every non-dashboard navigation is cold (and in dev, where router.prefetch
  // is a no-op, visibly slow). Dashboards get the full role-prioritized batch;
  // other pages warm only the top-weighted sibling destinations.
  const targets = getPrefetchTargets(role);
  const isProtectedRoute = targets.some((t) => t.href === pathname);
  const shouldRun = isDashboard || isProtectedRoute;
  const scheduledRef = useRef<ReturnType<typeof scheduleIdle> | null>(null);
  const lastInteractionRef = useRef(0);

  useEffect(() => {
    if (!shouldRun || isVerySlowConnection()) return;

    const targets = getPrefetchTargets(role);
    // Dynamic [id] routes can't be warmed by literal path, and the current
    // page is already loaded — skip both.
    const candidates = targets.filter((t) => !t.href.includes('[') && t.href !== pathname);
    const batch = isDashboard ? candidates : candidates.slice(0, 3);

    scheduledRef.current = scheduleIdle(
      () => {
        scheduledRef.current = null;
        if (Date.now() - lastInteractionRef.current < INTERACTION_QUIET_WINDOW_MS) return;
        for (const target of batch) {
          prefetchRoute(target.href, target.dataUrls ?? []);
        }
      },
      /* fallback timeout (ms): run promptly to warm next routes */
      400,
    );

    return () => {
      if (scheduledRef.current !== null) {
        cancelIdle(scheduledRef.current);
        scheduledRef.current = null;
      }
    };
  }, [shouldRun, isDashboard, role, pathname, prefetchRoute]);

  useEffect(() => {
    if (!shouldRun) return;

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
  }, [shouldRun]);

  return <>{children}</>;
};

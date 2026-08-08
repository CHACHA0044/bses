'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { prefetchApiResource } from '@/hooks/useApiResource';
import { shouldWarmData } from '@/lib/prefetch';

/**
 * Routes whose JS/RSC chunks have already been requested this session.
 * Next.js router.prefetch is idempotent, but a Set keeps us from even
 * re-calling it (cheap insurance, shared across provider + link instances).
 */
const warmedRoutes = new Set<string>();

/**
 * usePrefetch — stable helpers that warm destination pages without ever
 * mounting them:
 *
 *  - route chunks via Next.js router.prefetch (on-demand downloads, but in
 *    App Router these are preloaded in the background and interruptible),
 *  - the exact payloads the destination pages read on mount, written into the
 *    shared useApiResource cache via prefetchApiResource().
 *
 * Both are deduplicated, so hover-prefetching a link the idle scheduler
 * already warmed costs nothing.
 */
export function usePrefetch() {
  const router = useRouter();

  const prefetchRoute = useCallback(
    (href: string, dataUrls: string[] = []) => {
      if (!href || warmedRoutes.has(href)) return;

      // Opt out of route warming entirely on the heaviest connections.
      if (typeof navigator !== 'undefined' && shouldSkipRouteWarm()) return;

      warmedRoutes.add(href);
      router.prefetch(href);

      // Lightweight payload warming — only on connections that can afford it.
      if (shouldWarmData()) {
        for (const url of dataUrls) {
          prefetchApiResource(url);
        }
      }
    },
    [router],
  );

  return { prefetchRoute };
}

/** Keep the eligibility helper out of the component hot path. */
function shouldSkipRouteWarm(): boolean {
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  if (nav.connection?.saveData) return true;
  return nav.connection?.effectiveType === 'slow-2g';
}

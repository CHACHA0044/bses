import { prefetchApiResource } from '@/hooks/useApiResource';

/**
 * lib/prefetch — shared helpers for intelligent background page preparation.
 *
 * Two kinds of "preparation" happen:
 *  1. Route warming  — Next.js `router.prefetch()` downloads the JS/RSC chunks
 *     a destination route needs, so clicking its link mounts the page with no
 *     chunk-fetch delay.
 *  2. Data warming   — `prefetchApiResource()` fills the shared SWR cache the
 *     destination page reads on mount, so it renders with data immediately and
 *     (while fresh) issues zero network requests.
 *
 * Both helpers are idempotent and deduplicated, so calling them repeatedly
 * from idle scheduling AND from link hover costs nothing extra.
 */

/* ── Connection awareness ───────────────────────────────────────── */
export type EffectiveConnection = 'slow-2g' | '2g' | '3g' | '4g' | 'unknown';

/** Reads the (non-standard) Network Information API if the browser exposes it. */
function getNetworkInfo(): {
  effectiveType?: EffectiveConnection;
  saveData?: boolean;
  downlink?: number;
} | null {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as Navigator & {
    connection?: { effectiveType?: string; saveData?: boolean; downlink?: number };
  };
  const conn = nav.connection;
  if (!conn) return null;
  return {
    effectiveType: conn.effectiveType as EffectiveConnection | undefined,
    saveData: conn.saveData,
    downlink: conn.downlink,
  };
}

/** True on constrained connections — background data warming is skipped. */
export function isSlowConnection(): boolean {
  const info = getNetworkInfo();
  if (!info) return false;
  if (info.saveData) return true;
  return info.effectiveType === 'slow-2g' || info.effectiveType === '2g';
}

/**
 * True when the connection is slow enough that even prefetching JS chunks is
 * wasteful (the user is likely on metered/slow networks). Route warming is
 * still allowed on 3g; only the heaviest connections opt out entirely.
 */
export function isVerySlowConnection(): boolean {
  const info = getNetworkInfo();
  if (!info) return false;
  return info.effectiveType === 'slow-2g';
}

/** Respects the user's "reduced data" OS setting. */
export function prefersReducedData(): boolean {
  if (typeof navigator === 'undefined') return false;
  return (
    (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true
  );
}

/** Should we warm lightweight data payloads right now? */
export function shouldWarmData(): boolean {
  return !isSlowConnection() && !prefersReducedData();
}

/* ── Prefetch targets ───────────────────────────────────────────── */
export interface PrefetchTarget {
  /** Route to warm (Next.js router.prefetch). */
  href: string;
  /** 0-100 priority; higher = warmed first. */
  weight: number;
  /** Lightweight API payloads the destination page reads on mount. */
  dataUrls?: string[];
}

/**
 * Role-based priority lists, ordered by the most common navigation flow from
 * each dashboard. Only lightweight payloads are warmed — no bulk exports,
 * no unbounded lists.
 */
export const CONSUMER_PREFETCH_TARGETS: PrefetchTarget[] = [
  { href: '/connections/apply', weight: 100 },
  { href: '/profile', weight: 90, dataUrls: ['/users/profile'] },
  { href: '/profile/edit', weight: 85, dataUrls: ['/users/profile'] },
  { href: '/connections', weight: 80, dataUrls: ['/connections'] },
  { href: '/settings', weight: 50 },
  { href: '/help-center', weight: 40 },
];

export const ADMIN_PREFETCH_TARGETS: PrefetchTarget[] = [
  { href: '/admin/users', weight: 100, dataUrls: ['/admin/users?search='] },
  { href: '/admin/connections', weight: 90, dataUrls: ['/admin/connection-requests'] },
  { href: '/admin/dashboard', weight: 85, dataUrls: ['/admin/dashboard'] },
  { href: '/settings', weight: 50 },
  { href: '/help-center', weight: 40 },
];

/** Route to the role-appropriate target list (falls back to consumer). */
export function getPrefetchTargets(role?: string): PrefetchTarget[] {
  return role === 'ADMIN' || role === 'SUPER_ADMIN'
    ? ADMIN_PREFETCH_TARGETS
    : CONSUMER_PREFETCH_TARGETS;
}

/**
 * warmPostLogin — kick off the landing payloads the moment authentication
 * succeeds, BEFORE navigation starts. The destination page then reads them
 * from the shared cache on mount (or piggybacks the in-flight request) instead
 * of issuing its own round-trip, so the dashboard renders with data together
 * with the auth-derived navbar instead of popping in later.
 */
export function warmPostLogin(role?: string): void {
  if (!role) return;
  if (!shouldWarmData()) return;

  const isAdmin = role === 'ADMIN' || role === 'SUPER_ADMIN';
  const urls = isAdmin
    ? ['/admin/dashboard', '/admin/connection-requests', '/admin/users?search=']
    : ['/users/dashboard', '/connections', '/users/profile'];

  for (const url of urls) {
    prefetchApiResource(url);
  }
}

/* ── Idle scheduling helper ─────────────────────────────────────── */
type IdleCallback = () => void;
type IdleHandle = number | ReturnType<typeof setTimeout>;

/**
 * requestIdleCallback with a setTimeout fallback (older browsers / jsdom).
 * `timeout` bounds how long the task may wait before it runs anyway.
 */
export function scheduleIdle(fn: IdleCallback, timeoutMs = 2500): IdleHandle {
  if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
    const win = window as Window & {
      requestIdleCallback?: (cb: IdleRequestCallback, opts?: { timeout?: number }) => number;
    };
    if (win.requestIdleCallback) {
      return win.requestIdleCallback(fn, { timeout: timeoutMs });
    }
  }
  return setTimeout(fn, timeoutMs);
}

export function cancelIdle(handle: IdleHandle): void {
  if (typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
    const win = window as Window & {
      cancelIdleCallback?: (handle: number) => void;
    };
    if (win.cancelIdleCallback && typeof handle === 'number') {
      win.cancelIdleCallback(handle);
      return;
    }
  }
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

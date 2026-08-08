import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/apiClient';

/**
 * useApiResource — lightweight stale-while-revalidate data hook.
 *
 * - In-memory module-level cache shared across pages (survives route changes,
 *   resets on a full page reload — exactly what we want for an SPA feel).
 * - Concurrent hooks fetching the same URL share one in-flight promise
 *   (deduplication — no duplicated API calls when navigating around).
 * - Stale data is shown instantly on return visits while a background
 *   revalidate refreshes it (stale-while-revalidate).
 *
 * Returns the resolved `data.data` payload of the gateway response.
 */

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  inFlight: Promise<unknown> | null;
}

const cache = new Map<string, CacheEntry>();

/**
 * Last-attempt timestamps for prefetch warming. Prevents re-issuing a request
 * for a URL that already failed (or was abandoned) — avoids hammering the
 * API from idle background preparation.
 */
const prefetchAttemptedAt = new Map<string, number>();

interface UseApiResourceOptions {
  /** Set false to skip fetching entirely (e.g. missing route param). */
  enabled?: boolean;
  /** Fresh window before a background revalidate is triggered (ms). */
  staleMs?: number;
}

export interface ApiResourceResult<T> {
  data: T | undefined;
  error: unknown;
  /** True while there is no data at all (first load). */
  loading: boolean;
  /** True during any network request (including background revalidates). */
  isValidating: boolean;
  revalidate: () => Promise<void>;
}

export function useApiResource<T = any>(
  url: string | null | undefined,
  options: UseApiResourceOptions = {},
): ApiResourceResult<T> {
  const { enabled = true, staleMs = 30_000 } = options;

  const [data, setData] = useState<T | undefined>(() => {
    if (!url) return undefined;
    const hit = cache.get(url);
    return hit ? (hit.data as T) : undefined;
  });
  const [error, setError] = useState<unknown>(null);
  const [isValidating, setIsValidating] = useState(false);

  const load = useCallback(
    async (targetUrl: string, mode: 'swr' | 'force') => {
      const existing = cache.get(targetUrl);

      // Dedupe: an identical request is already in flight — piggyback on it.
      if (existing?.inFlight) {
        try {
          const result = await existing.inFlight;
          setData(result as T);
          setError(null);
        } catch (e) {
          setError(e);
        }
        setIsValidating(false);
        return;
      }

      // Fresh cache — show it, no network call.
      if (mode === 'swr' && existing && Date.now() - existing.fetchedAt < staleMs) {
        setIsValidating(false);
        return;
      }

      setIsValidating(true);

      const promise = (async () => {
        const res = await apiClient.get(targetUrl);
        if (res.data?.success) {
          return res.data.data as T;
        }
        throw new Error(res.data?.error?.message || 'Request failed');
      })().finally(() => {
        const entry = cache.get(targetUrl);
        if (entry?.inFlight === promise) entry.inFlight = null;
      });

      cache.set(targetUrl, {
        data: existing?.data ?? undefined,
        fetchedAt: existing?.fetchedAt ?? 0,
        inFlight: promise,
      });

      try {
        const result = await promise;
        cache.set(targetUrl, { data: result, fetchedAt: Date.now(), inFlight: null });
        setData(result);
        setError(null);
      } catch (e) {
        setError(e);
      } finally {
        setIsValidating(false);
      }
    },
    [staleMs],
  );

  useEffect(() => {
    if (!url || !enabled) return;
    load(url, 'swr');
  }, [url, enabled, load]);

  const revalidate = useCallback(async () => {
    if (!url) return;
    await load(url, 'force');
  }, [url, load]);

  const loading = !data && !error;

  return { data, error, loading, isValidating, revalidate };
}

interface PrefetchApiResourceOptions {
  /**
   * Minimum gap (ms) before a URL is re-attempted after a previous attempt
   * that did not produce usable data (e.g. network failure). Default 60s.
   */
  cooldownMs?: number;
}

/**
 * prefetchApiResource — warm the shared SWR cache for a URL WITHOUT mounting a
 * hook (no state updates, no re-renders).
 *
 * When the destination page later mounts `useApiResource(url)`, it reads this
 * module-level cache synchronously, so it renders with data immediately and
 * issues no network request if the entry is still fresh.
 *
 * Guarantees (request discipline):
 *  - Never fetches when a usable payload is already cached (even if stale — the
 *    page's own SWR revalidate refreshes it later in the background).
 *  - Piggybacks on an identical in-flight request instead of duplicating it.
 *  - Backs off after failures via `cooldownMs` to avoid repeated requests.
 *
 * Returns the in-flight promise, or `undefined` when nothing was fetched.
 */
export function prefetchApiResource(
  url: string,
  options: PrefetchApiResourceOptions = {},
): Promise<unknown> | undefined {
  const { cooldownMs = 60_000 } = options;
  const existing = cache.get(url);

  // Already have a usable payload — reuse it, do not re-request.
  if (existing?.data !== undefined) return undefined;

  // Same request already in flight — piggyback, never duplicate.
  if (existing?.inFlight) return existing.inFlight;

  // Recently attempted and failed/abandoned — respect the cooldown.
  const attempted = prefetchAttemptedAt.get(url);
  if (attempted && Date.now() - attempted < cooldownMs) return undefined;
  prefetchAttemptedAt.set(url, Date.now());

  const promise = (async () => {
    const res = await apiClient.get(url);
    if (res.data?.success) {
      return res.data.data;
    }
    throw new Error(res.data?.error?.message || 'Request failed');
  })().finally(() => {
    const entry = cache.get(url);
    if (entry?.inFlight === promise) entry.inFlight = null;
  });

  cache.set(url, { data: undefined, fetchedAt: 0, inFlight: promise });

  promise
    .then((result) => {
      cache.set(url, { data: result, fetchedAt: Date.now(), inFlight: null });
    })
    .catch(() => {
      const entry = cache.get(url);
      if (entry?.inFlight === promise) entry.inFlight = null;
    });

  return promise;
}

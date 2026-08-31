import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient } from '@/lib/apiClient';

interface CacheEntry {
  data: unknown;
  fetchedAt: number;
  inFlight: Promise<unknown> | null;
}

const cache = new Map<string, CacheEntry>();
const prefetchAttemptedAt = new Map<string, number>();

function getPersistentCache<T>(url: string): { data: T; fetchedAt: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(`api_cache:${url}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setPersistentCache(url: string, data: unknown, fetchedAt: number) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(`api_cache:${url}`, JSON.stringify({ data, fetchedAt }));
  } catch {}
}

export function clearApiCache() {
  cache.clear();
  prefetchAttemptedAt.clear();
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && key.startsWith('api_cache:')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

export function invalidateApiCache(urlOrPrefix: string) {
  for (const key of cache.keys()) {
    if (key === urlOrPrefix || key.startsWith(urlOrPrefix)) {
      cache.delete(key);
    }
  }
  if (typeof window === 'undefined') return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (key && (key === `api_cache:${urlOrPrefix}` || key.startsWith(`api_cache:${urlOrPrefix}`))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}

interface UseApiResourceOptions<T = unknown> {
  enabled?: boolean;
  staleMs?: number;
  initialData?: T;
}

export interface ApiResourceResult<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
  isValidating: boolean;
  revalidate: () => Promise<void>;
}

export function useApiResource<T = any>(
  url: string | null | undefined,
  options: UseApiResourceOptions<T> = {},
): ApiResourceResult<T> {
  const { enabled = true, staleMs = 300_000 } = options; // Default 5 min fresh window

  const [data, setData] = useState<T | undefined>(() => {
    if (!url) return undefined;
    const hit = cache.get(url);
    if (hit?.data !== undefined) return hit.data as T;
    
    // Check sessionStorage persistent cache
    const p = getPersistentCache<T>(url);
    if (p?.data !== undefined) {
      cache.set(url, { data: p.data, fetchedAt: p.fetchedAt, inFlight: null });
      return p.data;
    }

    if (options.initialData !== undefined) {
      cache.set(url, { data: options.initialData, fetchedAt: Date.now(), inFlight: null });
      setPersistentCache(url, options.initialData, Date.now());
      return options.initialData;
    }
    return undefined;
  });
  const [error, setError] = useState<unknown>(null);
  const [isValidating, setIsValidating] = useState(false);

  const load = useCallback(
    async (targetUrl: string, mode: 'swr' | 'force') => {
      let existing = cache.get(targetUrl);
      if (!existing) {
        const p = getPersistentCache<T>(targetUrl);
        if (p?.data !== undefined) {
          existing = { data: p.data, fetchedAt: p.fetchedAt, inFlight: null };
          cache.set(targetUrl, existing);
        }
      }

      // Dedupe: identical request in flight
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

      // Fresh cache — return immediately with zero network request
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
        const now = Date.now();
        cache.set(targetUrl, { data: result, fetchedAt: now, inFlight: null });
        setPersistentCache(targetUrl, result, now);
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

export function prefetchApiResource(
  url: string,
  options: { cooldownMs?: number } = {},
): Promise<unknown> | undefined {
  const { cooldownMs = 60_000 } = options;
  const existing = cache.get(url);

  if (existing?.data !== undefined) return undefined;

  const p = getPersistentCache(url);
  if (p?.data !== undefined) {
    cache.set(url, { data: p.data, fetchedAt: p.fetchedAt, inFlight: null });
    return undefined;
  }

  if (existing?.inFlight) return existing.inFlight;

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
      const now = Date.now();
      cache.set(url, { data: result, fetchedAt: now, inFlight: null });
      setPersistentCache(url, result, now);
    })
    .catch(() => {
      const entry = cache.get(url);
      if (entry?.inFlight === promise) entry.inFlight = null;
    });

  return promise;
}

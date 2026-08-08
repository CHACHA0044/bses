'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * useNavigationEvent
 *
 * Returns `isNavigating: true` during the window between when a Next.js
 * route transition STARTS and when the new page has FINISHED rendering.
 *
 * How it works:
 * - A capture-phase document click listener intercepts internal <a> clicks and
 *   immediately flips `isNavigating` to true — so the progress bar starts the
 *   instant the user clicks, before the new chunk has even loaded.
 * - When the pathname/searchParams actually change we know the new page has
 *   rendered, so we clear the flag after one paint frame.
 * - A safety timeout guarantees the flag always resets (never stuck).
 *
 * Excluded clicks (no bar, no false positives):
 * - modifier-click / middle click / right click
 * - `target="_blank"`, `download` links, hash-only links, external links
 * - links to the route we are already on
 */
export function useNavigationEvent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isNavigating, setIsNavigating] = useState(false);

  const prevPathRef = useRef<string | null>(null);
  const currentPathRef = useRef<string>(pathname + searchParams.toString());
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = pathname + searchParams.toString();

  useEffect(() => {
    // First run: record the path without triggering a transition.
    if (prevPathRef.current === null) {
      prevPathRef.current = current;
      currentPathRef.current = current;
      return;
    }
    if (prevPathRef.current !== current) {
      prevPathRef.current = current;
      currentPathRef.current = current;
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      // One paint frame after the route committed — done.
      const t = setTimeout(() => setIsNavigating(false), 50);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }
      const target = (e.target as HTMLElement).closest('a');
      if (!target) return;

      const href = target.getAttribute('href');
      if (!href || href.startsWith('#')) return;
      if (target.target === '_blank' || target.hasAttribute('download')) return;

      // Same-origin internal links only.
      if (!(href.startsWith('/') || href.startsWith(window.location.origin))) return;

      // Clicking the route we're already on shouldn't animate the bar.
      const resolved = href.startsWith('/') ? href : new URL(href, window.location.origin).pathname;
      if (resolved === currentPathRef.current) return;

      setIsNavigating(true);
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = setTimeout(() => setIsNavigating(false), 8000);
    };

    document.addEventListener('click', handleClick, { capture: true });
    return () => {
      document.removeEventListener('click', handleClick, { capture: true });
      if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    };
  }, []);

  return { isNavigating };
}

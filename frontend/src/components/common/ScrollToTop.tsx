'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * ScrollToTop — resets scroll on initial load and every client-side route
 * change.
 *
 * Uses useLayoutEffect (runs before the browser paints) so the reset is never
 * visible as a jump after the new route renders.
 *
 * The protected layout scrolls inside its own <main> (not the window), so this
 * resets the window, the document root, and every inner scroll container. The
 * root layout also disables native scroll restoration and forces top before
 * first paint via an inline script — this component covers client-side
 * navigation on top of that.
 */
export const ScrollToTop: React.FC = () => {
  const pathname = usePathname();

  useLayoutEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    document.querySelectorAll('main').forEach((el) => {
      el.scrollTop = 0;
    });
  }, [pathname]);

  return null;
};

'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * ScrollToTop — resets scroll on client-side route changes.
 *
 * The protected layout scrolls inside its own <main> (not the window), so a
 * plain window scroll is not enough. This resets both the window and any
 * inner scroll container so every navigation lands at the top of the page.
 */
export const ScrollToTop: React.FC = () => {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as any });
    document.querySelectorAll('main').forEach((el) => {
      el.scrollTop = 0;
    });
  }, [pathname]);

  return null;
};

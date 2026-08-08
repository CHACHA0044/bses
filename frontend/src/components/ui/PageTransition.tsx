'use client';

import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

/**
 * PageTransition
 *
 * Wraps {children} with a subtle fade-in on route change.
 * Uses a CSS class swap technique so there is zero JS animation overhead
 * (no Framer Motion — just a ~180ms CSS opacity fade). The animation is
 * skipped on the very first render so the initial page load never flashes.
 *
 * Reduced-motion users get no animation via the global media query.
 */
export const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const firstRunRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    if (firstRunRef.current) {
      firstRunRef.current = false;
      return;
    }

    el.classList.remove('page-enter');
    // Trigger reflow to restart the animation reliably.
    void el.offsetWidth;
    el.classList.add('page-enter');
  }, [pathname]);

  return (
    <div ref={containerRef} className="page-enter min-h-[inherit]">
      {children}
    </div>
  );
};

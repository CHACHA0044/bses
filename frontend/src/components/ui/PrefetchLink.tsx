'use client';

import React from 'react';
import Link from 'next/link';
import { usePrefetch } from '@/hooks/usePrefetch';
import { cn } from '@/lib/utils';

export interface PrefetchLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  /** Payloads to warm into the shared cache when the link is primed. */
  dataUrls?: string[];
  children: React.ReactNode;
}

/**
 * PrefetchLink — a Next.js Link that warms its destination the instant the user
 * signals intent (hover / keyboard focus / touch), so the click itself feels
 * instant. Route chunks go through Next.js router.prefetch; the optional
 * dataUrls fill the shared useApiResource cache the destination page reads.
 *
 * Deduplicated and connection-aware, so this is safe on hover-heavy UIs.
 */
export const PrefetchLink = React.forwardRef<HTMLAnchorElement, PrefetchLinkProps>(
  (
    { href, dataUrls = [], children, className, onPointerEnter, onFocus, onTouchStart, ...props },
    ref,
  ) => {
    const { prefetchRoute } = usePrefetch();

    return (
      <Link
        ref={ref}
        href={href}
        className={cn(className)}
        onPointerEnter={(e) => {
          prefetchRoute(href, dataUrls);
          onPointerEnter?.(e);
        }}
        onFocus={(e) => {
          prefetchRoute(href, dataUrls);
          onFocus?.(e);
        }}
        onTouchStart={(e) => {
          prefetchRoute(href, dataUrls);
          onTouchStart?.(e);
        }}
        {...props}
      >
        {children}
      </Link>
    );
  },
);
PrefetchLink.displayName = 'PrefetchLink';

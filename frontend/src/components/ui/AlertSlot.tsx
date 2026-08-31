'use client';

import React from 'react';

export interface AlertSlotProps {
  /** When true the alert is shown; when false the slot collapses to zero height. */
  show: boolean;
  /**
   * Top gap in px — must match the parent container's vertical spacing
   * (e.g. 28 for `space-y-7`). Animated inline so it overrides the parent's
   * space-y margin, meaning siblings below only move as fast as the animation
   * and never snap when the alert mounts or is dismissed.
   */
  gap?: number;
  children: React.ReactNode;
}

/**
 * AlertSlot — snap-free inline alert area.
 *
 * Animates height (via CSS grid-template-rows 0fr → 1fr) and opacity so that
 * showing or hiding an error banner never causes a hard layout jump.
 *
 * CSS-only — no framer-motion dependency, keeping /login and /register
 * out of the 120 KB framer chunk.
 */
export const AlertSlot: React.FC<AlertSlotProps> = ({ show, gap = 28, children }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateRows: show ? '1fr' : '0fr',
      opacity: show ? 1 : 0,
      marginTop: show ? gap : 0,
      transition: 'grid-template-rows 180ms ease-out, opacity 180ms ease-out, margin-top 180ms ease-out',
    }}
  >
    {/* Inner wrapper must have overflow:hidden for grid row collapse to clip content */}
    <div style={{ overflow: 'hidden' }}>
      {children}
    </div>
  </div>
);

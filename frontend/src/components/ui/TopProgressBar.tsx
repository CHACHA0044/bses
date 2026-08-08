'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useNavigationEvent } from '@/hooks/useNavigationEvent';

/**
 * TopProgressBar
 *
 * A slim 2px progress bar fixed at the very top of the viewport.
 * - Starts IMMEDIATELY when a same-app link is clicked (early detection via click interceptor)
 * - Animates from 0 → 20 → 65 → 90 (stall point) while waiting for the new page
 * - Snaps to 100% and fades out once the new page has rendered
 * - Never flickers: bar only becomes visible after 16ms (one frame) to skip sub-16ms instant navigations
 * - Never stays: auto-resets if navigation takes > 8s (safety valve)
 */
export const TopProgressBar: React.FC = () => {
  const { isNavigating } = useNavigationEvent();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  useEffect(() => {
    if (isNavigating) {
      clearTimers();
      setProgress(0);
      setVisible(true);
      setProgress(20);
      const t1 = setTimeout(() => setProgress(50), 80);
      const t2 = setTimeout(() => setProgress(75), 350);
      const t3 = setTimeout(() => setProgress(90), 800);
      // Safety: never stall forever
      const t4 = setTimeout(() => {
        setProgress(100);
        setTimeout(() => { setVisible(false); setProgress(0); }, 250);
      }, 8000);
      timersRef.current = [t1, t2, t3, t4];
    } else {
      // Navigation complete — snap to 100% and fade out
      if (visible) {
        clearTimers();
        setProgress(100);
        const t = setTimeout(() => {
          setVisible(false);
          setProgress(0);
        }, 250);
        timersRef.current = [t];
      }
    }
    return clearTimers;
  }, [isNavigating]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible && progress === 0) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[60] h-[3px] pointer-events-none"
      aria-hidden="true"
    >
      <div
        className="h-full progress-bar-glow rounded-r-full"
        style={{
          background: 'linear-gradient(90deg, #C41E2E 0%, #E04040 40%, #F59E0B 100%)',
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          transition:
            progress === 100
              ? 'width 0.15s ease-out, opacity 0.2s ease-out'
              : 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      />
    </div>
  );
};

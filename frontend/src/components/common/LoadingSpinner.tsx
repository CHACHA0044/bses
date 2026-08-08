'use client';

import React, { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';

interface LoadingSpinnerProps {
  label?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  variant?: 'inline' | 'fullPage' | 'overlay';
  /** Delay in ms before displaying the loader to prevent rapid flashing on fast loads */
  delayMs?: number;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  label = 'Loading BSES Portal...',
  size = 'md',
  variant = 'inline',
  delayMs = 0,
}) => {
  const [show, setShow] = useState(delayMs === 0);

  useEffect(() => {
    if (delayMs === 0) return;
    const timer = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);

  // Don't render anything during the initial delay window
  if (!show) return null;

  const sizeClasses = {
    sm: 'h-6 w-6 border-2',
    md: 'h-10 w-10 border-3',
    lg: 'h-14 w-14 border-4',
    full: 'h-16 w-16 border-4',
  };

  const iconSizes = {
    sm: 'h-3 w-3',
    md: 'h-5 w-5',
    lg: 'h-7 w-7',
    full: 'h-8 w-8',
  };

  const content = (
    <div className="flex flex-col items-center justify-center gap-3.5 p-4 text-center animate-in fade-in duration-200">
      <div className="relative flex items-center justify-center">
        {/* Outer glowing pulsing ring */}
        <div
          className={`absolute rounded-full bg-primary/15 animate-ping ${
            size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-20 w-20' : 'h-14 w-14'
          }`}
        />
        
        {/* Spinning gradient border */}
        <div
          className={`rounded-full border-transparent border-t-primary border-r-amber-500 animate-spin ${sizeClasses[size]}`}
          style={{ borderStyle: 'solid' }}
        />

        {/* Center BSES Lightning Icon */}
        <div className="absolute flex items-center justify-center rounded-full bg-surface-dark p-1.5 shadow-md">
          <Zap className={`${iconSizes[size]} fill-amber-400 text-amber-400`} />
        </div>
      </div>

      {label && (
        <p className="text-xs font-semibold text-slate-600 font-heading tracking-wide">
          {label}
        </p>
      )}
    </div>
  );

  if (variant === 'fullPage' || variant === 'overlay') {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-white/80 backdrop-blur-sm ${
          variant === 'fullPage' ? 'min-h-screen' : ''
        }`}
      >
        {content}
      </div>
    );
  }

  return (
    <div className="flex min-h-[160px] w-full items-center justify-center">
      {content}
    </div>
  );
};

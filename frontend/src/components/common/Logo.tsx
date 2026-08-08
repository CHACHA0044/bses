import React from 'react';

interface LogoProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const Logo: React.FC<LogoProps> = ({ className = '', size = 'md' }) => {
  const badge = size === 'sm' ? 'text-[11px]' : size === 'lg' ? 'text-sm' : 'text-xs';
  const title = size === 'sm' ? 'text-sm' : size === 'lg' ? 'text-xl' : 'text-base';
  const sub   = size === 'sm' ? 'text-[9px]' : 'text-[10px]';

  return (
    /* min-w-0 + overflow-hidden prevents any overflow at 320 px */
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <div
        className={`flex shrink-0 items-center justify-center rounded-lg bg-primary px-2.5 py-1 text-white shadow-sm ${badge} font-extrabold tracking-widest`}
      >
        BSES
      </div>
      <div className="flex min-w-0 flex-col leading-tight">
        <span className={`${title} font-bold text-surface-dark truncate`}>
          {size === 'sm' ? 'Delhi Portal' : 'Rajdhani / Yamuna'}
        </span>
        <span className={`${sub} text-slate-500 font-normal`}>
          Official Discom Portal
        </span>
      </div>
    </div>
  );
};

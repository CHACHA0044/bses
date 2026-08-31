'use client';

import React from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconWrap: string;
  href: string;
  size?: 'md' | 'lg';
}

/**
 * StatCard — shared KPI tile used on the consumer and admin dashboards.
 * Wraps the value in a Link so the whole card is tappable/clickable.
 * size="md" mirrors the consumer dashboard tiles, size="lg" the admin ones.
 */
export const StatCard: React.FC<StatCardProps> = ({
  label,
  value,
  icon: Icon,
  iconWrap,
  href,
  size = 'md',
}) => {
  const lg = size === 'lg';

  return (
    <Link href={href} className="group block h-full outline-none cursor-pointer">
      <div
        className={[
          'bg-white p-5 rounded-2xl border border-slate-200 shadow-sm',
          'flex items-center justify-between h-full',
          'transition-all duration-150 ease-out',
          'group-hover:-translate-y-0.5 group-hover:shadow-md active:scale-[0.97]',
          lg ? 'group-hover:border-amber-500' : 'group-hover:border-slate-300',
        ].join(' ')}
      >
        <div className="min-w-0">
          <p
            className={[
              'font-semibold text-slate-500 truncate',
              lg ? 'text-xs uppercase tracking-wide text-slate-400' : 'text-xs',
            ].join(' ')}
          >
            {label}
          </p>
          <p className={`font-extrabold text-slate-900 mt-1 ${lg ? 'text-3xl' : 'text-2xl'}`}>{value}</p>
        </div>
        <div
          className={[
            'shrink-0 flex items-center justify-center',
            lg ? 'w-12 h-12 rounded-xl' : 'w-11 h-11 rounded-2xl',
            iconWrap,
          ].join(' ')}
        >
          <Icon className={lg ? 'w-6 h-6' : 'w-5 h-5'} />
        </div>
      </div>
    </Link>
  );
};

'use client';

import React, { useMemo } from 'react';

export interface MiniBarChartItem {
  label: string;
  count: number;
}

interface MiniBarChartProps {
  items: MiniBarChartItem[];
  /** Base bar classes, e.g. the gradient or solid fill. */
  barClassName: string;
  /** Hover classes applied to the bar. */
  barHoverClassName?: string;
  /** Minimum rendered bar height as a % of the chart area. */
  barMinHeight?: number;
  className?: string;
  labelClassName?: string;
  valueClassName?: string;
}

/**
 * MiniBarChart — lightweight CSS-only vertical bar chart used by the admin
 * dashboard for monthly/daily registration trends. No chart library.
 */
export const MiniBarChart: React.FC<MiniBarChartProps> = ({
  items,
  barClassName,
  barHoverClassName,
  barMinHeight = 4,
  className,
  labelClassName,
  valueClassName,
}) => {
  const maxVal = useMemo(() => Math.max(...items.map((i) => i.count), 1), [items]);

  return (
    <div className="pt-4 pb-2 space-y-2">
      <div
        className={[
          'h-44 flex items-end justify-between border-b border-slate-100 pb-2',
          className ?? 'gap-2 px-2',
        ].join(' ')}
      >
        {items.map((d, idx) => {
          const pct = Math.round((d.count / maxVal) * 100);
          return (
            <div key={idx} className="flex-1 flex flex-col items-center gap-2 group h-full justify-end">
              <span
                className={[
                  'text-[10px] font-bold text-slate-500 opacity-0 group-hover:opacity-100 transition',
                  valueClassName ?? '',
                ].join(' ')}
              >
                {d.count}
              </span>
              <div
                className={[
                  'w-full rounded-t transition-all duration-300',
                  barClassName,
                  barHoverClassName ?? 'group-hover:brightness-110',
                ].join(' ')}
                style={{ height: `${Math.max(pct, barMinHeight)}%` }}
              />
              <span
                className={[
                  'truncate w-full text-center',
                  labelClassName ?? 'text-[10px] font-bold text-slate-400',
                ].join(' ')}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

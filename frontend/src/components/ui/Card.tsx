import React from 'react';
import { cardHover, interactiveFull } from './InteractionProps';
import { cn } from '@/lib/utils';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
  /** Use when the card is the primary click target (acts as a button/link) */
  interactive?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  hoverable = false,
  interactive = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={cn(
        'rounded-2xl border border-slate-200/80 bg-white text-slate-900 shadow-sm',
        'transition-all duration-150 ease-out',
        hoverable || interactive ? cardHover : '',
        interactive && interactiveFull,
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
};

export const CardHeader: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div className={cn('p-6 pb-3 space-y-1', className)} {...props}>
    {children}
  </div>
);

export const CardTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <h3 className={cn('text-lg font-bold tracking-tight text-slate-900', className)} {...props}>
    {children}
  </h3>
);

export const CardDescription: React.FC<React.HTMLAttributes<HTMLParagraphElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <p className={cn('text-xs text-slate-500 leading-relaxed', className)} {...props}>
    {children}
  </p>
);

export const CardContent: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div className={cn('p-6 pt-3', className)} {...props}>
    {children}
  </div>
);

export const CardFooter: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className = '',
  ...props
}) => (
  <div
    className={cn('p-6 pt-0 border-t border-slate-100 flex items-center', className)}
    {...props}
  >
    {children}
  </div>
);

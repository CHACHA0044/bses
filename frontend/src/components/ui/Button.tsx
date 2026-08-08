import React from 'react';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { interactiveFull, loadingState } from './InteractionProps';
import { cn } from '@/lib/utils';

export type ButtonVariant =
  | 'primary'
  | 'cta'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'outline-navy'
  | 'amber'
  | 'outline'
  | 'ghost-white';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
  /** Custom text shown while loading (defaults to "Loading…"). */
  loadingLabel?: string;
  /** Show a green check — use after successful async actions. */
  isSuccess?: boolean;
  /** Custom text shown while in success state (defaults to "Done"). */
  successLabel?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white hover:bg-primary/90 active:bg-primary/80 shadow-sm hover:shadow-md',
  cta: 'bg-accent text-accent-foreground hover:bg-accent/90 active:bg-accent/80 shadow-md hover:shadow-lg font-bold',
  amber:
    'bg-accent text-accent-foreground hover:bg-accent/90 active:bg-accent/80 shadow-md hover:shadow-lg font-bold',
  secondary:
    'bg-slate-100 text-surface-dark border border-slate-200 hover:bg-slate-200 active:bg-slate-300 shadow-sm hover:shadow-md',
  'outline-navy':
    'border-2 border-surface-navy text-surface-navy bg-transparent hover:bg-surface-navy hover:text-white active:bg-surface-dark active:border-surface-dark shadow-sm hover:shadow-md',
  outline:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900 hover:border-slate-400 hover:shadow-sm active:bg-slate-100',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200',
  'ghost-white':
    'border border-white/40 bg-white/10 text-white hover:bg-white/20 hover:border-white/60 active:bg-white/30',
  danger: 'bg-error text-white hover:bg-red-700 active:bg-red-800 shadow-sm hover:shadow-md',
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5 min-h-[32px]',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2 min-h-[40px]',
  lg: 'px-6 py-3.5 text-base rounded-xl gap-2.5 min-h-[48px]',
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = 'primary',
      size = 'md',
      isLoading = false,
      loadingLabel = 'Loading…',
      isSuccess = false,
      successLabel = 'Done',
      leftIcon,
      rightIcon,
      fullWidth = false,
      className = '',
      disabled,
      ...props
    },
    ref,
  ) => {
    const isBusy = isLoading || isSuccess;

    return (
      <button
        ref={ref}
        disabled={disabled || isBusy}
        aria-busy={isLoading}
        className={cn(
          'inline-flex items-center justify-center font-semibold',
          interactiveFull,
          isLoading && loadingState,
          variantStyles[variant],
          sizeStyles[size],
          fullWidth && 'w-full',
          className,
        )}
        {...props}
      >
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin shrink-0" />
            <span>{loadingLabel}</span>
          </>
        ) : isSuccess ? (
          <>
            <CheckCircle2 className="h-4 w-4 text-current shrink-0" />
            <span>{successLabel}</span>
          </>
        ) : (
          <>
            {leftIcon && <span className="shrink-0">{leftIcon}</span>}
            {children}
            {rightIcon && <span className="shrink-0">{rightIcon}</span>}
          </>
        )}
      </button>
    );
  },
);
Button.displayName = 'Button';

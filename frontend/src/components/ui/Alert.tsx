import React from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X, WifiOff, KeyRound } from 'lucide-react';

export type AlertType = 'success' | 'error' | 'warning' | 'info' | 'network' | 'credentials';

const config: Record<
  AlertType,
  { bg: string; border: string; text: string; icon: React.ElementType; label: string }
> = {
  success: {
    bg: 'bg-success-light',
    border: 'border-success',
    text: 'text-green-800',
    icon: CheckCircle2,
    label: 'Success',
  },
  error: {
    bg: 'bg-error-light',
    border: 'border-error',
    text: 'text-red-800',
    icon: AlertCircle,
    label: 'Error',
  },
  warning: {
    bg: 'bg-warning-light',
    border: 'border-warning',
    text: 'text-amber-800',
    icon: AlertTriangle,
    label: 'Warning',
  },
  info: {
    bg: 'bg-info-light',
    border: 'border-info',
    text: 'text-blue-800',
    icon: Info,
    label: 'Info',
  },
  /** Distinguishable error type: network/server failure */
  network: {
    bg: 'bg-slate-100',
    border: 'border-slate-400',
    text: 'text-slate-800',
    icon: WifiOff,
    label: 'Connection Error',
  },
  /** Distinguishable error type: wrong credentials */
  credentials: {
    bg: 'bg-error-light',
    border: 'border-error',
    text: 'text-red-800',
    icon: KeyRound,
    label: 'Authentication Failed',
  },
};

export interface AlertProps {
  type?: AlertType;
  title?: string;
  children: React.ReactNode;
  onClose?: () => void;
  className?: string;
  /** Auto-dismiss after this many ms. 0 = off. Default: 6000. */
  autoDismissMs?: number;
}

export const Alert: React.FC<AlertProps> = ({
  type = 'info',
  title,
  children,
  onClose,
  className = '',
  autoDismissMs = 6000,
}) => {
  const [visible, setVisible] = React.useState(true);
  const [dismissing, setDismissing] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    if (autoDismissMs > 0 && onClose) {
      timerRef.current = setTimeout(() => {
        setDismissing(true);
        setTimeout(() => {
          setVisible(false);
          onClose();
        }, 300); // match CSS transition duration
      }, autoDismissMs);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [autoDismissMs, onClose, children]);

  const handleClose = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setDismissing(true);
    setTimeout(() => {
      setVisible(false);
      onClose?.();
    }, 200);
  };

  if (!visible) return null;

  const c = config[type];
  const Icon = c.icon;
  const displayTitle = title ?? c.label;

  return (
    <div
      role="alert"
      className={`flex items-start gap-3 rounded-xl border p-4 transition-all duration-300 ${
        dismissing ? 'opacity-0 translate-y-[-4px] scale-95' : 'opacity-100 translate-y-0 scale-100'
      } ${c.bg} ${c.border} ${c.text} ${className}`}
    >
      <Icon className="mt-0.5 h-4.5 w-4.5 shrink-0" aria-hidden="true" />
      <div className="flex-1 text-sm space-y-0.5">
        <p className="font-bold">{displayTitle}</p>
        <div className="font-normal opacity-90">{children}</div>
      </div>
      {onClose && (
        <button
          onClick={handleClose}
          className="shrink-0 rounded-md p-0.5 opacity-70 hover:opacity-100 transition active:scale-90 cursor-pointer"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
};

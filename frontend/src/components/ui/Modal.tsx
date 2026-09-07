import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { iconButton } from './InteractionProps';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
  /** Whether clicking the backdrop dismisses the modal (default: false) */
  closeOnBackdropClick?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  maxWidth = 'md',
  closeOnBackdropClick = false,
}) => {
  const [mounted, setMounted] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Lock body scroll while open, restore focus to the trigger on close.
  useEffect(() => {
    if (!isOpen || !mounted) return;
    previouslyFocusedRef.current = document.activeElement as HTMLElement | null;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = originalOverflow;
      previouslyFocusedRef.current?.focus?.();
    };
  }, [isOpen, mounted]);

  // Escape to close + simple focus trap.
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  const widthMap = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
  };

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (closeOnBackdropClick && e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    // Outer div: fixed, covers entire viewport (inset-0), highest z-index.
    // This is the backdrop that sits ABOVE everything else in the app.
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop — sits below the modal dialog but above all app content.
          Uses bg-black/50 (not bg-slate-900/60) for true darkness that
          properly covers any bright content, plus backdrop-blur-sm for
          consistent cross-browser dimming without looking washed out. */}
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />

      {/* Modal Dialog Box — sits above the backdrop, z-10 relative to its
          parent container (which already has z-[9999]). The dialog itself
          gets a high z-index so it is always on top of the backdrop.
          overflow-y-auto on the dialog content allows internal scrolling. */}
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`relative z-10 w-full ${widthMap[maxWidth]} max-h-[90vh] rounded-2xl bg-white text-slate-900 shadow-2xl border border-slate-200 outline-none flex flex-col`}
      >
        {/* Fixed header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-slate-100 shrink-0">
          <div className="min-w-0">
            <h3 id="modal-title" className="text-base font-bold text-slate-900 tracking-tight">
              {title}
            </h3>
            {description && <p className="text-xs text-slate-500 mt-0.5">{description}</p>}
          </div>
          <button onClick={onClose} className={iconButton} aria-label="Close dialog">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable content area */}
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body,
  );
};

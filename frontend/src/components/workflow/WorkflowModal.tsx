'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, type ButtonVariant } from '@/components/ui/Button';

export interface WorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  submitLabel: string;
  submitVariant?: ButtonVariant;
  isLoading?: boolean;
  error?: string;
  onSubmit: () => void;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * Modal shell for workflow actions: renders a form body plus a consistent
 * Cancel / Submit footer. The body (`children`) owns its own field state.
 */
export const WorkflowModal: React.FC<WorkflowModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  submitLabel,
  submitVariant = 'primary',
  isLoading = false,
  error,
  onSubmit,
  children,
  maxWidth = 'md',
}) => (
  <Modal isOpen={isOpen} onClose={() => !isLoading && onClose()} title={title} description={description} maxWidth={maxWidth}>
    <div className="space-y-4">
      {children}

      {error && <p className="text-xs font-bold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}

      <div className="flex justify-end gap-3 pt-1">
        <Button variant="outline" size="md" onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant={submitVariant} size="md" onClick={onSubmit} isLoading={isLoading} loadingLabel="Submitting…">
          {submitLabel}
        </Button>
      </div>
    </div>
  </Modal>
);

import type { ReactNode } from 'react';
import { ConfirmDialog } from '../patterns';

export interface VoiceConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  tone?: 'critical' | 'default';
  children?: ReactNode;
}

/**
 * Voice confirmation overlay — thin wrapper over shared ConfirmDialog.
 * Callers supply optional acknowledgement fields via children.
 */
export function VoiceConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  loading = false,
  tone = 'default',
  children,
}: VoiceConfirmationDialogProps) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      loading={loading}
      tone={tone}
      onConfirm={onConfirm}
    >
      {children}
    </ConfirmDialog>
  );
}

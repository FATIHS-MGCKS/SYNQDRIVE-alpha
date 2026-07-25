import { useEffect, useId, useRef } from 'react';
import { focusFirstElement, trapTabKey } from '../lib/operatorA11y';

interface UseOperatorDialogA11yOptions {
  open: boolean;
  onClose: () => void;
  labelledById?: string;
  describedById?: string;
  initialFocusSelector?: string;
}

export function useOperatorDialogA11y({
  open,
  onClose,
  labelledById,
  describedById,
  initialFocusSelector,
}: UseOperatorDialogA11yOptions) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    const root = dialogRef.current;
    if (!root) return undefined;

    const raf = window.requestAnimationFrame(() => {
      const preferred = initialFocusSelector
        ? root.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      if (preferred) {
        preferred.focus();
        return;
      }
      focusFirstElement(root);
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (dialogRef.current) trapTabKey(event, dialogRef.current);
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [open, onClose, initialFocusSelector]);

  return {
    dialogRef,
    titleId: labelledById ?? titleId,
    describedById,
    dialogProps: {
      role: 'dialog' as const,
      'aria-modal': true,
      'aria-labelledby': labelledById ?? titleId,
      ...(describedById ? { 'aria-describedby': describedById } : {}),
    },
  };
}

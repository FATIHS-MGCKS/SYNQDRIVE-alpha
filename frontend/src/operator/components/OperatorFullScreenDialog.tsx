import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '../../components/ui/utils';
import { useOperatorDialogA11y } from '../hooks/useOperatorDialogA11y';

const OperatorDialogTitleIdContext = createContext<string | null>(null);

export function useOperatorDialogTitleId(): string {
  const titleId = useContext(OperatorDialogTitleIdContext);
  if (!titleId) {
    throw new Error('useOperatorDialogTitleId must be used inside OperatorFullScreenDialog');
  }
  return titleId;
}

interface OperatorFullScreenDialogProps {
  open?: boolean;
  onClose: () => void;
  titleId?: string;
  describedById?: string;
  className?: string;
  zIndexClass?: string;
  children: ReactNode;
}

/**
 * Full-screen operator sheet/dialog with focus trap, Escape close, and focus return.
 */
export function OperatorFullScreenDialog({
  open = true,
  onClose,
  titleId: titleIdProp,
  describedById,
  className,
  zIndexClass = 'z-[130]',
  children,
}: OperatorFullScreenDialogProps) {
  const { dialogRef, titleId, dialogProps } = useOperatorDialogA11y({
    open,
    onClose,
    labelledById: titleIdProp,
    describedById,
  });

  if (!open) return null;

  return (
    <OperatorDialogTitleIdContext.Provider value={titleId}>
      <div
        ref={dialogRef}
        {...dialogProps}
        className={cn('fixed inset-0 flex flex-col bg-background', zIndexClass, className)}
        style={{
          paddingTop: 'env(safe-area-inset-top)',
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {children}
      </div>
    </OperatorDialogTitleIdContext.Provider>
  );
}

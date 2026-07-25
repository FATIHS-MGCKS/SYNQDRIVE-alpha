import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  OperatorFullScreenDialog,
  useOperatorDialogTitleId,
} from '../components/OperatorFullScreenDialog';

interface OperatorBookingSheetShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

function OperatorSheetHeader({
  title,
  subtitle,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
}) {
  const titleId = useOperatorDialogTitleId();

  return (
    <header className="shrink-0 flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
      <div className="min-w-0">
        {!subtitle && (
          <h2 id={titleId} className="truncate text-base font-bold text-foreground">
            {title}
          </h2>
        )}
        {subtitle && (
          <>
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <h2 id={titleId} className="truncate text-base font-bold text-foreground">
              {subtitle}
            </h2>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]/40"
        aria-label="Schließen"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </header>
  );
}

export function OperatorBookingSheetShell({
  title,
  subtitle,
  onClose,
  children,
}: OperatorBookingSheetShellProps) {
  return (
    <OperatorFullScreenDialog onClose={onClose}>
      <OperatorSheetHeader title={title} subtitle={subtitle} onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">{children}</div>
    </OperatorFullScreenDialog>
  );
}

export { OperatorSheetHeader };

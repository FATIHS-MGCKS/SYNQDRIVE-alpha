import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface OperatorBookingSheetShellProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}

export function OperatorBookingSheetShell({
  title,
  subtitle,
  onClose,
  children,
}: OperatorBookingSheetShellProps) {
  return (
    <div
      className="fixed inset-0 z-[130] flex flex-col bg-background"
      style={{
        paddingTop: 'env(safe-area-inset-top)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
      role="dialog"
      aria-modal
    >
      <header className="shrink-0 flex items-center justify-between gap-3 border-b border-border/50 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
          {subtitle && <h2 className="truncate text-base font-bold text-foreground">{subtitle}</h2>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="sq-press flex h-11 w-11 items-center justify-center rounded-xl border border-border/60"
          aria-label="Schließen"
        >
          <X className="h-4 w-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-5">{children}</div>
    </div>
  );
}

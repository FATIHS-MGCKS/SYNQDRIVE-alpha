interface OperatorHandoverConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function OperatorHandoverConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Abbrechen',
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: OperatorHandoverConfirmDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="alertdialog"
      aria-modal
      aria-labelledby="handover-confirm-title"
      aria-describedby="handover-confirm-desc"
      style={{
        paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
        paddingTop: 'max(1rem, env(safe-area-inset-top))',
      }}
    >
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background p-5 shadow-xl">
        <p id="handover-confirm-title" className="text-sm font-bold text-foreground">
          {title}
        </p>
        <p id="handover-confirm-desc" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="sq-3d-btn sq-3d-btn--neutral min-h-[48px] font-semibold disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`sq-3d-btn min-h-[48px] font-semibold disabled:opacity-50 ${
              destructive ? 'sq-3d-btn--neutral' : 'sq-3d-btn--primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

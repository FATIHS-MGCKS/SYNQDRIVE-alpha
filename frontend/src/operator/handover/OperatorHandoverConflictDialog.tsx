interface OperatorHandoverConflictDialogProps {
  open: boolean;
  message: string;
  onAcceptServer: () => void;
  onKeepLocal: () => void;
  busy?: boolean;
}

export function OperatorHandoverConflictDialog({
  open,
  message,
  onAcceptServer,
  onKeepLocal,
  busy = false,
}: OperatorHandoverConflictDialogProps) {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-end justify-center bg-black/45 p-4 sm:items-center"
      role="alertdialog"
      aria-modal
      aria-labelledby="handover-conflict-title"
      aria-describedby="handover-conflict-desc"
    >
      <div className="w-full max-w-md rounded-2xl border border-border/60 bg-background p-5 shadow-xl">
        <p
          id="handover-conflict-title"
          className="text-sm font-bold text-[color:var(--status-critical)]"
        >
          Entwurf-Konflikt
        </p>
        <p id="handover-conflict-desc" className="mt-2 text-sm text-muted-foreground">
          {message}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Ohne Ihre Auswahl wird kein automatisches Überschreiben durchgeführt. Server-Stand
          übernehmen lädt die neueste gespeicherte Version. Mit lokalen Eingaben fortfahren
          speichert Ihre aktuellen Felder nach Aktualisierung der Versionsnummer.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={busy}
            onClick={onAcceptServer}
            className="sq-3d-btn sq-3d-btn--neutral min-h-[48px] font-semibold disabled:opacity-50"
          >
            Server-Stand laden
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onKeepLocal}
            className="sq-3d-btn sq-3d-btn--primary min-h-[48px] font-semibold disabled:opacity-50"
          >
            Lokal fortfahren
          </button>
        </div>
      </div>
    </div>
  );
}

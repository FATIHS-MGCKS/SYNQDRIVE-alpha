import { useEffect, useState } from 'react';
import { ConfirmDialog } from '../../../components/patterns';

export interface TaskDetailChecklistOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loading?: boolean;
  openRequiredTitles: string[];
  onConfirm: (reason: string) => void | Promise<void>;
}

export function TaskDetailChecklistOverrideDialog({
  open,
  onOpenChange,
  loading = false,
  openRequiredTitles,
  onConfirm,
}: TaskDetailChecklistOverrideDialogProps) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setReason('');
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setError('Bitte geben Sie eine Begründung für den Override an.');
      return;
    }
    setError(null);
    await onConfirm(trimmed);
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Aufgabe trotz offener Pflichtpunkte abschließen?"
      description="Diese Aktion ist nur für berechtigte Nutzer vorgesehen. Die Begründung wird protokolliert."
      confirmLabel="Mit Begründung abschließen"
      tone="critical"
      loading={loading}
      onConfirm={() => void handleConfirm()}
    >
      {openRequiredTitles.length > 0 && (
        <div className="mt-3 rounded-lg border border-[color:var(--status-watch)]/30 bg-[color:var(--status-watch)]/[0.06] px-3 py-2">
          <p className="text-[11px] font-semibold text-[color:var(--status-watch)]">
            Offene Pflichtpunkte
          </p>
          <ul className="mt-1 list-inside list-disc text-[11px] text-[color:var(--status-watch)]">
            {openRequiredTitles.map((title) => (
              <li key={title}>{title}</li>
            ))}
          </ul>
        </div>
      )}

      <label className="mt-3 block text-[11px] font-semibold text-muted-foreground">
        Begründung *
        <textarea
          value={reason}
          onChange={(event) => {
            setReason(event.target.value);
            setError(null);
          }}
          disabled={loading}
          rows={4}
          className="mt-1.5 w-full resize-y rounded-lg border border-border surface-premium px-3 py-2 text-xs"
          placeholder="Warum wird die Aufgabe ohne vollständige Checkliste abgeschlossen?"
        />
      </label>
      {error ? (
        <p className="mt-1 text-[10px] font-medium text-[color:var(--status-critical)]">{error}</p>
      ) : null}
    </ConfirmDialog>
  );
}

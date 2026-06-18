import { useEffect, useState } from 'react';
import { FormDialog } from '../../../components/patterns';
import type { MarkDamageRepairedInput } from '../../lib/damage.types';

interface MarkRepairedDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  damageLabel?: string;
  onConfirm: (input: MarkDamageRepairedInput) => Promise<void>;
}

export function MarkRepairedDialog({
  open,
  onOpenChange,
  busy,
  damageLabel,
  onConfirm,
}: MarkRepairedDialogProps) {
  const [repairCostEuro, setRepairCostEuro] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setRepairCostEuro('');
      setNote('');
      setError(null);
    }
  }, [open]);

  const handleConfirm = async () => {
    setError(null);
    let repairCostCents: number | undefined;
    if (repairCostEuro.trim()) {
      const num = Number(repairCostEuro.trim().replace(',', '.'));
      if (!Number.isFinite(num) || num < 0) {
        setError('Repair cost must be zero or greater.');
        return;
      }
      repairCostCents = Math.round(num * 100);
    }
    try {
      await onConfirm({
        repairCostCents,
        note: note.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      setError('Could not mark as repaired. Please try again.');
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mark as repaired"
      description={
        damageLabel
          ? `Confirm repair completion for ${damageLabel}. This moves the damage out of the open queue.`
          : 'Confirm repair completion. This moves the damage out of the open queue.'
      }
      footer={
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="sq-press px-3 py-2 rounded-lg text-xs font-semibold border border-border/70"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            className="sq-cta px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Confirm repaired'}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {error && (
          <p className="text-[12px] text-red-600 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            {error}
          </p>
        )}
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-foreground">Actual repair cost (EUR, optional)</span>
          <input
            type="text"
            inputMode="decimal"
            value={repairCostEuro}
            onChange={(e) => setRepairCostEuro(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder="e.g. 380.00"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-foreground">Note (optional)</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            placeholder="Workshop reference, parts replaced…"
          />
        </label>
      </div>
    </FormDialog>
  );
}

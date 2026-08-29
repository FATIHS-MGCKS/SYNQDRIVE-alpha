import { useEffect, useState } from 'react';
import { FormDialog } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { MarkDamageRepairedInput } from '../../lib/damage.types';
import { resolveDamageValidationMessage } from '../../lib/rental-vehicle-damages-i18n';

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
  const { t } = useLanguage();
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
        setError(resolveDamageValidationMessage('REPAIR_COST_INVALID', t));
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
      setError(resolveDamageValidationMessage('MARK_REPAIRED_FAILED', t));
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('vehicleDamages.markRepaired.title')}
      description={
        damageLabel
          ? t('vehicleDamages.markRepaired.descriptionWithLabel', { label: damageLabel })
          : t('vehicleDamages.markRepaired.description')
      }
      footer={
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => onOpenChange(false)}
            className="sq-press px-3 py-2 rounded-lg text-xs font-semibold border border-border/70"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleConfirm()}
            className="sq-cta px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            {busy ? t('common.saving') : t('vehicleDamages.markRepaired.confirm')}
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
          <span className="text-[12px] font-medium text-foreground">
            {t('vehicleDamages.markRepaired.field.repairCost')}
          </span>
          <input
            type="text"
            inputMode="decimal"
            value={repairCostEuro}
            onChange={(e) => setRepairCostEuro(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
            placeholder={t('vehicleDamages.markRepaired.field.repairCostPlaceholder')}
          />
        </label>
        <label className="block space-y-1">
          <span className="text-[12px] font-medium text-foreground">
            {t('vehicleDamages.markRepaired.field.note')}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none"
            placeholder={t('vehicleDamages.markRepaired.notePlaceholder')}
          />
        </label>
      </div>
    </FormDialog>
  );
}

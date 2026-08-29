import { useEffect, useMemo, useState } from 'react';
import { FormDialog } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import { api, type Vendor } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import type { DamageResponse } from '../../lib/damage.types';
import {
  buildRepairTaskDescription,
  buildRepairTaskTitle,
  deriveTaskPriorityFromDamage,
  type CreateRepairTaskInput,
} from '../../lib/damage-repair-task';
import {
  resolveDamageTypeLabel,
  resolveDamageValidationMessage,
  resolveRepairTaskPriorityLabel,
} from '../../lib/rental-vehicle-damages-i18n';

interface CreateRepairTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  damage: DamageResponse | null;
  busy?: boolean;
  onConfirm: (damage: DamageResponse, input: CreateRepairTaskInput) => Promise<void>;
}

export function CreateRepairTaskDialog({
  open,
  onOpenChange,
  damage,
  busy,
  onConfirm,
}: CreateRepairTaskDialogProps) {
  const { t } = useLanguage();
  const { orgId } = useRentalOrg();
  const [dueDate, setDueDate] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [vendors, setVendors] = useState<Vendor[] | null>(null);
  const [vendorsLoading, setVendorsLoading] = useState(false);

  const prefilled = useMemo(() => {
    if (!damage) return null;
    return {
      title: buildRepairTaskTitle(damage),
      priority: deriveTaskPriorityFromDamage(damage),
      description: buildRepairTaskDescription(damage),
    };
  }, [damage]);

  useEffect(() => {
    if (!open) {
      setDueDate('');
      setVendorId('');
      setNote('');
      setError(null);
      setVendors(null);
      return;
    }
    if (!orgId) return;

    let cancelled = false;
    setVendorsLoading(true);
    api.vendors
      .list(orgId)
      .then((rows) => {
        if (!cancelled) setVendors(rows.length > 0 ? rows : null);
      })
      .catch(() => {
        if (!cancelled) setVendors(null);
      })
      .finally(() => {
        if (!cancelled) setVendorsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, orgId]);

  const handleConfirm = async () => {
    if (!damage) return;
    setError(null);
    try {
      await onConfirm(damage, {
        dueDate: dueDate ? new Date(dueDate).toISOString() : undefined,
        vendorId: vendorId || undefined,
        note: note.trim() || undefined,
      });
      onOpenChange(false);
    } catch {
      setError(resolveDamageValidationMessage('CREATE_TASK_FAILED', t));
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('vehicleDamages.repairTask.title')}
      description={
        damage
          ? t('vehicleDamages.repairTask.description', {
              damageType: resolveDamageTypeLabel(t, damage.damageType).toLowerCase(),
            })
          : t('vehicleDamages.repairTask.noDamage')
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
            disabled={busy || !damage}
            onClick={() => void handleConfirm()}
            className="sq-cta px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            {busy ? t('vehicleDamages.repairTask.creating') : t('vehicleDamages.repairTask.create')}
          </button>
        </>
      }
    >
      {!damage ? (
        <p className="text-sm text-muted-foreground">{t('vehicleDamages.repairTask.noDamage')}</p>
      ) : (
        <div className="space-y-4">
          {error && (
            <p className="text-[12px] text-red-600 dark:text-red-400 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              {error}
            </p>
          )}

          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 space-y-2">
            <PreviewRow label={t('tasks.form.title')} value={prefilled?.title ?? '—'} />
            <PreviewRow
              label={t('tasks.filter.sortPriority')}
              value={resolveRepairTaskPriorityLabel(t, prefilled?.priority ?? 'NORMAL')}
            />
            <PreviewRow
              label={t('tasks.filter.vehicleLabel')}
              value={damage.vehicleId.slice(0, 8) + '…'}
              mono
            />
          </div>

          <div>
            <label className="sq-section-label mb-1.5 block">
              {t('vehicleDamages.repairTask.preview.description')}
            </label>
            <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/10 px-3 py-2 max-h-32 overflow-y-auto">
              {prefilled?.description}
            </pre>
          </div>

          <div>
            <label htmlFor="repair-task-due" className="sq-section-label mb-1.5 block">
              {t('vehicleDamages.repairTask.field.dueDate')}
            </label>
            <input
              id="repair-task-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
            />
          </div>

          {vendors && vendors.length > 0 && (
            <div>
              <label htmlFor="repair-task-vendor" className="sq-section-label mb-1.5 block">
                {t('vehicleDamages.repairTask.field.vendor')}
              </label>
              <select
                id="repair-task-vendor"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              >
                <option value="">{t('vehicleDamages.repairTask.noVendor')}</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {vendorsLoading && (
            <p className="text-[11px] text-muted-foreground">{t('vehicleDamages.repairTask.loadingVendors')}</p>
          )}

          <div>
            <label htmlFor="repair-task-note" className="sq-section-label mb-1.5 block">
              {t('vehicleDamages.repairTask.field.note')}
            </label>
            <textarea
              id="repair-task-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm resize-none"
              placeholder={t('vehicleDamages.repairTask.notePlaceholder')}
            />
          </div>
        </div>
      )}
    </FormDialog>
  );
}

function PreviewRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-medium text-foreground text-right ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

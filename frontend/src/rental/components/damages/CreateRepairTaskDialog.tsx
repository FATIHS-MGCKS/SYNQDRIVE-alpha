import { useEffect, useMemo, useState } from 'react';
import { FormDialog } from '../../../components/patterns';
import { api, type Vendor } from '../../../lib/api';
import { useRentalOrg } from '../../RentalContext';
import type { DamageResponse } from '../../lib/damage.types';
import { formatDamageType } from '../../lib/damage.types';
import {
  buildRepairTaskDescription,
  buildRepairTaskTitle,
  deriveTaskPriorityFromDamage,
  type CreateRepairTaskInput,
} from '../../lib/damage-repair-task';

interface CreateRepairTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  damage: DamageResponse | null;
  busy?: boolean;
  onConfirm: (damage: DamageResponse, input: CreateRepairTaskInput) => Promise<void>;
}

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: 'Critical',
  HIGH: 'High',
  NORMAL: 'Medium',
  LOW: 'Low',
};

export function CreateRepairTaskDialog({
  open,
  onOpenChange,
  damage,
  busy,
  onConfirm,
}: CreateRepairTaskDialogProps) {
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
      setError('Could not create repair task. Please try again.');
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Create repair task"
      description={
        damage
          ? `Creates an operational repair task linked to this ${formatDamageType(damage.damageType).toLowerCase()} damage.`
          : 'Select a damage record first.'
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
            disabled={busy || !damage}
            onClick={() => void handleConfirm()}
            className="sq-cta px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            {busy ? 'Creating…' : 'Create task'}
          </button>
        </>
      }
    >
      {!damage ? (
        <p className="text-sm text-muted-foreground">No damage selected.</p>
      ) : (
        <div className="space-y-4">
          {error && (
            <p className="text-[12px] text-red-600 dark:text-red-400 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
              {error}
            </p>
          )}

          <div className="rounded-lg border border-border/70 bg-muted/20 px-3 py-2.5 space-y-2">
            <PreviewRow label="Title" value={prefilled?.title ?? '—'} />
            <PreviewRow
              label="Priority"
              value={PRIORITY_LABEL[prefilled?.priority ?? 'NORMAL'] ?? 'Medium'}
            />
            <PreviewRow label="Vehicle" value={damage.vehicleId.slice(0, 8) + '…'} mono />
          </div>

          <div>
            <label className="sq-section-label mb-1.5 block">Description preview</label>
            <pre className="text-[11px] text-muted-foreground whitespace-pre-wrap rounded-lg border border-border/60 bg-muted/10 px-3 py-2 max-h-32 overflow-y-auto">
              {prefilled?.description}
            </pre>
          </div>

          <div>
            <label htmlFor="repair-task-due" className="sq-section-label mb-1.5 block">
              Due date (optional)
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
                Workshop / vendor (optional)
              </label>
              <select
                id="repair-task-vendor"
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm"
              >
                <option value="">No vendor selected</option>
                {vendors.map((vendor) => (
                  <option key={vendor.id} value={vendor.id}>
                    {vendor.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {vendorsLoading && (
            <p className="text-[11px] text-muted-foreground">Loading vendors…</p>
          )}

          <div>
            <label htmlFor="repair-task-note" className="sq-section-label mb-1.5 block">
              Additional note (optional)
            </label>
            <textarea
              id="repair-task-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm resize-none"
              placeholder="Instructions for the workshop or internal team"
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

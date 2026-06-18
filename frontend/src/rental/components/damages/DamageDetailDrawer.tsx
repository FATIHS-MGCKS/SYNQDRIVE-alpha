import { useMemo, useState } from 'react';
import { AddDamagePhotoPanel } from './AddDamagePhotoPanel';
import { DamageRentalSections } from './DamageRentalSections';
import { DetailDrawer, StatusChip, Timeline } from '../../../components/patterns';
import type { TimelineItem } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { PickupContextResult } from '../../lib/damage-pickup-context';
import type { DamageLiabilityStatus, DamageResponse } from '../../lib/damage.types';
import {
  formatDamageDate,
  formatDamageType,
  formatEuroCents,
  formatSeverity,
  hasValidMapPin,
  isActiveDamage,
  normalizeDamageStatus,
} from '../../lib/damage.types';

import { canCreateRepairTaskForDamage } from '../../lib/damage-repair-task';

interface LinkedRepairTask {
  id: string;
  title: string;
  status: string;
}

interface DamageDetailDrawerProps {
  open: boolean;
  damage: DamageResponse | null;
  onOpenChange: (open: boolean) => void;
  busy?: boolean;
  linkedTask?: LinkedRepairTask | null;
  pickupContext?: PickupContextResult | null;
  onAddPhoto: (damage: DamageResponse, file: File, caption?: string) => Promise<void>;
  onPlace: (damage: DamageResponse) => void;
  onMarkInRepair: (damage: DamageResponse) => Promise<void>;
  onRequestMarkRepaired: (damage: DamageResponse) => void;
  onArchive: (damage: DamageResponse) => Promise<void>;
  onRequestCreateRepairTask: (damage: DamageResponse) => void;
  onOpenLinkedTask?: (taskId: string) => void;
  onUpdateLiability: (
    damage: DamageResponse,
    input: { liabilityStatus: DamageLiabilityStatus; liabilityNote?: string },
  ) => Promise<void>;
  onPrepareDepositHold: (damage: DamageResponse, cents: number) => Promise<void>;
  onPrepareCustomerCharge: (damage: DamageResponse, cents: number) => Promise<void>;
}

export function DamageDetailDrawer({
  open,
  damage,
  onOpenChange,
  busy,
  linkedTask,
  pickupContext,
  onAddPhoto,
  onPlace,
  onMarkInRepair,
  onRequestMarkRepaired,
  onArchive,
  onRequestCreateRepairTask,
  onOpenLinkedTask,
  onUpdateLiability,
  onPrepareDepositHold,
  onPrepareCustomerCharge,
}: DamageDetailDrawerProps) {
  const [actionError, setActionError] = useState<string | null>(null);

  const timeline = useMemo(() => buildDamageTimeline(damage), [damage]);

  if (!damage) {
    return (
      <DetailDrawer open={open} onOpenChange={onOpenChange} title="Damage detail" widthClassName="sm:max-w-xl">
        <p className="text-sm text-muted-foreground">No damage selected.</p>
      </DetailDrawer>
    );
  }

  const status = normalizeDamageStatus(damage);
  const active = isActiveDamage(damage);
  const placed = hasValidMapPin(damage);
  const rentalBlocked =
    active &&
    (damage.rentalImpact === 'BLOCK_RENTAL' || damage.rentalImpact === 'SAFETY_CRITICAL');
  const canCreateTask = active && canCreateRepairTaskForDamage(damage);

  const run = async (fn: () => Promise<void>) => {
    setActionError(null);
    try {
      await fn();
    } catch {
      setActionError('Action failed. Please try again.');
    }
  };

  return (
    <DetailDrawer
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="Damage record"
      title={formatDamageType(damage.damageType)}
      description={damage.description ?? 'No description provided.'}
      widthClassName="sm:max-w-xl"
      status={
        <StatusChip tone={status === 'REPAIRED' ? 'success' : active ? 'warning' : 'neutral'}>
          {status === 'IN_REPAIR' ? 'In repair' : status.charAt(0) + status.slice(1).toLowerCase()}
        </StatusChip>
      }
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2 w-full">
          {active && status === 'OPEN' && (
            <button
              type="button"
              disabled={busy}
              onClick={() => void run(() => onMarkInRepair(damage))}
              className="sq-press px-3 py-2 rounded-lg text-xs font-semibold border border-border/70"
            >
              Mark in repair
            </button>
          )}
          {active && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRequestMarkRepaired(damage)}
              className="sq-cta px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50"
            >
              Mark repaired
            </button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {actionError && (
          <p className="text-[12px] text-red-600 dark:text-red-400 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
            {actionError}
          </p>
        )}

        {rentalBlocked && (
          <div
            className={`rounded-lg border px-3 py-2.5 flex items-start gap-2 ${
              damage.rentalImpact === 'SAFETY_CRITICAL'
                ? 'border-red-500/35 bg-red-500/10'
                : 'border-orange-500/30 bg-orange-500/8'
            }`}
          >
            <Icon name="shield-alert" className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-foreground">
                {damage.rentalImpact === 'SAFETY_CRITICAL'
                  ? 'Safety critical — vehicle must not be rented'
                  : 'Rental blocked until this damage is resolved'}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Create a repair task to track workshop work and clear the rental gate after repair.
              </p>
              {canCreateTask && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onRequestCreateRepairTask(damage)}
                  className="mt-2 sq-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70"
                >
                  <Icon name="wrench" className="w-3.5 h-3.5" />
                  Create repair task
                </button>
              )}
            </div>
          </div>
        )}

        {(damage.taskId || linkedTask) && (
          <section className="rounded-lg border border-sky-500/25 bg-sky-500/5 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-foreground">Repair task linked</p>
                <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                  {linkedTask?.title ?? `Task ${damage.taskId?.slice(0, 8)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {linkedTask?.status && (
                  <StatusChip tone="info">{formatDamageType(linkedTask.status)}</StatusChip>
                )}
                {damage.taskId && onOpenLinkedTask && (
                  <button
                    type="button"
                    onClick={() => onOpenLinkedTask(damage.taskId!)}
                    className="sq-press text-[11px] font-semibold text-primary px-2 py-1 rounded-lg border border-border/70"
                  >
                    Open task
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        <section className="grid grid-cols-2 gap-2">
          <InfoTile label="Severity" value={formatSeverity(damage.severity)} />
          <InfoTile label="Rental impact" value={formatDamageType(damage.rentalImpact)} highlight={damage.rentalImpact !== 'NONE'} />
          <InfoTile label="Evidence" value={formatDamageType(damage.evidenceStatus)} />
          <InfoTile label="Source" value={formatDamageType(damage.source)} />
        </section>

        <section>
          <h4 className="sq-section-label mb-2">Location</h4>
          {placed ? (
            <p className="text-[12px] text-foreground">
              {damage.locationView}
              {damage.locationLabel ? ` · ${damage.locationLabel}` : ''}
              <span className="text-muted-foreground">
                {' '}
                ({damage.locationX?.toFixed(0)}%, {damage.locationY?.toFixed(0)}%)
              </span>
            </p>
          ) : (
            <p className="text-[12px] text-muted-foreground">Position missing — not shown on map.</p>
          )}
        </section>

        {pickupContext && (
          <DamageRentalSections
            damage={damage}
            pickupContext={pickupContext}
            busy={busy}
            onUpdateLiability={onUpdateLiability}
            onPrepareDepositHold={onPrepareDepositHold}
            onPrepareCustomerCharge={onPrepareCustomerCharge}
          />
        )}

        <section>
          <h4 className="sq-section-label mb-2">Evidence photos</h4>
          <AddDamagePhotoPanel
            busy={busy}
            onUpload={async (file, caption) => {
              setActionError(null);
              try {
                await onAddPhoto(damage, file, caption);
              } catch {
                setActionError('Photo upload failed.');
                throw new Error('upload failed');
              }
            }}
          />
          {damage.images.length === 0 ? (
            <p className="text-[12px] text-muted-foreground rounded-lg border border-dashed border-border/70 px-3 py-4 text-center mt-2">
              No photos attached yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-2 mt-2">
              {damage.images.map((img) => (
                <figure key={img.id} className="rounded-lg border border-border/70 overflow-hidden bg-muted/30">
                  <img src={img.url} alt={img.caption ?? 'Damage evidence'} className="w-full h-28 object-cover" />
                  <figcaption className="px-2 py-1 text-[10px] text-muted-foreground truncate">
                    {img.caption || formatDamageDate(img.createdAt) || 'Photo'}
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>

        <section>
          <h4 className="sq-section-label mb-2">Timeline</h4>
          <Timeline items={timeline} />
        </section>

        <section className="flex flex-wrap gap-2 pt-2 border-t border-border/60">
          {!placed && active && (
            <ActionButton icon="map-pin" label="Place on vehicle" disabled={busy} onClick={() => onPlace(damage)} />
          )}
          {canCreateTask && (
            <ActionButton
              icon="wrench"
              label="Create repair task"
              disabled={busy}
              onClick={() => onRequestCreateRepairTask(damage)}
            />
          )}
          {active && status !== 'ARCHIVED' && (
            <ActionButton icon="file-text" label="Archive" disabled={busy} onClick={() => void run(() => onArchive(damage))} />
          )}
        </section>
      </div>
    </DetailDrawer>
  );
}

function InfoTile({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 ${highlight ? 'border-amber-500/30 bg-amber-500/5' : 'border-border/70 bg-muted/20'}`}>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-[12px] font-semibold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="sq-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70 disabled:opacity-50"
    >
      <Icon name={icon} className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}

function buildDamageTimeline(damage: DamageResponse | null): TimelineItem[] {
  if (!damage) return [];
  const items: TimelineItem[] = [
    {
      id: 'created',
      title: 'Damage recorded',
      time: formatDamageDate(damage.reportedAt) ?? undefined,
      tone: 'neutral',
    },
  ];
  damage.images.forEach((img, i) => {
    items.push({
      id: `img-${img.id}`,
      title: i === 0 ? 'Photo added' : 'Additional photo',
      time: formatDamageDate(img.createdAt) ?? undefined,
      tone: 'info',
    });
  });
  if (damage.repairStartedAt) {
    items.push({
      id: 'in-repair',
      title: 'Marked in repair',
      time: formatDamageDate(damage.repairStartedAt) ?? undefined,
      tone: 'warning',
    });
  }
  if (damage.taskId) {
    items.push({
      id: 'task',
      title: 'Repair task linked',
      description: damage.taskId,
      tone: 'info',
    });
  }
  if (damage.repairedAt) {
    items.push({
      id: 'repaired',
      title: 'Marked repaired',
      time: formatDamageDate(damage.repairedAt) ?? undefined,
      description:
        damage.repairCostCents != null
          ? `Actual repair cost: ${formatEuroCents(damage.repairCostCents) ?? '—'}`
          : undefined,
      tone: 'success',
    });
  }
  return items;
}

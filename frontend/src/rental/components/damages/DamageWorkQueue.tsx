import { useMemo } from 'react';
import { DataCard, EmptyState, StatusChip } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { PickupContextResult } from '../../lib/damage-pickup-context';
import { needsLiabilityReview } from '../../lib/damage-pickup-context';
import type { DamageResponse } from '../../lib/damage.types';
import {
  formatDamageDate,
  formatDamageType,
  formatEuroCents,
  formatSeverity,
  hasValidMapPin,
  isActiveDamage,
  normalizeDamageStatus,
} from '../../lib/damage.types';
import {
  filterDamages,
  sortDamagesForQueue,
  type DamageQueueFilter,
} from './damage-control.utils';

const FILTERS: { id: DamageQueueFilter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'blocking', label: 'Blocking' },
  { id: 'missing_evidence', label: 'Missing evidence' },
  { id: 'unplaced', label: 'Unplaced' },
  { id: 'repaired', label: 'Repaired' },
  { id: 'all', label: 'All' },
];

interface DamageWorkQueueProps {
  damages: DamageResponse[];
  filter: DamageQueueFilter;
  onFilterChange: (filter: DamageQueueFilter) => void;
  selectedDamageId: string | null;
  onSelectDamage: (damage: DamageResponse) => void;
  onQuickRepair?: (damage: DamageResponse) => void;
  onQuickCreateTask?: (damage: DamageResponse) => void;
  pickupContextForDamage?: (damage: DamageResponse) => PickupContextResult;
  onAddDamage?: () => void;
  onAnalyzeExteriorPhotos?: () => void;
  analyzeExteriorPhotosEnabled?: boolean;
  analyzeExteriorPhotosDisabledReason?: string;
}

export function DamageWorkQueue({
  damages,
  filter,
  onFilterChange,
  selectedDamageId,
  onSelectDamage,
  onQuickRepair,
  onQuickCreateTask,
  pickupContextForDamage,
  onAddDamage,
  onAnalyzeExteriorPhotos,
  analyzeExteriorPhotosEnabled = false,
  analyzeExteriorPhotosDisabledReason,
}: DamageWorkQueueProps) {
  const rows = useMemo(
    () => sortDamagesForQueue(filterDamages(damages, filter)),
    [damages, filter],
  );

  const emptyCopy = (() => {
    switch (filter) {
      case 'open':
        return { title: 'No active damages', desc: 'This vehicle has no open repair work in the queue.' };
      case 'blocking':
        return { title: 'No blocking damages', desc: 'No active damages currently block rental.' };
      case 'missing_evidence':
        return { title: 'All active damages have evidence', desc: 'Photo evidence is present or not required for active cases.' };
      case 'unplaced':
        return { title: 'All open damages are positioned', desc: 'Every open damage has a map position.' };
      case 'repaired':
        return { title: 'No repaired damages yet', desc: 'Resolved damages will appear here after repair.' };
      default:
        return { title: 'No damages recorded', desc: 'This vehicle has no damage history yet.' };
    }
  })();

  return (
    <DataCard
      title="Damage work queue"
      description="Operational list sorted by rental impact, evidence gaps, and recency."
      actions={
        onAddDamage || onAnalyzeExteriorPhotos ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {onAnalyzeExteriorPhotos && (
              <button
                type="button"
                onClick={onAnalyzeExteriorPhotos}
                disabled={!analyzeExteriorPhotosEnabled}
                title={
                  analyzeExteriorPhotosEnabled
                    ? 'Upload exterior photos for AI-assisted damage suggestions'
                    : analyzeExteriorPhotosDisabledReason
                }
                className="sq-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                Analyze exterior photos
              </button>
            )}
            {onAddDamage && (
              <button
                type="button"
                onClick={onAddDamage}
                className="sq-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold sq-tone-brand"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                Add damage
              </button>
            )}
          </div>
        ) : undefined
      }
      bodyClassName="p-0"
      flush
    >
      <div className="px-3 pt-3 pb-2 border-b border-border/60">
        <div className="flex gap-1.5 overflow-x-auto pb-1 snap-x snap-mandatory">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => onFilterChange(f.id)}
                aria-pressed={active}
                className={`snap-start shrink-0 px-2.5 py-1.5 rounded-full text-[10px] font-semibold transition-colors sq-press ${
                  active ? 'sq-tone-brand' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="max-h-[min(560px,60vh)] overflow-y-auto">
        {rows.length === 0 ? (
          <EmptyState
            compact
            icon={<Icon name="clipboard-check" className="w-5 h-5" />}
            title={emptyCopy.title}
            description={emptyCopy.desc}
            action={
              filter === 'all' && onAddDamage ? (
                <button type="button" onClick={onAddDamage} className="sq-cta px-3 py-2 text-xs font-semibold rounded-lg">
                  Add first damage
                </button>
              ) : undefined
            }
            className="py-10"
          />
        ) : (
          <ul className="divide-y divide-border/60">
            {rows.map((damage) => (
              <DamageQueueRow
                key={damage.id}
                damage={damage}
                selected={selectedDamageId === damage.id}
                onSelect={() => onSelectDamage(damage)}
                onQuickRepair={onQuickRepair}
                onQuickCreateTask={onQuickCreateTask}
                pickupContext={pickupContextForDamage?.(damage)}
              />
            ))}
          </ul>
        )}
      </div>
    </DataCard>
  );
}

function DamageQueueRow({
  damage,
  selected,
  onSelect,
  onQuickRepair,
  onQuickCreateTask,
  pickupContext,
}: {
  damage: DamageResponse;
  selected: boolean;
  onSelect: () => void;
  onQuickRepair?: (damage: DamageResponse) => void;
  onQuickCreateTask?: (damage: DamageResponse) => void;
  pickupContext?: PickupContextResult;
}) {
  const status = normalizeDamageStatus(damage);
  const placed = hasValidMapPin(damage);
  const cost = formatEuroCents(damage.estimatedCostCents);
  const reported = formatDamageDate(damage.reportedAt);
  const canQuickRepair = isActiveDamage(damage) && onQuickRepair;
  const canQuickCreateTask =
    isActiveDamage(damage) &&
    !damage.taskId &&
    (damage.rentalImpact === 'BLOCK_RENTAL' || damage.rentalImpact === 'SAFETY_CRITICAL') &&
    onQuickCreateTask;

  const impactTone =
    damage.rentalImpact === 'SAFETY_CRITICAL' || damage.rentalImpact === 'BLOCK_RENTAL'
      ? 'critical'
      : damage.rentalImpact === 'WATCH'
        ? 'warning'
        : 'neutral';

  return (
    <li>
      <div
        className={`flex items-stretch gap-2 px-3 py-2.5 transition-colors hover:bg-muted/40 ${
          selected ? 'bg-primary/5 ring-1 ring-inset ring-primary/20' : ''
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          className="flex-1 min-w-0 text-left sq-press rounded-lg -m-1 p-1"
        >
          <div className="flex items-start gap-2.5">
            <span
              className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                impactTone === 'critical'
                  ? 'bg-red-500'
                  : impactTone === 'warning'
                    ? 'bg-amber-500'
                    : 'bg-muted-foreground/40'
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold text-foreground truncate">
                  {formatDamageType(damage.damageType)}
                </span>
                <StatusChip tone={status === 'REPAIRED' ? 'success' : status === 'IN_REPAIR' ? 'info' : 'warning'}>
                  {status === 'IN_REPAIR' ? 'In repair' : status.charAt(0) + status.slice(1).toLowerCase()}
                </StatusChip>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span>{placed ? damage.locationLabel || damage.locationView : 'Position missing'}</span>
                <span>{formatDamageType(damage.source)}</span>
                {reported && <span>{reported}</span>}
                {cost && <span className="tabular-nums">{cost}</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <StatusChip tone="neutral">{formatSeverity(damage.severity)}</StatusChip>
                {damage.evidenceStatus === 'MISSING' && (
                  <StatusChip tone="warning" icon={<Icon name="camera" className="w-3 h-3" />}>
                    No photos
                  </StatusChip>
                )}
                {damage.rentalImpact === 'BLOCK_RENTAL' && (
                  <StatusChip tone="critical">Blocks rental</StatusChip>
                )}
                {pickupContext?.label === 'Pre-existing' && (
                  <StatusChip tone="neutral">Pre-existing</StatusChip>
                )}
                {pickupContext?.label === 'New since pickup' && (
                  <StatusChip tone="warning">New since pickup</StatusChip>
                )}
                {pickupContext?.context === 'NEEDS_REVIEW' && (
                  <StatusChip tone="warning">Needs review</StatusChip>
                )}
                {needsLiabilityReview(damage) && (
                  <StatusChip tone="warning">Needs liability review</StatusChip>
                )}
                {damage.liabilityStatus === 'DISPUTED' && (
                  <StatusChip tone="critical">Disputed</StatusChip>
                )}
                {damage.rentalImpact === 'SAFETY_CRITICAL' && (
                  <StatusChip tone="critical">Safety</StatusChip>
                )}
                {damage.taskId && (
                  <StatusChip tone="info" icon={<Icon name="wrench" className="w-3 h-3" />}>
                    Task linked
                  </StatusChip>
                )}
              </div>
            </div>
          </div>
        </button>
        <div className="flex flex-col gap-1 shrink-0 self-center">
        {canQuickCreateTask && (
          <button
            type="button"
            title="Create repair task"
            aria-label="Create repair task"
            onClick={(e) => {
              e.stopPropagation();
              onQuickCreateTask!(damage);
            }}
            className="sq-press p-2 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <Icon name="wrench" className="w-4 h-4" />
          </button>
        )}
        {canQuickRepair && (
          <button
            type="button"
            title="Mark repaired"
            aria-label="Mark repaired"
            onClick={(e) => {
              e.stopPropagation();
              onQuickRepair(damage);
            }}
            className="sq-press p-2 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/60"
          >
            <Icon name="check-circle-2" className="w-4 h-4" />
          </button>
        )}
        </div>
      </div>
    </li>
  );
}

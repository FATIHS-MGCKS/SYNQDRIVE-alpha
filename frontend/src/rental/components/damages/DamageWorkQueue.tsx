import { useMemo } from 'react';
import { DataCard, EmptyState, StatusChip } from '../../../components/patterns';
import { useLanguage } from '../../../i18n/LanguageContext';
import { Icon } from '../ui/Icon';
import type { PickupContextResult } from '../../lib/damage-pickup-context';
import { needsLiabilityReview } from '../../lib/damage-pickup-context';
import type { DamageResponse } from '../../lib/damage.types';
import { hasValidMapPin, isActiveDamage, normalizeDamageStatus } from '../../lib/damage.types';
import {
  formatDamageDateLocale,
  formatDamageEuroCents,
  resolveDamagePickupContextLabel,
  resolveDamageQueueFilterLabel,
  resolveDamageSeverityLabel,
  resolveDamageSourceLabel,
  resolveDamageStatusLabel,
  resolveDamageTypeLabel,
  resolveDamageLocationViewLabel,
} from '../../lib/rental-vehicle-damages-i18n';
import {
  filterDamages,
  sortDamagesForQueue,
  type DamageQueueFilter,
} from './damage-control.utils';

const FILTERS: DamageQueueFilter[] = [
  'open',
  'blocking',
  'missing_evidence',
  'unplaced',
  'repaired',
  'all',
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
  const { t, locale } = useLanguage();
  const rows = useMemo(
    () => sortDamagesForQueue(filterDamages(damages, filter)),
    [damages, filter],
  );

  const emptyCopy = (() => {
    switch (filter) {
      case 'open':
        return {
          title: t('vehicleDamages.queue.empty.open.title'),
          desc: t('vehicleDamages.queue.empty.open.description'),
        };
      case 'blocking':
        return {
          title: t('vehicleDamages.queue.empty.blocking.title'),
          desc: t('vehicleDamages.queue.empty.blocking.description'),
        };
      case 'missing_evidence':
        return {
          title: t('vehicleDamages.queue.empty.missing_evidence.title'),
          desc: t('vehicleDamages.queue.empty.missing_evidence.description'),
        };
      case 'unplaced':
        return {
          title: t('vehicleDamages.queue.empty.unplaced.title'),
          desc: t('vehicleDamages.queue.empty.unplaced.description'),
        };
      case 'repaired':
        return {
          title: t('vehicleDamages.queue.empty.repaired.title'),
          desc: t('vehicleDamages.queue.empty.repaired.description'),
        };
      default:
        return {
          title: t('vehicleDamages.queue.empty.all.title'),
          desc: t('vehicleDamages.queue.empty.all.description'),
        };
    }
  })();

  return (
    <DataCard
      title={t('vehicleDamages.queue.title')}
      description={t('vehicleDamages.queue.description')}
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
                    ? t('vehicleDamages.queue.analyzeExteriorPhotosTitle')
                    : analyzeExteriorPhotosDisabledReason
                }
                className="sq-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border border-border/70 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Icon name="sparkles" className="w-3.5 h-3.5" />
                {t('vehicleDamages.queue.analyzeExteriorPhotos')}
              </button>
            )}
            {onAddDamage && (
              <button
                type="button"
                onClick={onAddDamage}
                className="sq-press inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold sq-tone-brand"
              >
                <Icon name="plus" className="w-3.5 h-3.5" />
                {t('vehicleDamages.queue.addDamage')}
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
          {FILTERS.map((filterId) => {
            const active = filter === filterId;
            return (
              <button
                key={filterId}
                type="button"
                onClick={() => onFilterChange(filterId)}
                aria-pressed={active}
                className={`snap-start shrink-0 px-2.5 py-1.5 rounded-full text-[10px] font-semibold transition-colors sq-press ${
                  active ? 'sq-tone-brand' : 'bg-muted/60 text-muted-foreground hover:bg-muted'
                }`}
              >
                {resolveDamageQueueFilterLabel(t, filterId)}
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
                  {t('vehicleDamages.queue.addFirstDamage')}
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
  const { t, locale } = useLanguage();
  const status = normalizeDamageStatus(damage);
  const placed = hasValidMapPin(damage);
  const cost = formatDamageEuroCents(locale, damage.estimatedCostCents);
  const reported = formatDamageDateLocale(locale, damage.reportedAt);
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

  const pickupLabel =
    pickupContext?.label && pickupContext.context !== 'NOT_APPLICABLE'
      ? resolveDamagePickupContextLabel(t, pickupContext.context)
      : null;

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
                  {resolveDamageTypeLabel(t, damage.damageType)}
                </span>
                <StatusChip tone={status === 'REPAIRED' ? 'success' : status === 'IN_REPAIR' ? 'info' : 'warning'}>
                  {status === 'IN_REPAIR'
                    ? t('vehicleDamages.queue.status.inRepair')
                    : resolveDamageStatusLabel(t, status)}
                </StatusChip>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span>
                  {placed
                    ? damage.locationLabel || resolveDamageLocationViewLabel(t, damage.locationView)
                    : t('vehicleDamages.queue.positionMissing')}
                </span>
                <span>{resolveDamageSourceLabel(t, damage.source)}</span>
                {reported && <span>{reported}</span>}
                {cost && <span className="tabular-nums">{cost}</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                <StatusChip tone="neutral">{resolveDamageSeverityLabel(t, damage.severity)}</StatusChip>
                {damage.evidenceStatus === 'MISSING' && (
                  <StatusChip tone="warning" icon={<Icon name="camera" className="w-3 h-3" />}>
                    {t('vehicleDamages.queue.chip.noPhotos')}
                  </StatusChip>
                )}
                {damage.rentalImpact === 'BLOCK_RENTAL' && (
                  <StatusChip tone="critical">{t('vehicleDamages.queue.chip.blocksRental')}</StatusChip>
                )}
                {pickupContext?.context === 'PRE_EXISTING' && pickupLabel && (
                  <StatusChip tone="neutral">{pickupLabel}</StatusChip>
                )}
                {pickupContext?.context === 'NEW_SINCE_PICKUP' && pickupLabel && (
                  <StatusChip tone="warning">{pickupLabel}</StatusChip>
                )}
                {pickupContext?.context === 'NEEDS_REVIEW' && (
                  <StatusChip tone="warning">{pickupLabel}</StatusChip>
                )}
                {needsLiabilityReview(damage) && (
                  <StatusChip tone="warning">{t('vehicleDamages.queue.chip.needsLiabilityReview')}</StatusChip>
                )}
                {damage.liabilityStatus === 'DISPUTED' && (
                  <StatusChip tone="critical">{t('vehicleDamages.queue.chip.disputed')}</StatusChip>
                )}
                {damage.rentalImpact === 'SAFETY_CRITICAL' && (
                  <StatusChip tone="critical">{t('vehicleDamages.queue.chip.safety')}</StatusChip>
                )}
                {damage.taskId && (
                  <StatusChip tone="info" icon={<Icon name="wrench" className="w-3 h-3" />}>
                    {t('vehicleDamages.queue.chip.taskLinked')}
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
            title={t('vehicleDamages.queue.quickCreateTask')}
            aria-label={t('vehicleDamages.queue.quickCreateTask')}
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
            title={t('vehicleDamages.queue.quickMarkRepaired')}
            aria-label={t('vehicleDamages.queue.quickMarkRepaired')}
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

import { StatusChip } from '../../../components/patterns';
import { Icon } from '../ui/Icon';
import type { DamageControlStats } from './damage-control.utils';
import { formatEstimatedOpenCost, formatOldestOpenAge } from './damage-control.utils';
import {
  DAMAGE_SUMMARY_COPY,
  damageRentalContextLine,
  damageStatusBadge,
  damageStatusSubtitle,
  damageStatusSurfaceTone,
} from './damage-summary-display';

interface DamageControlSummaryProps {
  stats: DamageControlStats;
  onCreateRepairTask?: () => void;
  createRepairTaskBusy?: boolean;
  showRepairTaskCta?: boolean;
}

function DamageKpiTile({
  label,
  value,
  hint,
  accent = 'default',
  subdued = false,
}: {
  label: string;
  value: string | number;
  hint?: string;
  accent?: 'default' | 'watch' | 'critical' | 'muted';
  subdued?: boolean;
}) {
  const valueClass =
    accent === 'critical'
      ? 'text-[color:var(--status-critical)]'
      : accent === 'watch'
        ? 'text-amber-600 dark:text-amber-400'
        : accent === 'muted' || subdued
          ? 'text-muted-foreground'
          : 'text-foreground';

  return (
    <div className="damage-kpi-tile min-w-0">
      <p className="damage-kpi-tile__label">{label}</p>
      <p
        className={`damage-kpi-tile__value tabular-nums ${subdued ? 'damage-kpi-tile__value--subdued' : ''} ${valueClass}`}
      >
        {value}
      </p>
      {hint ? <p className="damage-kpi-tile__hint">{hint}</p> : null}
    </div>
  );
}

const SURFACE_CLASS = {
  success: 'border-emerald-500/20 bg-emerald-500/5',
  warning: 'border-amber-500/25 bg-amber-500/5',
  critical: 'border-red-500/30 bg-red-500/8',
} as const;

const ICON_SURFACE = {
  success: 'sq-tone-success',
  warning: 'sq-tone-warning',
  critical: 'sq-tone-critical',
} as const;

export function DamageControlSummary({
  stats,
  onCreateRepairTask,
  createRepairTaskBusy,
  showRepairTaskCta,
}: DamageControlSummaryProps) {
  const oldest = formatOldestOpenAge(stats.oldestOpenDamageAt);
  const surfaceTone = damageStatusSurfaceTone(stats);
  const badge = damageStatusBadge(stats);
  const subtitle = damageStatusSubtitle(stats);
  const rentalContext = damageRentalContextLine(stats);
  const costLabel = formatEstimatedOpenCost(stats.estimatedOpenCostCents);
  const costSubdued = stats.estimatedOpenCostCents <= 0;
  const oldestSubdued = !oldest;

  const showRepairCta =
    showRepairTaskCta &&
    onCreateRepairTask &&
    (stats.blockingRental > 0 || stats.safetyCritical > 0);

  return (
    <div className="space-y-2.5">
      <div
        className={`surface-premium sq-card flex flex-col gap-2.5 rounded-2xl border px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-3.5 ${SURFACE_CLASS[surfaceTone]}`}
      >
        <div className="flex min-w-0 items-start gap-2.5">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${ICON_SURFACE[surfaceTone]}`}
          >
            <Icon
              name={
                surfaceTone === 'critical'
                  ? 'shield-alert'
                  : surfaceTone === 'warning'
                    ? 'alert-triangle'
                    : 'check-circle-2'
              }
              className="h-4 w-4"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] font-semibold tracking-[-0.01em] text-foreground sm:text-[13px]">
              {DAMAGE_SUMMARY_COPY.statusTitle}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{subtitle}</p>
            {rentalContext ? (
              <p className="mt-1 text-[10.5px] leading-snug text-muted-foreground/90">
                {rentalContext}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5 sm:justify-end">
          <StatusChip tone={badge.tone}>{badge.label}</StatusChip>
          {showRepairCta ? (
            <button
              type="button"
              disabled={createRepairTaskBusy}
              onClick={onCreateRepairTask}
              className="sq-cta inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10.5px] font-semibold disabled:opacity-50 sm:text-[11px]"
            >
              <Icon name="wrench" className="h-3.5 w-3.5" />
              {createRepairTaskBusy ? 'Creating…' : 'Create repair task'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
        <DamageKpiTile
          label={DAMAGE_SUMMARY_COPY.kpi.open}
          value={stats.open}
          hint={DAMAGE_SUMMARY_COPY.kpiHint.open}
          accent={stats.open > 0 ? 'watch' : 'muted'}
          subdued={stats.open === 0}
        />
        <DamageKpiTile
          label={DAMAGE_SUMMARY_COPY.kpi.blocking}
          value={stats.blockingRental}
          hint={DAMAGE_SUMMARY_COPY.kpiHint.blocking}
          accent={stats.blockingRental > 0 ? 'critical' : 'muted'}
          subdued={stats.blockingRental === 0}
        />
        <DamageKpiTile
          label={DAMAGE_SUMMARY_COPY.kpi.safetyCritical}
          value={stats.safetyCritical}
          hint={DAMAGE_SUMMARY_COPY.kpiHint.safetyCritical}
          accent={stats.safetyCritical > 0 ? 'critical' : 'muted'}
          subdued={stats.safetyCritical === 0}
        />
        <DamageKpiTile
          label={DAMAGE_SUMMARY_COPY.kpi.missingEvidence}
          value={stats.missingEvidence}
          hint={DAMAGE_SUMMARY_COPY.kpiHint.missingEvidence}
          accent={stats.missingEvidence > 0 ? 'watch' : 'muted'}
          subdued={stats.missingEvidence === 0}
        />
        <DamageKpiTile
          label={DAMAGE_SUMMARY_COPY.kpi.unplaced}
          value={stats.unplaced}
          hint={DAMAGE_SUMMARY_COPY.kpiHint.unplaced}
          accent={stats.unplaced > 0 ? 'watch' : 'muted'}
          subdued={stats.unplaced === 0}
        />
        <DamageKpiTile
          label={DAMAGE_SUMMARY_COPY.kpi.estimatedCost}
          value={costLabel}
          hint={DAMAGE_SUMMARY_COPY.kpiHint.estimatedCost}
          accent="muted"
          subdued={costSubdued}
        />
        <DamageKpiTile
          label={DAMAGE_SUMMARY_COPY.kpi.oldestCase}
          value={oldest ?? '—'}
          hint={DAMAGE_SUMMARY_COPY.kpiHint.oldestCase}
          accent={oldest && oldest !== 'Today' ? 'watch' : 'muted'}
          subdued={oldestSubdued}
        />
      </div>
    </div>
  );
}

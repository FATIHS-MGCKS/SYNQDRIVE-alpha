import { Icon } from '../ui/Icon';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { DashboardRuntimeModel, DashboardSlice, DashboardSliceId } from './runtime';
import type { DataFreshnessSummary } from './dashboardTypes';

interface ControlKpiStripProps {
  dashboardRuntime: DashboardRuntimeModel;
  activeSliceId?: DashboardSliceId | null;
  onSelectSlice: (sliceId: DashboardSliceId) => void;
  embedded?: boolean;
  locale?: string;
  dataFreshness?: DataFreshnessSummary;
}

/**
 * Canonical render order of the six operational KPI boxes. The strip renders
 * strictly from `dashboardRuntime.slices` — no legacy `controlCenterKpis`
 * adapter, no `OperationalKpiTarget`, no `maintenance` KPI id.
 */
const KPI_ORDER: DashboardSliceId[] = [
  'ready-to-rent',
  'active-rented',
  'due-soon',
  'overdue-returns',
  'blocked-maintenance',
  'critical-alerts',
];

const KPI_ICONS: Record<DashboardSliceId, string> = {
  'ready-to-rent': 'check-circle',
  'active-rented': 'car',
  'due-soon': 'clock',
  'overdue-returns': 'alert-triangle',
  'blocked-maintenance': 'wrench',
  'critical-alerts': 'shield-alert',
};

/** Slices where a zero count is the calm, positive state. */
const ZERO_IS_POSITIVE = new Set<DashboardSliceId>([
  'overdue-returns',
  'blocked-maintenance',
  'critical-alerts',
]);

function kpiGridClass(embedded: boolean): string {
  return embedded
    ? 'grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 md:grid-cols-3 2xl:grid-cols-6'
    : 'grid grid-cols-2 items-stretch gap-1.5 md:grid-cols-3 xl:grid-cols-6';
}

interface KpiVisualState {
  isCritical: boolean;
  isWatch: boolean;
  isSuccess: boolean;
  isCalmZero: boolean;
}

function kpiVisualState(slice: DashboardSlice): KpiVisualState {
  const count = slice.count ?? 0;
  const isCalmZero = ZERO_IS_POSITIVE.has(slice.id) && slice.count === 0;
  return {
    isCritical: slice.tone === 'critical' && count > 0,
    isWatch: slice.tone === 'watch' && count > 0,
    isSuccess: slice.tone === 'success',
    isCalmZero,
  };
}

function kpiCardClass(slice: DashboardSlice, embedded: boolean, isActive: boolean): string {
  const { isCritical, isWatch, isSuccess, isCalmZero } = kpiVisualState(slice);

  return cn(
    'sq-press group relative overflow-hidden border text-left transition-colors duration-200',
    'hover:border-border/60 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
    embedded
      ? 'min-h-[112px] rounded-2xl bg-background/40 px-3 py-3'
      : 'min-h-[96px] rounded-lg bg-card/55 px-2.5 py-2',
    isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
    isWatch && 'border-[color:var(--status-watch)]/30 bg-card/55',
    (isSuccess || isCalmZero) && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.025]',
    !isCritical && !isWatch && !isSuccess && !isCalmZero && 'border-border/45',
    isActive && 'ring-2 ring-[color:var(--brand)]/55',
  );
}

function kpiIconToneClass(slice: DashboardSlice): string {
  const count = slice.count ?? 0;
  if (slice.tone === 'critical' && count > 0) return 'sq-tone-critical';
  if (slice.tone === 'success') return 'sq-tone-success';
  if (slice.tone === 'watch' && count > 0) return 'sq-tone-watch';
  if (slice.tone === 'info') return 'sq-tone-info';
  return 'bg-muted text-muted-foreground';
}

export function ControlKpiStrip({
  dashboardRuntime,
  activeSliceId,
  onSelectSlice,
  embedded = false,
  dataFreshness,
}: ControlKpiStripProps) {
  const loading = dataFreshness
    ? !dataFreshness.todayBookingsLoaded || dataFreshness.fleetLoading
    : false;

  if (loading) {
    return (
      <SkeletonMetricGrid
        count={6}
        className={cn(
          '!grid-cols-2',
          embedded ? 'gap-3 sm:gap-3.5 md:!grid-cols-3 2xl:!grid-cols-6' : 'md:!grid-cols-3 xl:!grid-cols-6',
        )}
        cardClassName={embedded ? 'min-h-[112px] rounded-2xl bg-background/40 p-3' : undefined}
      />
    );
  }

  return (
    <div className={kpiGridClass(embedded)}>
      {KPI_ORDER.map((id) => {
        const slice = dashboardRuntime.slices[id];
        const disabled = slice.count === null;
        const displayValue = disabled ? '—' : String(slice.count);
        const { isCritical, isSuccess } = kpiVisualState(slice);
        const isActive = activeSliceId === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (!disabled) onSelectSlice(id);
            }}
            disabled={disabled}
            className={cn(kpiCardClass(slice, embedded, isActive), disabled && 'cursor-not-allowed opacity-60')}
            aria-label={`${slice.title}: ${displayValue}`}
            aria-pressed={isActive}
          >
            <div className="flex h-full items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
                  {slice.title}
                </p>
                <p
                  className={cn(
                    'mt-1 text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]',
                    disabled && 'text-muted-foreground',
                    isCritical && 'text-[color:var(--status-critical)]',
                    isSuccess && 'text-[color:var(--status-positive)]',
                  )}
                >
                  {displayValue}
                </p>
                {slice.hint && (
                  <p className="mt-1 truncate text-[10px] leading-snug text-muted-foreground">{slice.hint}</p>
                )}
              </div>
              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
                  kpiIconToneClass(slice),
                )}
              >
                <Icon name={KPI_ICONS[id] as 'car'} className="h-3 w-3" />
              </div>
            </div>
            {isCritical && (
              <span
                className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-critical)]"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

import { Icon } from '../ui/Icon';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { resolveReadyForRentingKpiCounts } from './dashboardSliceAccess';
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

function readyKpiLabels(locale?: string) {
  const de = locale === 'de';
  return {
    vehiclesReady: de ? 'Fahrzeuge bereit' : 'vehicles ready',
    available: de ? 'Verfügbar' : 'Available',
    notReady: de ? 'Nicht bereit' : 'Not ready',
  };
}

function formatKpiCount(value: number | null, disabled: boolean): string {
  if (disabled || value === null) return '—';
  return String(value);
}

interface ReadyForRentingKpiContentProps {
  slice: DashboardSlice;
  disabled: boolean;
  locale?: string;
}

function ReadyForRentingKpiContent({ slice, disabled, locale }: ReadyForRentingKpiContentProps) {
  const labels = readyKpiLabels(locale);
  const { readyCount, availableCount, notReadyCount } = resolveReadyForRentingKpiCounts(slice);
  const { isSuccess } = kpiVisualState(slice);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2">
        <p className="min-w-0 truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
          {slice.title}
        </p>
        <div
          className={cn(
            'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
            kpiIconToneClass(slice),
          )}
        >
          <Icon name="check-circle" className="h-3 w-3" />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-1 pt-2 pb-1 text-center">
        <p
          className={cn(
            'text-[42px] font-semibold tabular-nums leading-none tracking-[-0.03em] sm:text-[44px]',
            disabled && 'text-muted-foreground',
            !disabled && isSuccess && 'text-[color:var(--status-positive)]',
            !disabled && !isSuccess && 'text-foreground',
          )}
        >
          {formatKpiCount(readyCount, disabled)}
        </p>
        <p className="mt-2 text-[14px] font-medium leading-tight text-muted-foreground">{labels.vehiclesReady}</p>
      </div>

      <div
        className="mx-1.5 shrink-0 border-t border-[color:var(--status-positive)]/15"
        role="separator"
        aria-hidden
      />

      <div className="relative mt-2.5 grid shrink-0 grid-cols-2 items-end">
        <div className="min-w-0 text-center">
          <p className="text-[13px] font-medium leading-tight text-muted-foreground">{labels.available}</p>
          <p className="mt-0.5 text-[26px] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
            {formatKpiCount(availableCount, disabled)}
          </p>
        </div>
        <div className="min-w-0 text-center">
          <p className="text-[13px] font-medium leading-tight text-muted-foreground">{labels.notReady}</p>
          <p className="mt-0.5 text-[26px] font-semibold tabular-nums leading-none tracking-[-0.02em] text-foreground">
            {formatKpiCount(notReadyCount, disabled)}
          </p>
        </div>
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 h-9 w-px -translate-x-1/2 -translate-y-1/2 bg-border/35"
          aria-hidden
        />
      </div>
    </div>
  );
}

export function ControlKpiStrip({
  dashboardRuntime,
  activeSliceId,
  onSelectSlice,
  embedded = false,
  locale,
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
        const isReadyCard = id === 'ready-to-rent';
        const readyCounts = isReadyCard ? resolveReadyForRentingKpiCounts(slice) : null;

        return (
          <button
            key={id}
            type="button"
            onClick={() => {
              if (!disabled) onSelectSlice(id);
            }}
            disabled={disabled}
            className={cn(
              kpiCardClass(slice, embedded, isActive),
              isReadyCard && embedded && 'min-h-[156px]',
              isReadyCard && !embedded && 'min-h-[132px]',
              disabled && 'cursor-not-allowed opacity-60',
            )}
            aria-label={
              isReadyCard && readyCounts
                ? `${slice.title}: ${formatKpiCount(readyCounts.readyCount, disabled)} ready, ${formatKpiCount(readyCounts.availableCount, disabled)} available, ${formatKpiCount(readyCounts.notReadyCount, disabled)} not ready`
                : `${slice.title}: ${displayValue}`
            }
            aria-pressed={isActive}
          >
            {isReadyCard ? (
              <ReadyForRentingKpiContent slice={slice} disabled={disabled} locale={locale} />
            ) : (
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
            )}
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

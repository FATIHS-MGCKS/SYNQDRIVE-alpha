import { Icon } from '../ui/Icon';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { DataTrustHint } from './DataTrustHint';
import type { ControlCenterKpi, DashboardViewModel, OperationalKpiTarget } from './dashboardTypes';

interface ControlKpiStripProps {
  vm: DashboardViewModel;
  embedded?: boolean;
}

const KPI_ICONS: Record<OperationalKpiTarget, string> = {
  'ready-to-rent': 'check-circle',
  'active-rented': 'car',
  'due-soon': 'clock',
  'overdue-returns': 'alert-triangle',
  maintenance: 'wrench',
  'critical-alerts': 'shield-alert',
};

const ZERO_IS_POSITIVE = new Set<OperationalKpiTarget>([
  'overdue-returns',
  'maintenance',
  'critical-alerts',
]);

function kpiGridClass(embedded: boolean): string {
  return embedded
    ? 'grid grid-cols-2 items-stretch gap-3 sm:gap-3.5 md:grid-cols-3 2xl:grid-cols-6'
    : 'grid grid-cols-2 items-stretch gap-1.5 md:grid-cols-3 xl:grid-cols-6';
}

function kpiCardClass(kpi: ControlCenterKpi, embedded: boolean): string {
  const count = kpi.numericValue ?? 0;
  const isCalmZero = (kpi.zeroIsPositive || ZERO_IS_POSITIVE.has(kpi.id)) && kpi.numericValue === 0;
  const isCritical = kpi.tone === 'critical' && count > 0;
  const isWatch = (kpi.tone === 'watch' || kpi.tone === 'warning') && count > 0;
  const isSuccess = kpi.tone === 'success';

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
  );
}

function kpiIconToneClass(kpi: ControlCenterKpi): string {
  const count = kpi.numericValue ?? 0;
  if (kpi.tone === 'critical' && count > 0) return 'sq-tone-critical';
  if (kpi.tone === 'success') return 'sq-tone-success';
  if ((kpi.tone === 'watch' || kpi.tone === 'warning') && count > 0) return 'sq-tone-watch';
  if (kpi.tone === 'info') return 'sq-tone-info';
  return 'bg-muted text-muted-foreground';
}

export function ControlKpiStrip({ vm, embedded = false }: ControlKpiStripProps) {
  const { activateKpiTarget, controlCenterKpis, dataFreshness, locale } = vm;
  const loading = !dataFreshness.todayBookingsLoaded || dataFreshness.fleetLoading;

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
      {controlCenterKpis.map((kpi) => {
        const disabled = kpi.numericValue === null;
        const displayValue = disabled ? '—' : kpi.displayValue;
        const isCritical = kpi.tone === 'critical' && (kpi.numericValue ?? 0) > 0;
        const isSuccess = kpi.tone === 'success';
        return (
          <button
            key={kpi.id}
            type="button"
            onClick={() => {
              if (!disabled) activateKpiTarget(kpi.id);
            }}
            disabled={disabled}
            className={cn(kpiCardClass(kpi, embedded), disabled && 'cursor-not-allowed opacity-60')}
            aria-label={`${kpi.label}: ${displayValue}`}
          >
            <div className="flex h-full items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
                  {kpi.label}
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
                {kpi.hint && (
                  <p className="mt-1 truncate text-[10px] leading-snug text-muted-foreground">{kpi.hint}</p>
                )}
                <DataTrustHint hint={kpi.trustHint} locale={locale} className="mt-0.5 text-[10px]" />
              </div>
              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
                  kpiIconToneClass(kpi),
                )}
              >
                <Icon name={KPI_ICONS[kpi.id] as 'car'} className="h-3 w-3" />
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

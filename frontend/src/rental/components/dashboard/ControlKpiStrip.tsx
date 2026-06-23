import { Icon } from '../ui/Icon';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { DataTrustHint } from './DataTrustHint';
import type { ControlCenterKpi, DashboardViewModel } from './dashboardTypes';

interface ControlKpiStripProps {
  vm: DashboardViewModel;
}

const KPI_ICONS: Record<ControlCenterKpi['id'], string> = {
  'ready-to-rent': 'check-circle',
  'active-rented': 'car',
  'due-soon': 'clock',
  'overdue-returns': 'alert-triangle',
  maintenance: 'wrench',
  'critical-alerts': 'shield-alert',
};

function kpiCardClass(kpi: ControlCenterKpi): string {
  const isCalmZero = kpi.zeroIsPositive && kpi.numericValue === 0;
  const isCritical = kpi.tone === 'critical' && (kpi.numericValue ?? 0) > 0;
  const isWatch = kpi.tone === 'watch' && (kpi.numericValue ?? 0) > 0;

  return cn(
    'sq-press group relative min-h-[96px] overflow-hidden rounded-lg border bg-card/55 px-2.5 py-2 text-left transition-colors duration-200',
    'hover:border-border/60 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
    isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.035]',
    isWatch && 'border-[color:var(--status-watch)]/30 bg-card/55',
    isCalmZero && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.025]',
    !isCritical && !isWatch && !isCalmZero && 'border-border/45',
  );
}

export function ControlKpiStrip({ vm }: ControlKpiStripProps) {
  const { controlCenterKpis, activateKpiTarget, dataFreshness } = vm;
  const loading = !dataFreshness.todayBookingsLoaded || dataFreshness.fleetLoading;

  if (loading) {
    return <SkeletonMetricGrid count={6} className="!grid-cols-2 md:!grid-cols-3 xl:!grid-cols-6" />;
  }

  return (
    <div className="grid grid-cols-2 gap-1.5 md:grid-cols-3 xl:grid-cols-6">
      {controlCenterKpis.map((kpi) => (
        <button
          key={kpi.id}
          type="button"
          onClick={() => activateKpiTarget(kpi.id)}
          className={kpiCardClass(kpi)}
          aria-label={`${kpi.label}: ${kpi.displayValue}`}
        >
          <div className="flex h-full items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
                {kpi.label}
              </p>
              <p
                className={cn(
                  'mt-1 text-[21px] font-semibold tabular-nums leading-none tracking-[-0.03em]',
                  kpi.numericValue == null && 'text-muted-foreground',
                  kpi.tone === 'critical' && (kpi.numericValue ?? 0) > 0 && 'text-[color:var(--status-critical)]',
                  kpi.tone === 'success' && kpi.zeroIsPositive && kpi.numericValue === 0 && 'text-[color:var(--status-positive)]',
                )}
              >
                {kpi.displayValue}
              </p>
              {kpi.hint && (
                <p className="mt-1 truncate text-[10px] leading-snug text-muted-foreground">{kpi.hint}</p>
              )}
              <DataTrustHint hint={kpi.trustHint} locale={vm.locale} className="mt-0.5 text-[10px]" />
            </div>
            <div
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors',
                kpi.tone === 'critical' && (kpi.numericValue ?? 0) > 0
                  ? 'sq-tone-critical'
                  : kpi.tone === 'success'
                    ? 'sq-tone-success'
                    : kpi.tone === 'watch'
                      ? 'sq-tone-watch'
                      : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon name={KPI_ICONS[kpi.id] as 'car'} className="h-3 w-3" />
            </div>
          </div>
          {(kpi.numericValue ?? 0) > 0 && kpi.tone === 'critical' && (
            <span
              className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-[color:var(--status-critical)]"
              aria-hidden
            />
          )}
        </button>
      ))}
    </div>
  );
}

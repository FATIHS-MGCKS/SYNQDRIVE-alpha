import { Icon } from '../ui/Icon';
import { StatusChip } from '../../../components/patterns';
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
    'sq-card sq-press group relative overflow-hidden rounded-xl border p-3 text-left transition-all duration-200',
    'hover:-translate-y-px hover:shadow-[var(--shadow-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]',
    isCritical && 'border-[color:var(--status-critical)]/35 bg-[color:var(--status-critical)]/[0.04]',
    isWatch && 'border-[color:var(--status-watch)]/30',
    isCalmZero && 'border-[color:var(--status-positive)]/25 bg-[color:var(--status-positive)]/[0.03]',
    !isCritical && !isWatch && !isCalmZero && 'border-border/60',
  );
}

export function ControlKpiStrip({ vm }: ControlKpiStripProps) {
  const { controlCenterKpis, activateKpiTarget, dataFreshness } = vm;
  const loading = !dataFreshness.todayBookingsLoaded || dataFreshness.fleetLoading;

  if (loading) {
    return <SkeletonMetricGrid count={6} className="!grid-cols-2 md:!grid-cols-3 xl:!grid-cols-6" />;
  }

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
      {controlCenterKpis.map((kpi) => (
        <button
          key={kpi.id}
          type="button"
          onClick={() => activateKpiTarget(kpi.id)}
          className={kpiCardClass(kpi)}
          aria-label={`${kpi.label}: ${kpi.displayValue}`}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold tracking-[-0.01em] text-muted-foreground">                {kpi.label}
              </p>
              <p
                className={cn(
                  'mt-1 text-xl font-bold tabular-nums leading-none tracking-[-0.03em]',
                  kpi.numericValue == null && 'text-muted-foreground',
                  kpi.tone === 'critical' && (kpi.numericValue ?? 0) > 0 && 'text-[color:var(--status-critical)]',
                  kpi.tone === 'success' && kpi.zeroIsPositive && kpi.numericValue === 0 && 'text-[color:var(--status-positive)]',
                )}
              >
                {kpi.displayValue}
              </p>
              {kpi.hint && (
                <p className="mt-1.5 truncate text-[10px] text-muted-foreground">{kpi.hint}</p>
              )}
              <DataTrustHint hint={kpi.trustHint} locale={vm.locale} className="mt-1" />
            </div>
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                kpi.tone === 'critical' && (kpi.numericValue ?? 0) > 0
                  ? 'sq-tone-critical'
                  : kpi.tone === 'success'
                    ? 'sq-tone-success'
                    : kpi.tone === 'watch'
                      ? 'sq-tone-watch'
                      : 'bg-muted text-muted-foreground',
              )}
            >
              <Icon name={KPI_ICONS[kpi.id] as 'car'} className="h-3.5 w-3.5" />
            </div>
          </div>
          {(kpi.numericValue ?? 0) > 0 && kpi.tone === 'critical' && (
            <StatusChip tone="critical" className="absolute right-2 top-2 text-[8px]">
              !
            </StatusChip>
          )}
        </button>
      ))}
    </div>
  );
}

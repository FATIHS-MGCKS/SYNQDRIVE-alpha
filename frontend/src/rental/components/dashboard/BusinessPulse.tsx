import { Icon } from '../ui/Icon';
import { StatusChip, SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { BusinessPulseDrilldown, BusinessPulseMetricItem } from './businessPulseBuilder';
import { DataTrustHint } from './DataTrustHint';
import { sectionTrustHint } from './dataTrustBuilder';
import { DashboardPanelHeader, PANEL_BODY_CLASS, panelShellClass } from './dashboardShell';
import type { DashboardViewModel } from './dashboardTypes';

interface BusinessPulseProps {
  vm: DashboardViewModel;
  onOpenFinanceView?: (view: BusinessPulseDrilldown) => void;
}

function PulseMetric({
  metric,
  de,
  vm,
}: {
  metric: BusinessPulseMetricItem;
  de: boolean;
  vm: DashboardViewModel;
}) {
  const clickable = !metric.unavailable;
  const Wrapper = clickable ? 'button' : 'div';

  return (
    <Wrapper
      type={clickable ? 'button' : undefined}
      onClick={
        clickable
          ? () => vm.openDrilldown({ type: 'business-metric', metricId: metric.id })
          : undefined
      }
      className={[
        'rounded-xl border border-border/50 bg-card/30 px-3 py-2.5 text-left transition-colors duration-150',
        clickable
          ? 'sq-press min-h-11 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]'
          : '',
        metric.unavailable ? 'opacity-70' : '',
      ].join(' ')}    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium text-muted-foreground">{metric.label}</p>        {metric.trend && !metric.unavailable ? (
          <span
            className={[
              'text-[9px] font-semibold tabular-nums',
              metric.trend.invert
                ? metric.trend.direction === 'up'
                  ? 'text-[color:var(--status-critical)]'
                  : 'text-[color:var(--status-success)]'
                : metric.trend.direction === 'up'
                  ? 'text-[color:var(--status-success)]'
                  : 'text-[color:var(--status-critical)]',
            ].join(' ')}
          >
            {metric.trend.label}
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-lg font-bold tabular-nums tracking-tight text-foreground">{metric.value}</p>
      {metric.hint ? (
        <p className="mt-0.5 text-[9px] text-muted-foreground">{metric.hint}</p>
      ) : null}
      {clickable ? (
        <p className="mt-1 text-[9px] font-medium text-primary/80">
          {de ? 'Details öffnen' : 'Open details'}
        </p>
      ) : null}
    </Wrapper>
  );
}

export function BusinessPulse({ vm }: BusinessPulseProps) {
  const { businessPulse, locale } = vm;
  const de = locale === 'de';

  return (
    <section
      className={panelShellClass('tertiary')}
      aria-label={de ? 'Business Pulse' : 'Business Pulse'}
    >
      <DashboardPanelHeader
        icon={<Icon name="wallet" className="h-4 w-4 text-muted-foreground" />}
        iconToneClass="bg-muted/40"
        title="Business Pulse"
        subtitle={
          de
            ? 'Finanz- & Business-KPIs · sekundär zur Operation'
            : 'Financial & business KPIs · secondary to operations'
        }
        trailing={
          <div className="flex flex-col items-end gap-1">
            {businessPulse.stationScoped ? (
              <StatusChip tone="info" className="text-[10px]">
                {de ? 'Stations-Scope' : 'Station scope'}
              </StatusChip>
            ) : null}
            <DataTrustHint
              hint={sectionTrustHint('finance', vm.dataTrust)}
              locale={locale}
              className="text-right"
            />
          </div>
        }
      />

      <div className={cn(PANEL_BODY_CLASS, 'space-y-3')}>        {businessPulse.loading ? (
          <SkeletonMetricGrid count={3} className="!grid-cols-1 sm:!grid-cols-3" />
        ) : businessPulse.error ? (
          <div className="rounded-xl border border-border/50 bg-muted/20 px-3 py-4 text-center">
            <p className="text-[12px] font-medium text-foreground">
              {de ? 'Finanzdaten nicht verfügbar' : 'Financial data unavailable'}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              {de ? 'Rechnungen konnten nicht geladen werden.' : 'Invoices could not be loaded.'}
            </p>
          </div>
        ) : !businessPulse.hasFinancialData && businessPulse.secondaryMetrics.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-3 py-5 text-center">
            <p className="text-[12px] font-medium text-foreground">{businessPulse.emptyTitle}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{businessPulse.emptySubtitle}</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {businessPulse.primaryMetrics.map((metric) => (
                <PulseMetric key={metric.id} metric={metric} de={de} vm={vm} />
              ))}
            </div>

            {businessPulse.secondaryMetrics.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                {businessPulse.secondaryMetrics.map((metric) => (
                  <PulseMetric key={metric.id} metric={metric} de={de} vm={vm} />
                ))}
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}

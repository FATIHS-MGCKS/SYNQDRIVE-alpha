import { Icon } from '../ui/Icon';
import { SkeletonRows } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import type { BusinessPulseCompactMetric, BusinessPulseDrilldown } from './businessPulseBuilder';
import { panelShellClass } from './dashboardShell';
import type { DashboardViewModel } from './dashboardTypes';

interface BusinessPulseProps {
  vm: DashboardViewModel;
  onOpenFinanceView?: (view: BusinessPulseDrilldown) => void;
}

function CompactMetric({
  metric,
  vm,
}: {
  metric: BusinessPulseCompactMetric;
  vm: DashboardViewModel;
}) {
  const clickable = metric.available;
  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={
        clickable
          ? () => vm.openDrilldown({ type: 'business-metric', metricId: metric.id })
          : undefined
      }
      className={cn(
        '-mx-1 min-w-0 rounded-md px-1 py-0.5 text-left transition-colors',
        clickable
          ? 'sq-press hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]'
          : 'cursor-default',
      )}
    >
      <p className="truncate text-[10.5px] font-medium tracking-[-0.01em] text-muted-foreground">
        {metric.label}
      </p>
      <p
        className={cn(
          'mt-0.5 truncate text-[16px] font-semibold tabular-nums leading-none tracking-[-0.02em]',
          !metric.available
            ? 'text-muted-foreground'
            : metric.emphasize
              ? 'text-[color:var(--status-critical)]'
              : 'text-foreground',
        )}
      >
        {metric.value}
      </p>
      {metric.hint ? (
        <p
          className={cn(
            'mt-0.5 truncate text-[10px] leading-snug',
            metric.emphasize ? 'text-[color:var(--status-critical)]/80' : 'text-muted-foreground',
          )}
        >
          {metric.hint}
        </p>
      ) : null}
    </button>
  );
}

export function BusinessPulse({ vm, onOpenFinanceView }: BusinessPulseProps) {
  const { businessPulse, locale } = vm;
  const de = locale === 'de';
  const { compact } = businessPulse;

  const subline = [
    compact.monthLabel,
    businessPulse.hasFinancialData
      ? de
        ? `${compact.invoiceCount} Rechnung(en)`
        : `${compact.invoiceCount} invoice${compact.invoiceCount === 1 ? '' : 's'}`
      : null,
    businessPulse.stationScoped ? (de ? 'Stations-Scope' : 'Station scope') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <section
      className={panelShellClass('tertiary', 'border-solid border-border/55 bg-card/55 shadow-none')}
      aria-label="Business Pulse"
    >
      <div className="flex items-center justify-between gap-2 px-3.5 pt-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--brand)]" aria-hidden />
          <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
            Business Pulse
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onOpenFinanceView?.('invoices')}
          className="sq-press inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-[color:var(--brand)] transition-colors hover:bg-[color:var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
        >
          {de ? 'Abrechnung öffnen' : 'Open billing'}
          <Icon name="arrow-right" className="h-3 w-3" />
        </button>
      </div>
      <p className="mt-0.5 truncate px-3.5 text-[11px] leading-snug text-muted-foreground">{subline}</p>

      {businessPulse.loading ? (
        <div className="px-3.5 py-3" aria-busy>
          <SkeletonRows rows={2} />
        </div>
      ) : businessPulse.error ? (
        <div className="px-3.5 py-3">
          <p className="text-[12px] font-medium text-foreground">
            {de ? 'Finanzdaten nicht verfügbar' : 'Financial data unavailable'}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground text-pretty">
            {de ? 'Rechnungen konnten nicht geladen werden.' : 'Invoices could not be loaded.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 px-3.5 pb-2.5 pt-2 sm:grid-cols-4">
            <CompactMetric metric={compact.revenue} vm={vm} />
            <CompactMetric metric={compact.profit} vm={vm} />
            <CompactMetric metric={compact.openReceivables} vm={vm} />
            <CompactMetric metric={compact.overdueReceivables} vm={vm} />
          </div>
          {compact.expenses ? (
            <p className="border-t border-border/30 px-3.5 py-1.5 text-[10.5px] text-muted-foreground">
              {compact.expenses.label}:{' '}
              <span className="font-medium tabular-nums text-foreground/85">{compact.expenses.value}</span>
              {compact.expenses.hint ? ` · ${compact.expenses.hint}` : ''}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

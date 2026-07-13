import { Icon } from '../ui/Icon';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { dashboardPanelHeaderClass, panelShellClass } from './dashboardShell';
import {
  hasOptionalBusinessMetrics,
  METRIC_TITLE_KEYS,
  OPTIONAL_BUSINESS_METRICS,
  OptionalMetricChip,
} from './financeKpiCards';
import type { BusinessMetricId, BusinessPulseSlice } from './runtime';

interface BusinessPulseProps {
  businessPulseSlices: Record<BusinessMetricId, BusinessPulseSlice>;
  onSelectBusinessMetric?: (metricId: BusinessMetricId) => void;
  onOpenBilling?: () => void;
}

/** Supplemental finance panel — optional invoice metrics only; primary KPIs live in FinanceKpiStrip. */
export function BusinessPulse({
  businessPulseSlices,
  onSelectBusinessMetric,
  onOpenBilling,
}: BusinessPulseProps) {
  const { t } = useLanguage();

  if (!hasOptionalBusinessMetrics(businessPulseSlices)) {
    return null;
  }

  const optionalMetricIds = OPTIONAL_BUSINESS_METRICS.filter(
    (id) => (businessPulseSlices[id]?.count ?? 0) > 0,
  );

  return (
    <section
      className={cn(panelShellClass('tertiary', 'flex w-full min-w-0 flex-col'))}
      aria-label={t('dashboard.financesTitle')}
    >
      <div className={dashboardPanelHeaderClass()}>
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-2 w-2 shrink-0 rounded-full bg-[color:var(--brand)]" aria-hidden />
          <h2 className="text-[13px] font-semibold leading-tight tracking-[-0.01em] text-foreground">
            {t('dashboard.financesTitle')}
          </h2>
        </div>
        {onOpenBilling ? (
          <button
            type="button"
            onClick={onOpenBilling}
            className="sq-press inline-flex min-h-8 shrink-0 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-[color:var(--brand)] transition-colors hover:bg-[color:var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
          >
            {t('dashboard.openInvoices')}
            <Icon name="arrow-right" className="h-3 w-3" />
          </button>
        ) : null}
      </div>

      <div className="px-3.5 py-3">
        <div className="flex flex-wrap gap-2">
          {optionalMetricIds.map((metricId) => (
            <OptionalMetricChip
              key={metricId}
              metricId={metricId}
              slice={businessPulseSlices[metricId]}
              title={t(METRIC_TITLE_KEYS[metricId])}
              onSelect={onSelectBusinessMetric}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

import { Icon } from '../ui/Icon';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { cn } from '../../../components/ui/utils';
import { useLanguage } from '../../i18n/LanguageContext';
import { DASHBOARD_LAYOUT } from './dashboardShell';
import {
  FinanceKpiCard,
  METRIC_TITLE_KEYS,
  PRIMARY_BUSINESS_METRICS,
} from './financeKpiCards';
import type { BusinessMetricId, BusinessPulseSlice } from './runtime';

interface FinanceKpiStripProps {
  businessPulseSlices: Record<BusinessMetricId, BusinessPulseSlice>;
  onSelectBusinessMetric?: (metricId: BusinessMetricId) => void;
  onOpenBilling?: () => void;
  activeBusinessMetricId?: BusinessMetricId | null;
  locale?: string;
  currency?: string;
  loading?: boolean;
  error?: boolean;
}

export function FinanceKpiStrip({
  businessPulseSlices,
  onSelectBusinessMetric,
  onOpenBilling,
  activeBusinessMetricId,
  locale: localeProp,
  currency = 'EUR',
  loading = false,
  error = false,
}: FinanceKpiStripProps) {
  const { locale: contextLocale, t } = useLanguage();
  const locale = localeProp ?? contextLocale;
  const noDataLabel = t('dashboard.noFinancialData');

  if (loading) {
    return (
      <div aria-busy aria-label={t('dashboard.financesTitle')}>
        <SkeletonMetricGrid
          count={4}
          className={cn(DASHBOARD_LAYOUT.controlFinanceKpiGrid, '!grid-cols-2')}
          cardClassName={cn(DASHBOARD_LAYOUT.controlFinanceKpiCard, 'surface-elevated')}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-border/35 bg-muted/10 px-3 py-3">
        <p className="text-[12px] font-medium text-foreground">
          {t('dashboard.financialDataUnavailable')}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground text-pretty">
          {t('dashboard.invoicesCouldNotLoad')}
        </p>
      </div>
    );
  }

  return (
    <div aria-label={t('dashboard.financesTitle')}>
      <div className={DASHBOARD_LAYOUT.controlFinanceKpiGrid}>
        {PRIMARY_BUSINESS_METRICS.map((metricId) => (
          <FinanceKpiCard
            key={metricId}
            metricId={metricId}
            slice={businessPulseSlices[metricId]}
            locale={locale}
            currency={currency}
            title={t(METRIC_TITLE_KEYS[metricId])}
            noDataLabel={noDataLabel}
            t={t}
            onSelect={onSelectBusinessMetric}
            embedded
            isActive={activeBusinessMetricId === metricId}
          />
        ))}
      </div>

      {onOpenBilling ? (
        <div className="mt-2.5 flex justify-end">
          <button
            type="button"
            onClick={onOpenBilling}
            className="sq-press inline-flex min-h-8 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-[color:var(--brand)] transition-colors hover:bg-[color:var(--brand-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand)]"
          >
            {t('dashboard.openInvoices')}
            <Icon name="arrow-right" className="h-3 w-3" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

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
  activeBusinessMetricId?: BusinessMetricId | null;
  locale?: string;
  currency?: string;
  loading?: boolean;
  error?: boolean;
  className?: string;
}

export function FinanceKpiStrip({
  businessPulseSlices,
  onSelectBusinessMetric,
  activeBusinessMetricId,
  locale: localeProp,
  currency = 'EUR',
  loading = false,
  error = false,
  className,
}: FinanceKpiStripProps) {
  const { locale: contextLocale, t } = useLanguage();
  const locale = localeProp ?? contextLocale;
  const noDataLabel = t('dashboard.noFinancialData');

  if (loading) {
    return (
      <div
        aria-busy
        aria-label={t('dashboard.financesTitle')}
        className={cn(DASHBOARD_LAYOUT.operationsGridContents, className)}
      >
        {PRIMARY_BUSINESS_METRICS.map((metricId) => (
          <div
            key={metricId}
            className={cn(DASHBOARD_LAYOUT.controlFinanceKpiCard, 'surface-elevated animate-pulse rounded-md')}
            aria-hidden
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn('col-span-2 rounded-md border border-border/35 bg-muted/10 px-3 py-3', className)}>
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
    <div
      aria-label={t('dashboard.financesTitle')}
      className={cn(DASHBOARD_LAYOUT.operationsGridContents, className)}
    >
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
  );
}

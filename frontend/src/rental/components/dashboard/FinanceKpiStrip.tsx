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
  activeBusinessMetricId?: BusinessMetricId | null;
  locale?: string;
  currency?: string;
  loading?: boolean;
  error?: boolean;
}

export function FinanceKpiStrip({
  businessPulseSlices,
  onSelectBusinessMetric,
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
          className={DASHBOARD_LAYOUT.controlFinanceKpiGrid}
          cardClassName={cn(DASHBOARD_LAYOUT.controlFinanceKpiCard, 'surface-elevated')}
        />
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn(DASHBOARD_LAYOUT.controlCenterRadius, 'border border-border/35 bg-muted/10 px-3 py-3')}>
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
    </div>
  );
}

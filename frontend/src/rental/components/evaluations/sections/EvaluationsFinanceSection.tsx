import { ArrowDownLeft, ArrowUpRight, Clock, TrendingUp, Wallet } from 'lucide-react';
import { EvaluationsMetricKpiCard } from '../EvaluationsMetricKpiCard';
import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvaluationsAnalyticsHookResult } from '../../../hooks/useEvaluationsAnalyticsSummary.types';
import { resolveMetricFromEnvelope } from '@synq/evaluations-insights/evaluations-metric-state';
import { formatCount } from '@synq/evaluations-insights/evaluations-metric-state';
import { fmtEurMinor, evaluationsIntlLocale } from '../../../lib/evaluations-format';
import { EvaluationsFinanceInvoiceDetail } from '../EvaluationsFinanceInvoiceDetail';
import type { EvaluationsInvoiceDataHookResult } from '../../../hooks/useEvaluationsInvoiceData';

interface EvaluationsFinanceSectionProps {
  analytics: EvaluationsAnalyticsHookResult;
  invoiceData: EvaluationsInvoiceDataHookResult;
  isDarkMode: boolean;
  vehicleLabelById: Map<string, { license: string; model: string }>;
}

export function EvaluationsFinanceSection({
  analytics,
  invoiceData,
  isDarkMode,
  vehicleLabelById,
}: EvaluationsFinanceSectionProps) {
  const { t, locale } = useLanguage();
  const intlLocale = evaluationsIntlLocale(locale);
  const analyticsLocale = locale === 'en' ? 'en' : 'de';
  const financial = analytics.summary?.financial;
  const receivables = analytics.summary?.receivables;
  const fetchPhase = analytics.fetchPhase;

  const financialMetric = (
    extract: (d: NonNullable<typeof financial>['data']) => number | null,
    format: (v: number) => string,
    opts?: { zeroMeansNull?: boolean },
  ) =>
    resolveMetricFromEnvelope({
      envelope: financial ?? null,
      extractValue: extract,
      formatValue: format,
      fetchPhase,
      fetchError: analytics.error,
      locale: analyticsLocale,
      zeroMeansNull: opts?.zeroMeansNull,
    });

  const receivablesMetric = (
    extract: (d: NonNullable<typeof receivables>['data']) => number | null,
    format: (v: number) => string,
    opts?: { zeroMeansNull?: boolean },
  ) =>
    resolveMetricFromEnvelope({
      envelope: receivables ?? null,
      extractValue: extract,
      formatValue: format,
      fetchPhase,
      fetchError: analytics.error,
      locale: analyticsLocale,
      zeroMeansNull: opts?.zeroMeansNull,
    });

  const surfaceState =
    analytics.loading && !analytics.summary
      ? 'loading'
      : financial?.status === 'ERROR' && receivables?.status === 'ERROR'
        ? 'error'
        : 'ready';

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.finance}
      title={t('evaluations.ia.sections.finance.title')}
      subtitle={t('evaluations.ia.sections.finance.subtitle')}
      sectionStatus={financial?.status === 'ERROR' ? financial.status : receivables?.status}
      surfaceState={surfaceState}
      errorMessage={financial?.error ?? receivables?.error}
      defaultOpen={false}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.expensesMtd')}
          state={financialMetric((d) => d?.expensesMtdMinor ?? null, (v) => fmtEurMinor(v, intlLocale))}
          icon={ArrowDownLeft}
          tone="watch"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.paidRevenueMtd')}
          state={financialMetric((d) => d?.paidRevenueMtdMinor ?? null, (v) => fmtEurMinor(v, intlLocale))}
          icon={ArrowUpRight}
          tone="info"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.overdueReceivables')}
          state={receivablesMetric((d) => d?.overdueAmountMinor ?? null, (v) => fmtEurMinor(v, intlLocale))}
          icon={Clock}
          tone="critical"
          accent={(receivables?.data?.overdueCount ?? 0) > 0}
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.openReceivablesCount')}
          state={receivablesMetric(
            (d) => d?.openCount ?? null,
            (v) => formatCount(v, analyticsLocale),
            { zeroMeansNull: true },
          )}
          icon={Wallet}
          tone="info"
          locale={analyticsLocale}
        />
      </div>

      <EvaluationsFinanceInvoiceDetail
        invoiceData={invoiceData}
        isDarkMode={isDarkMode}
        intlLocale={intlLocale}
        vehicleLabelById={vehicleLabelById}
      />
    </EvaluationsSection>
  );
}

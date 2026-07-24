import { Activity, AlertTriangle, TrendingUp, Wallet } from 'lucide-react';
import { EvaluationsMetricKpiCard } from '../EvaluationsMetricKpiCard';
import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvaluationsAnalyticsHookResult } from '../../../hooks/useEvaluationsAnalyticsSummary.types';
import { resolveMetricFromEnvelope } from '@synq/evaluations-insights/evaluations-metric-state';
import { formatCount } from '@synq/evaluations-insights/evaluations-metric-state';
import { fmtEurMinor, evaluationsIntlLocale } from '../../../lib/evaluations-format';

interface EvaluationsExecutiveSummarySectionProps {
  analytics: EvaluationsAnalyticsHookResult;
}

export function EvaluationsExecutiveSummarySection({ analytics }: EvaluationsExecutiveSummarySectionProps) {
  const { t, locale } = useLanguage();
  const intlLocale = evaluationsIntlLocale(locale);
  const analyticsLocale = locale === 'en' ? 'en' : 'de';
  const summary = analytics.summary;
  const envelope = summary?.executive;
  const fetchPhase = analytics.fetchPhase;

  const metric = (
    extract: (d: NonNullable<typeof envelope>['data']) => number | null,
    format: (v: number) => string,
    opts?: { zeroMeansNull?: boolean },
  ) =>
    resolveMetricFromEnvelope({
      envelope: envelope ?? null,
      extractValue: extract,
      formatValue: format,
      fetchPhase,
      fetchError: analytics.error,
      locale: analyticsLocale,
      zeroMeansNull: opts?.zeroMeansNull,
    });

  const surfaceState =
    analytics.loading && !summary ? 'loading' : envelope?.status === 'ERROR' ? 'error' : 'ready';

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.executive}
      title={t('evaluations.ia.sections.executive.title')}
      subtitle={t('evaluations.ia.sections.executive.subtitle')}
      sectionStatus={envelope?.status}
      surfaceState={surfaceState}
      errorMessage={envelope?.error}
      defaultOpen
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 xl:grid-cols-6">
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.revenueMtd')}
          state={metric((d) => d?.revenueMtdMinor ?? null, (v) => fmtEurMinor(v, intlLocale))}
          icon={TrendingUp}
          tone="info"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.netMargin')}
          state={metric((d) => d?.netMarginMinor ?? null, (v) => fmtEurMinor(v, intlLocale))}
          icon={Wallet}
          tone="info"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.openReceivables')}
          state={metric((d) => d?.openReceivablesMinor ?? null, (v) => fmtEurMinor(v, intlLocale))}
          icon={Activity}
          tone="info"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.utilization')}
          state={metric((d) => d?.fleetUtilizationPercent ?? null, (v) => `${v.toFixed(1)}%`)}
          icon={Activity}
          tone="info"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.criticalRisks')}
          state={metric((d) => d?.criticalRisks ?? null, (v) => formatCount(v, analyticsLocale), { zeroMeansNull: true })}
          icon={AlertTriangle}
          tone="critical"
          accent
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.activeBookings')}
          state={metric((d) => d?.activeBookings ?? null, (v) => formatCount(v, analyticsLocale), { zeroMeansNull: true })}
          icon={Activity}
          tone="info"
          locale={analyticsLocale}
        />
      </div>
    </EvaluationsSection>
  );
}

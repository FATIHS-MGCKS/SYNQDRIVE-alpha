import { AlertTriangle, TrendingDown } from 'lucide-react';
import type { DashboardInsight } from '../../../DashboardInsightsContext';
import { EvaluationsMetricKpiCard } from '../EvaluationsMetricKpiCard';
import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import { EvaluationsInsightListCard } from '../EvaluationsInsightListCard';
import type { EvaluationsAnalyticsHookResult } from '../../../hooks/useEvaluationsAnalyticsSummary.types';

interface EvaluationsRisksSectionProps {
  analytics: EvaluationsAnalyticsHookResult;
  businessRisks: DashboardInsight[];
  revenueLeakage: DashboardInsight[];
  insightsLoading: boolean;
  isDarkMode: boolean;
}

export function EvaluationsRisksSection({
  analytics,
  businessRisks,
  revenueLeakage,
  insightsLoading,
  isDarkMode,
}: EvaluationsRisksSectionProps) {
  const { t, locale } = useLanguage();
  const analyticsLocale = locale === 'en' ? 'en' : 'de';
  const envelope = analytics.summary?.activeRisks;
  const weaknesses = analytics.summary?.weaknesses?.data?.weaknesses ?? [];
  const forecasts = weaknesses.filter((w) => w.quantitativeDeviation?.kind === 'FORECAST');

  const surfaceState =
    analytics.loading && !analytics.summary
      ? 'loading'
      : envelope?.status === 'ERROR'
        ? 'error'
        : 'ready';

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.risks}
      title={t('evaluations.ia.sections.risks.title')}
      subtitle={t('evaluations.ia.sections.risks.subtitle')}
      sectionStatus={envelope?.status}
      surfaceState={surfaceState}
      errorMessage={envelope?.error}
      defaultOpen
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.businessRisks')}
          state={analytics.metrics.businessRiskGroups}
          icon={AlertTriangle}
          tone="critical"
          accent={(analytics.metrics.businessRiskGroups.rawValue ?? 0) > 0}
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.estimatedExposure')}
          state={analytics.metrics.estimatedExposure}
          icon={TrendingDown}
          tone="watch"
          prefix="≈"
          accent={(analytics.metrics.estimatedExposure.rawValue ?? 0) > 0}
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.revenueLeakage')}
          state={analytics.metrics.revenueLeakageGroups}
          icon={TrendingDown}
          tone="watch"
          accent={(analytics.metrics.revenueLeakageGroups.rawValue ?? 0) > 0}
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.criticalBookings')}
          state={analytics.metrics.criticalBookings}
          icon={AlertTriangle}
          tone="critical"
          accent={(analytics.metrics.criticalBookings.rawValue ?? 0) > 0}
          locale={analyticsLocale}
        />
      </div>

      {forecasts.length > 0 ? (
        <div className="mb-4 rounded-xl border border-border/40 px-3 py-2">
          <h3 className="mb-2 text-[11px] font-semibold text-foreground">
            {t('evaluations.ia.sections.risks.forecasts')}
          </h3>
          <ul className="space-y-1.5">
            {forecasts.slice(0, 3).map((f) => (
              <li key={f.id} className="text-[10.5px] text-muted-foreground">
                <span className="font-medium text-foreground">{f.title}</span> — {f.description}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <EvaluationsInsightListCard
          title={t('evaluations.ia.sections.risks.businessRisks')}
          loading={insightsLoading}
          emptyTitle={t('evaluations.ia.sections.risks.noBusinessRisks')}
          emptyDescription={t('evaluations.ia.sections.risks.noBusinessRisksHint')}
          insights={businessRisks}
          isDarkMode={isDarkMode}
        />
        <EvaluationsInsightListCard
          title={t('evaluations.ia.sections.risks.revenueLeakage')}
          loading={insightsLoading}
          emptyTitle={t('evaluations.ia.sections.risks.noLeakage')}
          emptyDescription={t('evaluations.ia.sections.risks.noLeakageHint')}
          insights={revenueLeakage}
          isDarkMode={isDarkMode}
        />
      </div>
    </EvaluationsSection>
  );
}

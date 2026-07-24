import { AlertTriangle, TrendingDown, Wrench } from 'lucide-react';
import { EvaluationsMetricKpiCard } from '../EvaluationsMetricKpiCard';
import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvaluationsAnalyticsHookResult } from '../../../hooks/useEvaluationsAnalyticsSummary.types';
import { resolveMetricFromEnvelope } from '@synq/evaluations-insights/evaluations-metric-state';
import { fmtEurMinor, evaluationsIntlLocale } from '../../../lib/evaluations-format';

interface EvaluationsCostsDowntimeSectionProps {
  analytics: EvaluationsAnalyticsHookResult;
}

export function EvaluationsCostsDowntimeSection({ analytics }: EvaluationsCostsDowntimeSectionProps) {
  const { t, locale } = useLanguage();
  const intlLocale = evaluationsIntlLocale(locale);
  const analyticsLocale = locale === 'en' ? 'en' : 'de';
  const costs = analytics.summary?.costs;
  const downtime = analytics.summary?.downtime;
  const costModel = analytics.summary?.costModel;
  const fetchPhase = analytics.fetchPhase;

  const costsMetric = (
    extract: (d: NonNullable<typeof costs>['data']) => number | null,
    format: (v: number) => string,
  ) =>
    resolveMetricFromEnvelope({
      envelope: costs ?? null,
      extractValue: extract,
      formatValue: format,
      fetchPhase,
      fetchError: analytics.error,
      locale: analyticsLocale,
    });

  const downtimeMetric = (
    extract: (d: NonNullable<typeof downtime>['data']) => number | null,
    format: (v: number) => string,
    opts?: { zeroMeansNull?: boolean },
  ) =>
    resolveMetricFromEnvelope({
      envelope: downtime ?? null,
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
      : costs?.status === 'ERROR' && downtime?.status === 'ERROR'
        ? 'error'
        : 'ready';

  const costModelMetrics = costModel?.data?.metrics?.filter((m) => m.status !== 'UNAVAILABLE').slice(0, 4) ?? [];

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.costsDowntime}
      title={t('evaluations.ia.sections.costsDowntime.title')}
      subtitle={t('evaluations.ia.sections.costsDowntime.subtitle')}
      sectionStatus={costs?.status === 'ERROR' ? costs.status : downtime?.status}
      surfaceState={surfaceState}
      errorMessage={costs?.error ?? downtime?.error}
      defaultOpen={false}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.fixedCostsMtd')}
          state={costsMetric((d) => d?.fixedCostsMtdMinor ?? null, (v) => fmtEurMinor(v, intlLocale))}
          icon={TrendingDown}
          tone="watch"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.downtimeVehicles')}
          state={analytics.metrics.downtimeVehicles}
          icon={Wrench}
          tone="critical"
          accent={(analytics.metrics.downtimeVehicles.rawValue ?? 0) > 0}
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.maintenanceVehicles')}
          state={downtimeMetric((d) => d?.maintenanceVehicles ?? null, (v) => String(v), { zeroMeansNull: true })}
          icon={AlertTriangle}
          tone="watch"
          accent={(downtime?.data?.maintenanceVehicles ?? 0) > 0}
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.downtimePercent')}
          state={downtimeMetric((d) => d?.downtimePercent ?? null, (v) => `${v.toFixed(1)}%`)}
          icon={Wrench}
          tone="watch"
          locale={analyticsLocale}
        />
      </div>

      {costModelMetrics.length > 0 ? (
        <div className="rounded-xl border border-border/40 px-3 py-2">
          <h3 className="mb-2 text-[11px] font-semibold text-foreground">
            {t('evaluations.ia.sections.costsDowntime.costModelDetail')}
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {costModelMetrics.map((m) => (
              <li key={m.key} className="rounded-lg border border-border/35 px-2.5 py-2 text-[10.5px]">
                <span className="font-medium text-foreground">{m.label}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {m.valueMinor != null ? fmtEurMinor(m.valueMinor, intlLocale) : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </EvaluationsSection>
  );
}

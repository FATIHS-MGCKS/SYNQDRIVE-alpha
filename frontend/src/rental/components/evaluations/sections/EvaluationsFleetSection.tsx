import { Car, Gauge, TrendingUp } from 'lucide-react';
import { EvaluationsMetricKpiCard } from '../EvaluationsMetricKpiCard';
import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvaluationsAnalyticsHookResult } from '../../../hooks/useEvaluationsAnalyticsSummary.types';
import { resolveMetricFromEnvelope } from '@synq/evaluations-insights/evaluations-metric-state';
import { formatCount } from '@synq/evaluations-insights/evaluations-metric-state';

interface EvaluationsFleetSectionProps {
  analytics: EvaluationsAnalyticsHookResult;
}

export function EvaluationsFleetSection({ analytics }: EvaluationsFleetSectionProps) {
  const { t, locale } = useLanguage();
  const analyticsLocale = locale === 'en' ? 'en' : 'de';
  const fleet = analytics.summary?.fleetUtilization;
  const utilModel = analytics.summary?.utilizationModel;
  const fetchPhase = analytics.fetchPhase;

  const fleetMetric = (
    extract: (d: NonNullable<typeof fleet>['data']) => number | null,
    format: (v: number) => string,
    opts?: { zeroMeansNull?: boolean },
  ) =>
    resolveMetricFromEnvelope({
      envelope: fleet ?? null,
      extractValue: extract,
      formatValue: format,
      fetchPhase,
      fetchError: analytics.error,
      locale: analyticsLocale,
      zeroMeansNull: opts?.zeroMeansNull,
    });

  const surfaceState =
    analytics.loading && !analytics.summary ? 'loading' : fleet?.status === 'ERROR' ? 'error' : 'ready';

  const modelMetrics = utilModel?.data?.metrics?.slice(0, 4) ?? [];

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.fleet}
      title={t('evaluations.ia.sections.fleet.title')}
      subtitle={t('evaluations.ia.sections.fleet.subtitle')}
      sectionStatus={fleet?.status}
      surfaceState={surfaceState}
      errorMessage={fleet?.error}
      defaultOpen={false}
    >
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.fleetUtilization')}
          state={fleetMetric((d) => d?.utilizationPercent ?? null, (v) => `${v.toFixed(1)}%`)}
          icon={Gauge}
          tone="info"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.rentedVehicles')}
          state={fleetMetric((d) => d?.rented ?? null, (v) => formatCount(v, analyticsLocale), { zeroMeansNull: true })}
          icon={Car}
          tone="info"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.availableVehicles')}
          state={fleetMetric((d) => d?.available ?? null, (v) => formatCount(v, analyticsLocale), { zeroMeansNull: true })}
          icon={Car}
          tone="info"
          locale={analyticsLocale}
        />
        <EvaluationsMetricKpiCard
          label={t('evaluations.ia.kpi.underutilizedVehicles')}
          state={fleetMetric((d) => d?.underutilizedVehicles ?? null, (v) => formatCount(v, analyticsLocale), {
            zeroMeansNull: true,
          })}
          icon={TrendingUp}
          tone="watch"
          accent={(fleet?.data?.underutilizedVehicles ?? 0) > 0}
          locale={analyticsLocale}
        />
      </div>

      {modelMetrics.length > 0 ? (
        <div className="rounded-xl border border-border/40 px-3 py-2">
          <h3 className="mb-2 text-[11px] font-semibold text-foreground">
            {t('evaluations.ia.sections.fleet.modelDetail')}
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {modelMetrics.map((m) => (
              <li key={m.key} className="rounded-lg border border-border/35 px-2.5 py-2 text-[10.5px]">
                <span className="font-medium text-foreground">{m.label}</span>
                <span className="mt-0.5 block text-muted-foreground">
                  {m.valuePercent != null
                    ? `${m.valuePercent.toFixed(1)}%`
                    : m.valueMs != null
                      ? `${Math.round(m.valueMs / 3_600_000)}h`
                      : '—'}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </EvaluationsSection>
  );
}

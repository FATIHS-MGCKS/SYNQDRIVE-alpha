import { useMemo } from 'react';
import { resolveExecutiveKpiStrip } from '@synq/evaluations-insights/evaluations-executive-kpi-registry';
import type { EvaluationsAnalyticsHookResult } from '../../hooks/useEvaluationsAnalyticsSummary.types';
import { EvaluationsExecutiveKpiCard } from './EvaluationsExecutiveKpiCard';
import { SkeletonMetricGrid } from '../../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';

interface EvaluationsExecutiveKpiStripProps {
  analytics: EvaluationsAnalyticsHookResult;
}

export function EvaluationsExecutiveKpiStrip({ analytics }: EvaluationsExecutiveKpiStripProps) {
  const { locale } = useLanguage();
  const analyticsLocale = locale === 'en' ? 'en' : 'de';

  const strip = useMemo(
    () =>
      resolveExecutiveKpiStrip({
        summary: analytics.summary,
        lineage: analytics.summary?.lineage?.data ?? null,
        fetchPhase: analytics.fetchPhase,
        fetchError: analytics.error,
        locale: analyticsLocale,
      }),
    [analytics.summary, analytics.fetchPhase, analytics.error, analyticsLocale],
  );

  if (analytics.loading && !analytics.summary) {
    return <SkeletonMetricGrid count={4} className="max-w-full" />;
  }

  return (
    <div
      className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-thin md:grid md:grid-cols-2 md:overflow-visible md:snap-none xl:grid-cols-4"
      role="list"
      aria-label="Executive KPIs"
    >
      {strip.cards.map((card) => (
        <div key={card.id} role="listitem" className="shrink-0 md:shrink">
          <EvaluationsExecutiveKpiCard card={card} analyticsLocale={analyticsLocale} />
        </div>
      ))}
    </div>
  );
}

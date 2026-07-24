import { RefreshCw } from 'lucide-react';
import type { EvaluationsAnalyticsFiltersQuery } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import type { EvaluationsAnalyticsHookResult } from '../../../hooks/useEvaluationsAnalyticsSummary.types';
import { EvaluationsAnalyticsFilterBar } from '../../insights/EvaluationsAnalyticsFilterBar';
import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import { cn } from '../../../../components/ui/utils';

interface EvaluationsGlobalFiltersSectionProps {
  filters: EvaluationsAnalyticsFiltersQuery;
  onPatchFilters: (patch: Partial<EvaluationsAnalyticsFiltersQuery>) => void;
  stationOptions: Array<{ id: string; label: string }>;
  analytics: EvaluationsAnalyticsHookResult;
}

export function EvaluationsGlobalFiltersSection({
  filters,
  onPatchFilters,
  stationOptions,
  analytics,
}: EvaluationsGlobalFiltersSectionProps) {
  const { t, locale } = useLanguage();
  const summary = analytics.summary;
  const generatedAt = summary?.generatedAt
    ? new Date(summary.generatedAt).toLocaleString(locale === 'de' ? 'de-DE' : 'en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.filters}
      title={t('evaluations.ia.sections.filters.title')}
      subtitle={t('evaluations.ia.sections.filters.subtitle')}
      surfaceState={analytics.loading && !summary ? 'loading' : 'ready'}
      defaultOpen
    >
      <EvaluationsAnalyticsFilterBar
        filters={filters}
        onPatch={onPatchFilters}
        stationOptions={stationOptions}
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10.5px]">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <span>
            {t('evaluations.ia.sections.filters.dataStand')}:{' '}
            <span className="font-medium text-foreground">{generatedAt ?? '—'}</span>
          </span>
          {summary ? (
            <span className="rounded-full px-2 py-0.5 sq-tone-neutral font-semibold uppercase tracking-wide text-[9px]">
              {summary.overallStatus}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => void analytics.refresh()}
          disabled={analytics.loading}
          className="inline-flex items-center gap-1 rounded-lg border border-border/50 px-2 py-1 font-semibold hover:bg-muted/50 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', analytics.isRefetching && 'animate-spin')} />
          {t('evaluations.ia.sections.filters.refresh')}
        </button>
      </div>
      {analytics.isRefetching ? (
        <p className="mt-2 text-[11px] text-[color:var(--status-watch)]" role="status">
          {t('evaluations.ia.sections.filters.refetching')}
        </p>
      ) : null}
      {analytics.error ? (
        <p className="mt-2 text-[11px] text-[color:var(--status-critical)]" role="alert">
          {analytics.error}
        </p>
      ) : null}
    </EvaluationsSection>
  );
}

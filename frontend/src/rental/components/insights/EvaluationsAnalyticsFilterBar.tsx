import type { EvaluationsAnalyticsFiltersQuery } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import { EVALUATIONS_FILTER_SELECT_CLASS } from '../evaluations/evaluations-responsive.constants';

interface EvaluationsAnalyticsFilterBarProps {
  filters: EvaluationsAnalyticsFiltersQuery;
  onPatch: (patch: Partial<EvaluationsAnalyticsFiltersQuery>) => void;
  stationOptions?: Array<{ id: string; label: string }>;
}

const PERIOD_OPTIONS = [
  { value: 'mtd', label: 'Monat' },
  { value: 'last7d', label: '7 Tage' },
  { value: 'last30d', label: '30 Tage' },
] as const;

const INSIGHT_STATUS_OPTIONS = [
  { value: '', label: 'Alle Status' },
  { value: 'CRITICAL', label: 'Kritisch' },
  { value: 'WARNING', label: 'Warnung' },
  { value: 'OPPORTUNITY', label: 'Chance' },
  { value: 'INFO', label: 'Info' },
] as const;

const RISK_OPTIONS = [
  { value: '', label: 'Alle Risiken' },
  { value: 'BUSINESS_RISK', label: 'Geschäftsrisiko' },
  { value: 'REVENUE_LEAKAGE', label: 'Umsatzverlust' },
  { value: 'OPERATIONAL_RECOMMENDATION', label: 'Operativ' },
] as const;

export function EvaluationsAnalyticsFilterBar({
  filters,
  onPatch,
  stationOptions = [],
}: EvaluationsAnalyticsFilterBarProps) {
  return (
    <div
      className="rounded-xl border border-border/50 bg-muted/20 px-2 py-2 sm:px-3"
      data-testid="evaluations-filter-bar"
    >
      <div className="overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]">
        <div className="flex min-w-max items-center gap-2 pr-1">
          <span className="shrink-0 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            Filter
          </span>
          <select
            className={EVALUATIONS_FILTER_SELECT_CLASS}
            value={filters.period ?? 'mtd'}
            onChange={(e) => onPatch({ period: e.target.value as EvaluationsAnalyticsFiltersQuery['period'] })}
            aria-label="Zeitraum"
          >
            {PERIOD_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {stationOptions.length > 0 ? (
            <select
              className={EVALUATIONS_FILTER_SELECT_CLASS}
              value={filters.stationId ?? ''}
              onChange={(e) => onPatch({ stationId: e.target.value || null })}
              aria-label="Station"
            >
              <option value="">Alle Stationen</option>
              {stationOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          ) : null}
          <select
            className={EVALUATIONS_FILTER_SELECT_CLASS}
            value={filters.riskCategory ?? ''}
            onChange={(e) =>
              onPatch({ riskCategory: (e.target.value || null) as EvaluationsAnalyticsFiltersQuery['riskCategory'] })
            }
            aria-label="Risikokategorie"
          >
            {RISK_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <select
            className={EVALUATIONS_FILTER_SELECT_CLASS}
            value={filters.insightStatus ?? ''}
            onChange={(e) =>
              onPatch({ insightStatus: (e.target.value || null) as EvaluationsAnalyticsFiltersQuery['insightStatus'] })
            }
            aria-label="Insight-Status"
          >
            {INSIGHT_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value || 'all'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}

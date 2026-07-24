import type { EvaluationsAnalyticsFiltersQuery } from '@synq/evaluations-insights/evaluations-analytics-filters.contract';
import { EVALUATIONS_FILTER_SELECT_CLASS } from '../evaluations/evaluations-responsive.constants';
import { useLanguage } from '../../i18n/LanguageContext';
import type { TranslationKey } from '../../i18n/translations/en';

interface EvaluationsAnalyticsFilterBarProps {
  filters: EvaluationsAnalyticsFiltersQuery;
  onPatch: (patch: Partial<EvaluationsAnalyticsFiltersQuery>) => void;
  stationOptions?: Array<{ id: string; label: string }>;
}

const PERIOD_VALUES = ['mtd', 'last7d', 'last30d'] as const;

const INSIGHT_STATUS_VALUES = ['', 'CRITICAL', 'WARNING', 'OPPORTUNITY', 'INFO'] as const;

const RISK_VALUES = ['', 'BUSINESS_RISK', 'REVENUE_LEAKAGE', 'OPERATIONAL_RECOMMENDATION'] as const;

export function EvaluationsAnalyticsFilterBar({
  filters,
  onPatch,
  stationOptions = [],
}: EvaluationsAnalyticsFilterBarProps) {
  const { t } = useLanguage();

  return (
    <fieldset
      className="rounded-xl border border-border/50 bg-muted/20 px-2 py-2 sm:px-3"
      data-testid="evaluations-filter-bar"
    >
      <legend className="sr-only">{t('evaluations.filters.legend')}</legend>
      <div className="overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:thin]" tabIndex={0}>
        <div className="flex min-w-max items-center gap-2 pr-1">
          <span
            className="shrink-0 px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground"
            aria-hidden
          >
            {t('evaluations.filters.legend')}
          </span>
          <select
            className={EVALUATIONS_FILTER_SELECT_CLASS}
            value={filters.period ?? 'mtd'}
            onChange={(e) => onPatch({ period: e.target.value as EvaluationsAnalyticsFiltersQuery['period'] })}
            aria-label={t('evaluations.filters.period.label')}
          >
            {PERIOD_VALUES.map((value) => (
              <option key={value} value={value}>
                {t(`evaluations.filters.period.${value}` as TranslationKey)}
              </option>
            ))}
          </select>
          {stationOptions.length > 0 ? (
            <select
              className={EVALUATIONS_FILTER_SELECT_CLASS}
              value={filters.stationId ?? ''}
              onChange={(e) => onPatch({ stationId: e.target.value || null })}
              aria-label={t('evaluations.filters.station.label')}
            >
              <option value="">{t('evaluations.filters.station.all')}</option>
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
            aria-label={t('evaluations.filters.riskCategory.label')}
          >
            {RISK_VALUES.map((value) => (
              <option key={value || 'all'} value={value}>
                {t(
                  (value
                    ? `evaluations.filters.riskCategory.${value}`
                    : 'evaluations.filters.riskCategory.all') as TranslationKey,
                )}
              </option>
            ))}
          </select>
          <select
            className={EVALUATIONS_FILTER_SELECT_CLASS}
            value={filters.insightStatus ?? ''}
            onChange={(e) =>
              onPatch({ insightStatus: (e.target.value || null) as EvaluationsAnalyticsFiltersQuery['insightStatus'] })
            }
            aria-label={t('evaluations.filters.insightStatus.label')}
          >
            {INSIGHT_STATUS_VALUES.map((value) => (
              <option key={value || 'all'} value={value}>
                {t(
                  (value
                    ? `evaluations.filters.insightStatus.${value}`
                    : 'evaluations.filters.insightStatus.all') as TranslationKey,
                )}
              </option>
            ))}
          </select>
        </div>
      </div>
    </fieldset>
  );
}

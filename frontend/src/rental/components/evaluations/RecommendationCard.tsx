/**
 * E7C single recommendation card — server order preserved, copy keys only.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { E7Recommendation } from '@synq/evaluations-recommendations/evaluations-recommendations.contract';
import {
  categoryLabelKey,
  executeRecommendationAction,
  isExecutableAction,
  qualityLimitationPresentation,
  resolveActionLabelKey,
  resolveRecommendationCopy,
  severityLabelKey,
  severityTone,
  sourcePeriodLabelKey,
  sourceSectionLabelKey,
} from './recommendation-presentation';

export function RecommendationCard({ recommendation }: { recommendation: E7Recommendation }) {
  const { t, locale } = useLanguage();
  const title = resolveRecommendationCopy(t, recommendation.titleKey, recommendation.copyParams, locale);
  const explanation = resolveRecommendationCopy(
    t,
    recommendation.explanationKey,
    recommendation.copyParams,
    locale,
  );
  const categoryKey = categoryLabelKey(recommendation.category);
  const severityKey = recommendation.severity ? severityLabelKey(recommendation.severity) : null;

  return (
    <article
      className="rounded-xl border border-[var(--border)] p-3 flex flex-col gap-2"
      data-testid={`evaluations-recommendation-${recommendation.id}`}
      data-recommendation-family={recommendation.family}
    >
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap min-w-0">
          <span className="text-[11px] font-medium sq-tone-neutral rounded-md px-1.5 py-0.5">
            {t(categoryKey)}
          </span>
          {recommendation.severity && severityKey ? (
            <span
              className={`text-[11px] font-medium rounded-md px-1.5 py-0.5 ${severityTone(recommendation.severity)}`}
              role="status"
            >
              {t(severityKey)}
            </span>
          ) : null}
        </div>
      </div>

      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="text-xs text-[var(--muted-foreground)]">{explanation}</p>

      {recommendation.actions.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {recommendation.actions.map((action, idx) => {
            const executable = isExecutableAction(action);
            const label = resolveActionLabelKey(t, action.labelKey);
            return (
              <button
                key={`${recommendation.id}-action-${idx}`}
                type="button"
                disabled={!executable}
                aria-disabled={!executable}
                data-testid={`evaluations-recommendation-action-${recommendation.id}-${idx}`}
                className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--muted)] disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={() => {
                  if (executable) executeRecommendationAction(action.target, action.mutating);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      ) : null}

      <details className="text-[11px] text-[var(--muted-foreground)]">
        <summary className="cursor-pointer font-medium text-[var(--foreground)]">
          {t('evaluations.recommendations.evidence')}
        </summary>
        <div className="mt-2 flex flex-col gap-1.5 pl-1">
          {recommendation.provenance.sourceSections.length > 0 ? (
            <p>
              <span className="font-medium">{t('evaluations.recommendations.sourceSections')}: </span>
              {recommendation.provenance.sourceSections
                .map((s) => {
                  const key = sourceSectionLabelKey(s);
                  return key ? t(key) : s;
                })
                .join(', ')}
            </p>
          ) : null}
          {recommendation.provenance.sourcePeriods.length > 0 ? (
            <ul className="list-disc pl-4">
              {recommendation.provenance.sourcePeriods.map((sp, i) => {
                const periodKey = sourcePeriodLabelKey(sp.period);
                return (
                  <li key={`${sp.source}-${i}`} data-testid={`evaluations-rec-source-period-${sp.source}`}>
                    {sp.source}:{' '}
                    {periodKey ? t(periodKey) : sp.period.periodType}
                  </li>
                );
              })}
            </ul>
          ) : recommendation.provenance.period ? (
            <p data-testid="evaluations-rec-provenance-period">
              <span className="font-medium">{t('evaluations.recommendations.sourcePeriod')}: </span>
              {(() => {
                const key = sourcePeriodLabelKey(recommendation.provenance.period);
                return key ? t(key) : recommendation.provenance.period.periodType;
              })()}
            </p>
          ) : null}
          {recommendation.provenance.qualityLimitations.length > 0 ? (
            <div data-testid="evaluations-rec-quality-limitations">
              <p className="font-medium">{t('evaluations.recommendations.qualityLimitations')}</p>
              <ul className="list-disc pl-4">
                {recommendation.provenance.qualityLimitations.map((lim, i) => {
                  const pres = qualityLimitationPresentation(lim, t);
                  return (
                    <li
                      key={`${lim.dimension}-${lim.state}-${i}`}
                      data-testid={`evaluations-rec-quality-${lim.dimension}-${lim.state}`}
                    >
                      <span>{pres.dimension}</span>{' '}
                      <span className={`inline-flex rounded px-1 ${pres.tone}`} role="status">
                        {pres.state}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
          <p>
            <span className="font-medium">{t('evaluations.recommendations.calculationVersion')}: </span>
            {recommendation.provenance.calculationVersion}
          </p>
        </div>
      </details>
    </article>
  );
}

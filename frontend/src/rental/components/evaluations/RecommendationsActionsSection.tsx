/**
 * E7C Recommendations / Actions section — server-driven presentation only.
 * Receives the E7 async response exclusively; no cross-section business derivation.
 */
import { useLanguage } from '../../i18n/LanguageContext';
import type { EvaluationsAsyncResult } from '../../lib/evaluations/evaluations-request';
import type { EvaluationsRecommendationsResponse } from '@synq/evaluations-recommendations/evaluations-recommendations.contract';
import { EvaluationsSectionShell } from './EvaluationsSectionShell';
import { RecommendationCard } from './RecommendationCard';
import { emptyStateLabelKey } from './recommendation-presentation';

export function RecommendationsActionsSection({
  recommendations,
}: {
  recommendations: EvaluationsAsyncResult<EvaluationsRecommendationsResponse>;
}) {
  const { t } = useLanguage();
  return (
    <div id="evaluations-section-recommendations" className="scroll-mt-24">
      <EvaluationsSectionShell
        titleKey="evaluations.section.recommendations"
        async={recommendations}
        testId="evaluations-recommendations"
        sectionStatus={
          recommendations.phase === 'SETTLED' && recommendations.result.state === 'AVAILABLE'
            ? recommendations.result.data.status
            : undefined
        }
      >
        {(data) => (
          <div className="flex flex-col gap-3" data-testid="evaluations-recommendations-body">
            <p className="text-[11px] text-[var(--muted-foreground)]">
              {t('evaluations.recommendations.intro')}
            </p>
            {data.recommendations.length === 0 ? (
              <p
                className="text-sm text-[var(--muted-foreground)]"
                role="status"
                data-testid={`evaluations-recommendations-empty-${data.emptyState ?? 'null'}`}
              >
                {t(emptyStateLabelKey(data.emptyState))}
              </p>
            ) : (
              <div className="flex flex-col gap-2" data-testid="evaluations-recommendations-list">
                {data.recommendations.map((rec) => (
                  <RecommendationCard key={rec.id} recommendation={rec} />
                ))}
              </div>
            )}
          </div>
        )}
      </EvaluationsSectionShell>
    </div>
  );
}

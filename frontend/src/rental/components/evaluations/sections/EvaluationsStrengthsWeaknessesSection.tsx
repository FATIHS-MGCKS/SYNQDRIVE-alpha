import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvaluationsAnalyticsSummaryResponse } from '@synq/evaluations-insights/evaluations-analytics-summary.contract';

interface EvaluationsStrengthsWeaknessesSectionProps {
  summary: EvaluationsAnalyticsSummaryResponse | null;
  loading: boolean;
}

export function EvaluationsStrengthsWeaknessesSection({
  summary,
  loading,
}: EvaluationsStrengthsWeaknessesSectionProps) {
  const { t } = useLanguage();
  const strengths = summary?.strengths;
  const weaknesses = summary?.weaknesses;
  const strengthItems = strengths?.data?.strengths ?? [];
  const weaknessItems = weaknesses?.data?.weaknesses ?? [];

  const surfaceState = loading && !summary ? 'loading' : 'ready';
  const isEmpty = !loading && strengthItems.length === 0 && weaknessItems.length === 0;

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.strengthsWeaknesses}
      title={t('evaluations.ia.sections.strengthsWeaknesses.title')}
      subtitle={t('evaluations.ia.sections.strengthsWeaknesses.subtitle')}
      sectionStatus={strengths?.status === 'ERROR' ? strengths.status : weaknesses?.status}
      surfaceState={isEmpty ? 'empty' : surfaceState}
      emptyTitle={t('evaluations.ia.sections.strengthsWeaknesses.emptyTitle')}
      emptyDescription={t('evaluations.ia.sections.strengthsWeaknesses.emptyDescription')}
      defaultOpen
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t('evaluations.ia.sections.strengthsWeaknesses.strengths')}
          </h3>
          <ul className="space-y-2">
            {strengthItems.slice(0, 6).map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-border/40 bg-[color:var(--status-success)]/[0.04] px-3 py-2"
              >
                <p className="text-[12px] font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground leading-relaxed">{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {t('evaluations.ia.sections.strengthsWeaknesses.weaknesses')}
          </h3>
          <ul className="space-y-2">
            {weaknessItems.slice(0, 6).map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-border/40 bg-[color:var(--status-watch)]/[0.04] px-3 py-2"
              >
                <p className="text-[12px] font-semibold text-foreground">{item.title}</p>
                <p className="mt-0.5 text-[10.5px] text-muted-foreground leading-relaxed">{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </EvaluationsSection>
  );
}

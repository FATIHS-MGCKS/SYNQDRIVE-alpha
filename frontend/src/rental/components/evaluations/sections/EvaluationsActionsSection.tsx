import type { DashboardInsight } from '../../../DashboardInsightsContext';
import { useLanguage } from '../../../i18n/LanguageContext';
import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { EvaluationsActionCenter } from '../EvaluationsActionCenter';

interface EvaluationsActionsSectionProps {
  businessRisks: DashboardInsight[];
  revenueLeakage: DashboardInsight[];
  insightsLoading: boolean;
  isDarkMode: boolean;
}

export function EvaluationsActionsSection({
  businessRisks: _businessRisks,
  revenueLeakage: _revenueLeakage,
  insightsLoading,
  isDarkMode,
}: EvaluationsActionsSectionProps) {
  const { t } = useLanguage();

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.actions}
      title={t('evaluations.ia.sections.actions.title')}
      subtitle={t('evaluations.ia.sections.actions.subtitle')}
      surfaceState={insightsLoading ? 'loading' : 'ready'}
      emptyTitle={t('evaluations.ia.sections.actions.emptyTitle')}
      emptyDescription={t('evaluations.ia.sections.actions.emptyDescription')}
      defaultOpen
    >
      <EvaluationsActionCenter isDarkMode={isDarkMode} />
    </EvaluationsSection>
  );
}

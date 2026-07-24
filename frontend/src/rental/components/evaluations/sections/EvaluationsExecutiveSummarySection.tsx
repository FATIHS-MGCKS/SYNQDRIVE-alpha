import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvaluationsAnalyticsHookResult } from '../../../hooks/useEvaluationsAnalyticsSummary.types';
import { EvaluationsExecutiveKpiStrip } from '../EvaluationsExecutiveKpiStrip';

interface EvaluationsExecutiveSummarySectionProps {
  analytics: EvaluationsAnalyticsHookResult;
}

export function EvaluationsExecutiveSummarySection({ analytics }: EvaluationsExecutiveSummarySectionProps) {
  const { t } = useLanguage();
  const envelope = analytics.summary?.executive;

  const surfaceState =
    analytics.loading && !analytics.summary ? 'loading' : envelope?.status === 'ERROR' ? 'error' : 'ready';

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.executive}
      title={t('evaluations.ia.sections.executive.title')}
      subtitle={t('evaluations.ia.sections.executive.subtitle')}
      sectionStatus={envelope?.status}
      surfaceState={surfaceState}
      errorMessage={envelope?.error}
      defaultOpen
    >
      <EvaluationsExecutiveKpiStrip analytics={analytics} />
    </EvaluationsSection>
  );
}

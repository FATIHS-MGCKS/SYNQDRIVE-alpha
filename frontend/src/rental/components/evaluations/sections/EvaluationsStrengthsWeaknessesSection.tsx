import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvaluationsAnalyticsSummaryResponse } from '@synq/evaluations-insights/evaluations-analytics-summary.contract';
import { EvaluationsSwCockpit } from '../EvaluationsSwCockpit';
import { resolveSwCockpit } from '@synq/evaluations-insights/evaluations-sw-cockpit';

interface EvaluationsStrengthsWeaknessesSectionProps {
  summary: EvaluationsAnalyticsSummaryResponse | null;
  loading: boolean;
}

export function EvaluationsStrengthsWeaknessesSection({
  summary,
  loading,
}: EvaluationsStrengthsWeaknessesSectionProps) {
  const { t, locale } = useLanguage();
  const analyticsLocale = locale === 'en' ? 'en' : 'de';

  const strengths = summary?.strengths;
  const weaknesses = summary?.weaknesses;

  const cockpit = resolveSwCockpit({
    strengths: strengths?.data?.strengths,
    weaknesses: weaknesses?.data?.weaknesses,
    strengthsStatus: strengths?.status,
    weaknessesStatus: weaknesses?.status,
    locale: analyticsLocale,
  });

  const surfaceState = loading && !summary ? 'loading' : 'ready';
  const isEmpty = !loading && cockpit.findings.length === 0;

  const emptyTitle =
    cockpit.emptyReason === 'INSUFFICIENT_DATA'
      ? t('evaluations.swCockpit.empty.titleInsufficient')
      : t('evaluations.ia.sections.strengthsWeaknesses.emptyTitle');

  const emptyDescription =
    cockpit.emptyReason === 'INSUFFICIENT_DATA'
      ? t('evaluations.swCockpit.empty.insufficientData')
      : cockpit.emptyReason === 'SECTION_ERROR'
        ? t('evaluations.swCockpit.empty.error')
        : cockpit.emptyReason === 'SECTION_UNAVAILABLE'
          ? t('evaluations.swCockpit.empty.unavailable')
          : t('evaluations.ia.sections.strengthsWeaknesses.emptyDescription');

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.strengthsWeaknesses}
      title={t('evaluations.ia.sections.strengthsWeaknesses.title')}
      subtitle={t('evaluations.swCockpit.sectionSubtitle')}
      sectionStatus={strengths?.status === 'ERROR' ? strengths.status : weaknesses?.status}
      surfaceState={isEmpty ? 'empty' : surfaceState}
      emptyTitle={emptyTitle}
      emptyDescription={emptyDescription}
      defaultOpen
    >
      <EvaluationsSwCockpit summary={summary} loading={loading} />
    </EvaluationsSection>
  );
}

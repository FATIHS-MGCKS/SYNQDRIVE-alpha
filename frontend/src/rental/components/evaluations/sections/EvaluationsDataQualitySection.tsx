import { buildUserDataQualityHint, isEvaluationsDataQualityAdmin } from '@synq/evaluations-insights/evaluations-data-quality-panel';
import { EvaluationsDataQualityAdminPanel } from '../EvaluationsDataQualityAdminPanel';
import { EvaluationsDataQualityUserHint } from '../EvaluationsDataQualityUserHint';
import { EvaluationsSection } from '../EvaluationsSection';
import { EVALUATIONS_SECTION_IDS } from '../evaluations-page.constants';
import { useLanguage } from '../../../i18n/LanguageContext';
import type { EvaluationsAnalyticsHookResult } from '../../../hooks/useEvaluationsAnalyticsSummary.types';
import type { EvaluationsDataQualityNavigationOptions } from '../../../lib/evaluations-data-quality-navigation';
import { useRentalOrg } from '../../../RentalContext';
import { useMemo } from 'react';

interface EvaluationsDataQualitySectionProps {
  analytics: EvaluationsAnalyticsHookResult;
  onNavigate?: (view: string, options?: EvaluationsDataQualityNavigationOptions) => void;
}

export function EvaluationsDataQualitySection({ analytics, onNavigate }: EvaluationsDataQualitySectionProps) {
  const { t } = useLanguage();
  const { userRole } = useRentalOrg();
  const isDqAdmin = isEvaluationsDataQualityAdmin(userRole);

  const userDataQualityHint = useMemo(
    () =>
      buildUserDataQualityHint(
        analytics.summary?.dataQuality?.data ?? null,
        analytics.summary?.dataQuality?.status,
      ),
    [analytics.summary?.dataQuality],
  );

  const surfaceState = analytics.loading && !analytics.summary ? 'loading' : 'ready';

  return (
    <EvaluationsSection
      id={EVALUATIONS_SECTION_IDS.dataQuality}
      title={t('evaluations.ia.sections.dataQuality.title')}
      subtitle={t('evaluations.ia.sections.dataQuality.subtitle')}
      sectionStatus={analytics.summary?.dataQuality?.status}
      surfaceState={surfaceState}
      defaultOpen={false}
    >
      {!isDqAdmin ? <EvaluationsDataQualityUserHint hint={userDataQualityHint} className="mb-3" /> : null}
      {isDqAdmin ? (
        <EvaluationsDataQualityAdminPanel
          dataQualityEnvelope={analytics.summary?.dataQuality}
          lineageData={analytics.summary?.lineage?.data ?? null}
          loading={analytics.loading}
          error={analytics.error}
          onRefresh={() => void analytics.refresh()}
          onNavigate={onNavigate}
        />
      ) : null}
    </EvaluationsSection>
  );
}

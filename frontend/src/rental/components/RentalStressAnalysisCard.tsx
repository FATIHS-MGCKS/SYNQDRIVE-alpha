import type { RentalDrivingAnalysisItem } from '../../lib/api';
import { useLanguage } from '../../i18n/LanguageContext';
import { StatusChip } from '../../components/patterns';
import { EmptyState } from '../../components/patterns';
import { Icon } from './ui/Icon';
import { VehicleStressPanel } from './VehicleStressPanel';
import {
  getDataConfidenceLabel,
  type DataConfidence,
} from '../lib/scoreFormat';
import {
  rentalAssessmentStatusI18nKey,
  resolveRentalAnalysisStressScore,
} from '../lib/rental-assessment-score';

interface RentalStressAnalysisCardProps {
  analysis: RentalDrivingAnalysisItem | null;
  loading?: boolean;
  title?: string;
}

export function RentalStressAnalysisCard({
  analysis,
  loading,
  title,
}: RentalStressAnalysisCardProps) {
  const { t } = useLanguage();
  const cardTitle = title ?? t('misuseStress.stress.cardTitle');

  if (loading) {
    return <div className=" surface-premium p-4 animate-pulse h-32" />;
  }

  if (!analysis?.payload) {
    return (
      <EmptyState
        icon={<Icon name="activity" className="w-6 h-6" />}
        title={t('misuseStress.stress.empty.title')}
        description={t('misuseStress.stress.empty.description')}
      />
    );
  }

  const payload = analysis.payload;
  const stress = payload.vehicleStressSummary;
  const meta = payload.analysisMeta;
  const wear = payload.wearImpactAssessment;
  const assessmentStatus = analysis.assessmentStatus ?? null;
  const stressScore = resolveRentalAnalysisStressScore(analysis);
  const assessmentLabelKey = rentalAssessmentStatusI18nKey(assessmentStatus);
  const scorePublishable = stressScore != null;

  return (
    <div className="space-y-4">
      {assessmentLabelKey && (
        <div className="flex flex-col gap-1 px-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              {t('misuseStress.stress.assessmentStatus.label')}
            </span>
            <StatusChip
              tone={
                assessmentStatus === 'COMPLETE'
                  ? 'success'
                  : assessmentStatus === 'PARTIAL'
                    ? 'info'
                    : 'neutral'
              }
              className="text-[9px]"
            >
              {t(assessmentLabelKey)}
            </StatusChip>
          </div>
          {!scorePublishable && (
            <p className="text-[11px] text-muted-foreground">
              {t('misuseStress.stress.scoreNotPublished')}
            </p>
          )}
        </div>
      )}

      <VehicleStressPanel
        title={cardTitle}
        stressScore={stressScore}
        stressLevel={scorePublishable ? (stress?.stressLevel ?? null) : null}
        components={scorePublishable ? (stress ?? undefined) : undefined}
        hasEnoughData={scorePublishable && (meta?.dataConfidence !== 'low' || stressScore != null)}
        dataConfidence={(meta?.dataConfidence as DataConfidence) ?? null}
        footnote={t('misuseStress.stress.footnote')}
      />

      {scorePublishable && stress?.summary && (
        <p className="text-xs text-muted-foreground px-1">{stress.summary}</p>
      )}

      {payload.overallAssessment?.shortSummary && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
            {t('misuseStress.stress.overallAssessment')}
          </p>
          <p className="text-xs text-foreground">{payload.overallAssessment.shortSummary}</p>
        </div>
      )}

      {wear && (
        <div className="rounded-lg surface-premium p-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            {t('misuseStress.stress.wearRelevance')}
          </p>
          <p className="text-xs text-foreground mb-2">{wear.summary}</p>
          {wear.affectedAreas && wear.affectedAreas.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {wear.affectedAreas.map((area) => (
                <StatusChip
                  key={area.area}
                  tone={
                    area.impact === 'high'
                      ? 'warning'
                      : area.impact === 'medium'
                        ? 'info'
                        : 'neutral'
                  }
                  className="text-[9px]"
                >
                  {area.area}:{' '}
                  {(['low', 'medium', 'medium_to_high', 'high'] as const).includes(
                    area.impact as 'low' | 'medium' | 'medium_to_high' | 'high',
                  )
                    ? t(
                        `misuseStress.stress.wearImpact.${area.impact}` as
                          | 'misuseStress.stress.wearImpact.low'
                          | 'misuseStress.stress.wearImpact.medium'
                          | 'misuseStress.stress.wearImpact.medium_to_high'
                          | 'misuseStress.stress.wearImpact.high',
                      )
                    : area.impact}
                </StatusChip>
              ))}
            </div>
          )}
        </div>
      )}

      {payload.watchpoints && payload.watchpoints.length > 0 && (
        <div className="rounded-lg surface-premium p-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            {t('misuseStress.stress.watchpoints')}
          </p>
          <ul className="space-y-1">
            {payload.watchpoints.slice(0, 5).map((w) => (
              <li key={w} className="text-[11px] text-muted-foreground">
                • {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {meta && (
        <p className="text-[10px] text-muted-foreground px-1">
          {meta.scoredTripCount != null
            ? t('misuseStress.stress.meta.scoredTrips', { count: meta.scoredTripCount })
            : ''}
          {meta.totalDistanceKm != null
            ? ` · ${t('misuseStress.stress.meta.distanceKm', { km: Math.round(meta.totalDistanceKm) })}`
            : ''}
          {meta.dataConfidence
            ? ` · ${getDataConfidenceLabel(meta.dataConfidence as DataConfidence)}`
            : ''}
        </p>
      )}
    </div>
  );
}
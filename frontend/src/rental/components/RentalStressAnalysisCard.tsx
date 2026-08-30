import type { RentalDrivingAnalysisItem } from '../../lib/api';
import { StatusChip } from '../../components/patterns';
import { EmptyState } from '../../components/patterns';
import { useLanguage } from '../../i18n/LanguageContext';
import { Icon } from './ui/Icon';
import { VehicleStressPanel } from './VehicleStressPanel';
import {
  resolveDrivingStressScore,
  type DataConfidence,
} from '../lib/scoreFormat';
import {
  resolveStressDataConfidenceLabel,
  resolveStressFootnote,
  resolveWearImpactLabel,
} from '../lib/rental-misuse-stress-i18n';

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
  const { t, locale } = useLanguage();
  const resolvedTitle = title ?? t('misuseStress.stress.cardTitle');

  if (loading) {
    return (
      <div className="rounded-xl border border-border surface-premium p-4 animate-pulse h-32" />
    );
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

  const stressScore =
    stress?.drivingStressScore ??
    resolveDrivingStressScore({ drivingScore: analysis.drivingScore });

  const metaParts: string[] = [];
  if (meta?.scoredTripCount != null) {
    metaParts.push(
      t('misuseStress.stress.meta.scoredTrips', { count: meta.scoredTripCount }),
    );
  }
  if (meta?.totalDistanceKm != null) {
    metaParts.push(
      t('misuseStress.stress.meta.distanceKm', { km: Math.round(meta.totalDistanceKm) }),
    );
  }
  if (meta?.dataConfidence) {
    metaParts.push(
      resolveStressDataConfidenceLabel(locale, meta.dataConfidence as DataConfidence),
    );
  }

  return (
    <div className="space-y-4">
      <VehicleStressPanel
        title={resolvedTitle}
        stressScore={stressScore}
        stressLevel={stress?.stressLevel ?? null}
        components={stress ?? undefined}
        hasEnoughData={meta?.dataConfidence !== 'low' || stressScore != null}
        dataConfidence={(meta?.dataConfidence as DataConfidence) ?? null}
        footnote={resolveStressFootnote(locale)}
      />

      {stress?.summary && (
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
        <div className="rounded-lg border border-border surface-premium p-4">
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
                  {area.area}: {resolveWearImpactLabel(locale, area.impact)}
                </StatusChip>
              ))}
            </div>
          )}
        </div>
      )}

      {payload.watchpoints && payload.watchpoints.length > 0 && (
        <div className="rounded-lg border border-border surface-premium p-4">
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

      {metaParts.length > 0 && (
        <p className="text-[10px] text-muted-foreground px-1">{metaParts.join(' · ')}</p>
      )}
    </div>
  );
}

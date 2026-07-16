import type { RentalDrivingAnalysisItem } from '../../lib/api';
import { StatusChip } from '../../components/patterns';
import { EmptyState } from '../../components/patterns';
import { Icon } from './ui/Icon';
import { VehicleStressPanel } from './VehicleStressPanel';
import {
  getDataConfidenceLabel,
  type DataConfidence,
} from '../lib/scoreFormat';

interface RentalStressAnalysisCardProps {
  analysis: RentalDrivingAnalysisItem | null;
  loading?: boolean;
  title?: string;
}

const WEAR_LABELS: Record<string, string> = {
  low: 'Gering',
  medium: 'Mittel',
  medium_to_high: 'Mittel bis hoch',
  high: 'Hoch',
};

export function RentalStressAnalysisCard({
  analysis,
  loading,
  title = 'Fahrbelastung der Miete',
}: RentalStressAnalysisCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border surface-premium p-4 animate-pulse h-32" />
    );
  }

  if (!analysis?.payload) {
    return (
      <EmptyState
        icon={<Icon name="activity" className="w-6 h-6" />}
        title="Noch keine Fahrbelastungsauswertung"
        description="Nach abgeschlossener Miete mit Telemetrie erscheint hier das Belastungsprofil für Reifen, Bremsen und Fahrzeug."
      />
    );
  }

  const payload = analysis.payload;
  const stress = payload.vehicleStressSummary;
  const meta = payload.analysisMeta;
  const wear = payload.wearImpactAssessment;

  const stressScore = stress?.drivingStressScore ?? analysis.drivingStressScore ?? null;

  return (
    <div className="space-y-4">
      <VehicleStressPanel
        title={title}
        stressScore={stressScore}
        stressLevel={stress?.stressLevel ?? null}
        components={stress ?? undefined}
        hasEnoughData={meta?.dataConfidence !== 'low' || stressScore != null}
        dataConfidence={(meta?.dataConfidence as DataConfidence) ?? null}
        footnote="SynqDrive bewertet hier die technische Fahrzeugbelastung — nicht moralisch den Fahrer. Speeding/Safety-Compliance wird im Rental nicht bewertet."
      />

      {stress?.summary && (
        <p className="text-xs text-muted-foreground px-1">{stress.summary}</p>
      )}

      {payload.overallAssessment?.shortSummary && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-1">
            Gesamteinschätzung
          </p>
          <p className="text-xs text-foreground">{payload.overallAssessment.shortSummary}</p>
        </div>
      )}

      {wear && (
        <div className="rounded-lg border border-border surface-premium p-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Verschleißrelevanz
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
                  {area.area}: {WEAR_LABELS[area.impact] ?? area.impact}
                </StatusChip>
              ))}
            </div>
          )}
        </div>
      )}

      {payload.watchpoints && payload.watchpoints.length > 0 && (
        <div className="rounded-lg border border-border surface-premium p-4">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
            Hinweise
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
          {meta.scoredTripCount != null ? `${meta.scoredTripCount} bewertete Fahrten` : ''}
          {meta.totalDistanceKm != null ? ` · ${Math.round(meta.totalDistanceKm)} km` : ''}
          {meta.dataConfidence ? ` · ${getDataConfidenceLabel(meta.dataConfidence as DataConfidence)}` : ''}
        </p>
      )}
    </div>
  );
}

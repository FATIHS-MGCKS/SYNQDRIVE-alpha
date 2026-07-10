import { AlertTriangle } from 'lucide-react';
import { StatusChip } from '../../../components/patterns';
import { useDrivingAssessmentQuality } from '../../hooks/useDrivingAssessmentQuality';

export function VehicleDrivingAssessmentQualityChip({
  vehicleId,
  compact = false,
}: {
  vehicleId: string | null;
  compact?: boolean;
}) {
  const { loading, showWarning, isRecovering, status } = useDrivingAssessmentQuality(vehicleId);

  if (!vehicleId || loading || !showWarning) return null;

  const label = isRecovering
    ? compact
      ? 'Fahrbew. erholt sich'
      : 'Fahrbewertung normalisiert sich'
    : compact
      ? 'Fahrbew. eingeschränkt'
      : 'Fahrbewertung eingeschränkt';

  const title =
    status === 'RECOVERING'
      ? 'Die native Event-Qualität verbessert sich — Fahrbewertung noch mit Vorsicht nutzen. Trips und Telematik bleiben verfügbar.'
      : 'Das LTE-Gerät sendet ungewöhnlich viele native Fahrereignisse. Die automatische Fahrbewertung kann unzuverlässig sein (DIMO: Steckung/Kalibrierung prüfen).';

  return (
    <StatusChip
      tone={isRecovering ? 'info' : 'watch'}
      className={compact ? '!px-1.5 !py-0.5 !text-[9px]' : undefined}
      title={title}
    >
      <span className="inline-flex items-center gap-1">
        <AlertTriangle className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
        {label}
      </span>
    </StatusChip>
  );
}

export function VehicleDrivingAssessmentQualityOverviewCard({
  vehicleId,
}: {
  vehicleId: string;
}) {
  const { loading, showWarning, isRecovering, data } = useDrivingAssessmentQuality(vehicleId);

  if (loading || !showWarning || !data?.applicable) return null;

  return (
    <div className="surface-premium rounded-2xl border border-[color:var(--status-watch)]/25 bg-[color:var(--status-watch)]/5 p-4">
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 h-4 w-4 shrink-0 ${isRecovering ? 'text-[color:var(--status-info)]' : 'text-[color:var(--status-watch)]'}`}
          aria-hidden
        />
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-foreground">
            {isRecovering ? 'Fahrbewertung normalisiert sich' : 'Fahrbewertung eingeschränkt'}
          </p>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {isRecovering
              ? 'Die native Event-Qualität verbessert sich. Fahrbewertung und Fahr-Score weiterhin mit Vorsicht nutzen — Trips und Telematik bleiben verfügbar.'
              : 'Das LTE-R1-Gerät sendet derzeit ungewöhnlich viele native Fahrereignisse. Laut DIMO kann die Ursache eine lose OBD-Steckung oder Fehlkalibrierung sein. Betroffen ist nur die automatische Fahrbewertung.'}
          </p>
          {data.orgBaseline?.sufficient ? (
            <p className="text-[11px] text-muted-foreground/80">
              Flotten-Baseline (LTE R1): median {data.orgBaseline.medianEventsPerKm?.toFixed(2) ?? '—'} Events/km
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

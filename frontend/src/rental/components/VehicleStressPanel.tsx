import { StatusChip } from '../../components/patterns';
import {
  formatStressScore,
  getDataConfidenceLabel,
  getStressDescription,
  getStressLabel,
  getStressLevel,
  getStressTone,
  SCORE_EM_DASH,
  stressToneToStatusTone,
  type DataConfidence,
  type StressLevel,
} from '../lib/scoreFormat';
import {
  getStressScoreMissingMessage,
  type StressScoreMissingContext,
} from '../components/trips/trip-assessment-copy';

export interface VehicleStressComponents {
  drivingStressScore?: number | null;
  stressLevel?: StressLevel | null;
  longitudinalStressScore?: number | null;
  brakingStressScore?: number | null;
  stopGoStressScore?: number | null;
  highSpeedStressScore?: number | null;
  thermalBrakeStressScore?: number | null;
}

interface VehicleStressPanelProps {
  title?: string;
  stressScore?: number | null;
  stressLevel?: StressLevel | null;
  components?: VehicleStressComponents | null;
  hasEnoughData?: boolean;
  dataConfidence?: DataConfidence | string | null;
  compact?: boolean;
  footnote?: string;
  /** Separates Fahrbelastung from Fahrverhalten when the stress score is missing. */
  stressMissingContext?: StressScoreMissingContext;
}

const COMPONENT_ROWS: Array<{
  key: keyof VehicleStressComponents;
  label: string;
}> = [
  { key: 'longitudinalStressScore', label: 'Beschleunigungsbelastung' },
  { key: 'brakingStressScore', label: 'Bremsbelastung' },
  { key: 'stopGoStressScore', label: 'Stop-and-Go' },
  { key: 'highSpeedStressScore', label: 'High-Speed-Belastung' },
  { key: 'thermalBrakeStressScore', label: 'Thermische Bremsbelastung' },
];

function ComponentRow({
  label,
  score,
}: {
  label: string;
  score: number | null | undefined;
}) {
  if (score == null) return null;
  const level = getStressLevel(score);
  const tone = stressToneToStatusTone(getStressTone(level));
  return (
    <div className="flex items-center justify-between gap-2 text-[11px]">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-semibold tabular-nums text-foreground">{Math.round(score)}</span>
        <StatusChip tone={tone} className="text-[9px]">
          {getStressLabel(level)}
        </StatusChip>
      </div>
    </div>
  );
}

export function VehicleStressPanel({
  title = 'Fahrbelastung',
  stressScore,
  stressLevel,
  components,
  hasEnoughData = true,
  dataConfidence,
  compact = false,
  footnote,
  stressMissingContext,
}: VehicleStressPanelProps) {
  const display = formatStressScore(stressScore, {
    hasEnoughData,
    level: stressLevel ?? undefined,
  });
  const resolvedLevel = stressLevel ?? display.level;
  const hasComponentData =
    components != null &&
    COMPONENT_ROWS.some((row) => components[row.key] != null);

  if (display.isMissing) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground mb-2">
          {title}
        </h4>
        <p className="text-xs text-muted-foreground">
          {getStressScoreMissingMessage(stressMissingContext)}
        </p>
        {dataConfidence && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Datenbasis: {getDataConfidenceLabel(dataConfidence as DataConfidence)}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
            {title}
          </h4>
          {!compact && (
            <p className="text-[11px] text-muted-foreground mt-1 max-w-prose">
              {getStressDescription(resolvedLevel)}
            </p>
          )}
        </div>
        <StatusChip tone={stressToneToStatusTone(display.tone)} dot>
          {display.label}
        </StatusChip>
      </div>

      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-foreground">{display.compact}</span>
        <span className="text-xs text-muted-foreground">/ 100 Belastung</span>
      </div>

      {!compact && hasComponentData && components && (
        <div className="pt-2 border-t border-border/60 space-y-2">
          <p className="text-[9px] uppercase tracking-wider font-semibold text-muted-foreground">
            Belastungskomponenten
          </p>
          {COMPONENT_ROWS.map((row) => (
            <ComponentRow
              key={row.key}
              label={row.label}
              score={components[row.key] as number | null | undefined}
            />
          ))}
        </div>
      )}

      {!compact && !hasComponentData && stressScore != null && (
        <p className="text-[10px] text-muted-foreground">
          Einzelne Belastungskomponenten liegen für diese Fahrt nicht vor.
        </p>
      )}

      {dataConfidence && (
        <p className="text-[10px] text-muted-foreground">
          Datenbasis: {getDataConfidenceLabel(dataConfidence as DataConfidence)}
        </p>
      )}

      {footnote && <p className="text-[10px] text-muted-foreground">{footnote}</p>}
    </div>
  );
}

export function VehicleStressBadge({
  stressScore,
  stressLevel,
  hasEnoughData = true,
}: {
  stressScore?: number | null;
  stressLevel?: StressLevel | null;
  hasEnoughData?: boolean;
}) {
  const display = formatStressScore(stressScore, {
    hasEnoughData,
    level: stressLevel ?? undefined,
  });
  if (display.isMissing) {
    return (
      <span className="text-[10px] text-muted-foreground" title={display.label}>
        {SCORE_EM_DASH}
      </span>
    );
  }
  return (
    <StatusChip
      tone={stressToneToStatusTone(display.tone)}
      className="text-[9px]"
      title={`Fahrbelastung ${display.outOf100} — ${display.label}`}
    >
      {display.label}
    </StatusChip>
  );
}

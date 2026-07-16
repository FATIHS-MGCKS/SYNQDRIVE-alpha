import { StatusChip } from '../../components/patterns';
import {
  formatStressScore,
  getDataConfidenceLabel,
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
import { StressDonut } from './trips/StressDonut';

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
  comparabilityHint?: string | null;
  modelProfileLabel?: string | null;
  rollingWindowFootnote?: string | null;
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

/** Mechanical vehicle-load copy — not driver judgment. */
function getMechanicalStressDescription(level: StressLevel | null): string {
  switch (level) {
    case 'low':
      return 'Geringe mechanische Fahrzeugbelastung auf Reifen, Bremsen und Antrieb.';
    case 'moderate':
      return 'Moderate Fahrzeugbelastung — Verschleiß im normalen Rahmen.';
    case 'high':
      return 'Hohe Fahrzeugbelastung — technische Prüfung bei wiederholtem Auftreten sinnvoll.';
    case 'critical':
      return 'Kritische Fahrzeugbelastung — Fahrzeugzustand prüfen.';
    default:
      return 'Fahrbelastungs-Score für diese Fahrt nicht verfügbar.';
  }
}

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
  comparabilityHint,
  modelProfileLabel,
  rollingWindowFootnote,
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
      <div className="h-full rounded-xl border border-border surface-premium p-4">
        <h4 className="mb-2 text-[12px] font-semibold text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground">
          {getStressScoreMissingMessage(stressMissingContext)}
        </p>
        {dataConfidence && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Datenbasis: {getDataConfidenceLabel(dataConfidence as DataConfidence)}
          </p>
        )}
        {comparabilityHint && (
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
            {modelProfileLabel ? (
              <span className="font-medium text-foreground/80">{modelProfileLabel}: </span>
            ) : null}
            {comparabilityHint}
          </p>
        )}
      </div>
    );
  }

  const scoreValue = stressScore ?? 0;
  const levelForDonut = resolvedLevel ?? getStressLevel(scoreValue) ?? 'moderate';

  return (
    <div className="flex h-full flex-col rounded-xl border border-border surface-premium p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-2">
          <h4 className="text-[12px] font-semibold text-foreground">{title}</h4>
          {!compact && (
            <p className="max-w-prose text-[11px] leading-relaxed text-muted-foreground">
              {getMechanicalStressDescription(levelForDonut)}
            </p>
          )}
          <StatusChip tone={stressToneToStatusTone(display.tone)} dot>
            {display.label}
          </StatusChip>
        </div>

        <div className="flex shrink-0 flex-col items-center gap-1 self-center sm:self-auto">
          <StressDonut score={scoreValue} level={levelForDonut} size={88} />
          <span className="text-[10px] font-medium text-muted-foreground">Belastung</span>
        </div>
      </div>

      {!compact && hasComponentData && components && (
        <div className="mt-4 space-y-2 border-t border-border/60 pt-3">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
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

      {dataConfidence && (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Datenbasis: {getDataConfidenceLabel(dataConfidence as DataConfidence)}
        </p>
      )}

      {footnote && <p className="mt-2 text-[10px] text-muted-foreground">{footnote}</p>}

      {rollingWindowFootnote && (
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          {rollingWindowFootnote}
        </p>
      )}

      {comparabilityHint && (
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          {modelProfileLabel ? (
            <span className="font-medium text-foreground/80">{modelProfileLabel}: </span>
          ) : null}
          {comparabilityHint}
        </p>
      )}
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

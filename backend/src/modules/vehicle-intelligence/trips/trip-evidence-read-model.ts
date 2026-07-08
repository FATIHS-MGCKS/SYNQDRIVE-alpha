import type {
  TripClickHouseEvidenceDto,
  TripEvidenceGpsCoverage,
  TripSignalAvailabilityEvidence,
} from '@modules/clickhouse/trip-evidence.types';
import type { TripSignalQualityResult } from '@modules/clickhouse/clickhouse-hf.types';

export interface BuildTripEvidenceSummaryInput {
  signalQuality: TripSignalQualityResult;
  snapshotSampleCount: number | null;
  hfEventCount: number;
  gpsPointCount: number;
  signalAvailability: TripSignalAvailabilityEvidence;
  hfMirrorEnabled: boolean;
}

/**
 * Builds operator-facing evidence bullets (German) — never score conclusions.
 */
export function buildTripEvidenceSummary(
  input: BuildTripEvidenceSummaryInput,
): string[] {
  const bullets: string[] = [];
  const { signalQuality, signalAvailability } = input;

  if (!input.hfMirrorEnabled) {
    bullets.push('HF-Mirror in ClickHouse ist deaktiviert (HF_MIRROR_ENABLED).');
  }

  if (signalQuality.degraded) {
    bullets.push('ClickHouse-Evidence ist eingeschränkt oder nicht erreichbar.');
  }

  if (signalQuality.hfPointCount > 0) {
    bullets.push(
      `${signalQuality.hfPointCount} HF-Signalpunkte für diese Fahrt gespiegelt.`,
    );
  } else {
    bullets.push('Keine HF-Signalpunkte in ClickHouse für diese Fahrt.');
  }

  if (input.hfEventCount > 0) {
    bullets.push(`${input.hfEventCount} HF-Ereignisse aus Mirror verfügbar.`);
  }

  if (input.snapshotSampleCount != null && input.snapshotSampleCount > 0) {
    bullets.push(
      `${input.snapshotSampleCount} Snapshot-Samples im Fahrtfenster (~30s-Ebene).`,
    );
  } else if (input.snapshotSampleCount === 0) {
    bullets.push('Keine Snapshot-Samples im Fahrtfenster.');
  }

  const hfLabel = qualityLabelDe(signalQuality.overallQuality);
  bullets.push(`HF-Signalqualität (Evidence): ${hfLabel}.`);

  if (signalAvailability.rpm) {
    bullets.push('RPM-Daten in HF-Evidence verfügbar.');
  } else {
    bullets.push('RPM-Daten in HF-Evidence fehlen.');
  }

  if (signalAvailability.engineLoad) {
    bullets.push('Engine-Load-Daten verfügbar.');
  } else {
    bullets.push('Engine-Load-Daten fehlen.');
  }

  if (signalAvailability.throttle) {
    bullets.push('Throttle-Daten verfügbar.');
  } else {
    bullets.push('Throttle-Daten fehlen.');
  }

  const gps = deriveGpsCoverageLabel(input.gpsPointCount);
  if (gps === 'available') {
    bullets.push('GPS-Abdeckung in HF-Evidence vorhanden.');
  } else if (gps === 'sparse') {
    bullets.push('GPS-Abdeckung in HF-Evidence dünn (downsampled).');
  } else {
    bullets.push('Keine GPS-Punkte in HF-Evidence für diese Fahrt.');
  }

  for (const reason of signalQuality.reasons.slice(0, 3)) {
    if (!bullets.includes(reason)) {
      bullets.push(reason);
    }
  }

  return bullets;
}

export function deriveGpsCoverage(gpsPointCount: number): TripEvidenceGpsCoverage {
  if (gpsPointCount <= 0) return 'missing';
  if (gpsPointCount < 3) return 'sparse';
  return 'available';
}

function deriveGpsCoverageLabel(
  gpsPointCount: number,
): TripEvidenceGpsCoverage {
  return deriveGpsCoverage(gpsPointCount);
}

function qualityLabelDe(
  q: TripClickHouseEvidenceDto['signalQuality'],
): string {
  switch (q) {
    case 'good':
      return 'gut';
    case 'medium':
      return 'mittel';
    case 'weak':
      return 'schwach';
    default:
      return 'nicht verfügbar';
  }
}

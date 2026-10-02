import type { NormalizedPositionObservation, TelemetrySourceFamily } from '../types';

function addMsIso(iso: string, deltaMs: number): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO label: ${iso}`);
  }
  return new Date(ms + deltaMs).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function buildRowAbsentObservation(
  bucketLabel: string,
  sourceFamily: TelemetrySourceFamily,
): NormalizedPositionObservation {
  const intervalEnd = addMsIso(bucketLabel, 1000);
  const referenceTime = addMsIso(bucketLabel, 500);
  return {
    bucketLabel,
    intervalStart: bucketLabel,
    intervalEnd,
    referenceTime,
    availability: 'ROW_ABSENT',
    sourceFamily,
    provenance: { sourceSignal: 'currentLocationCoordinates', derivedFrom: ['grid_densify'] },
  };
}

/**
 * Ensures 1 Hz labels between gridStart and gridEnd inclusive.
 * Existing observations win; missing labels become ROW_ABSENT.
 */
export function densifyPositionGrid(
  observations: NormalizedPositionObservation[],
  gridStart: string,
  gridEnd: string,
  sourceFamily: TelemetrySourceFamily,
): NormalizedPositionObservation[] {
  const byLabel = new Map<string, NormalizedPositionObservation>();
  for (const obs of observations) {
    if (!byLabel.has(obs.bucketLabel)) {
      byLabel.set(obs.bucketLabel, obs);
    }
  }
  const out: NormalizedPositionObservation[] = [];
  let cursor = gridStart;
  const endMs = Date.parse(gridEnd);
  while (Date.parse(cursor) <= endMs) {
    out.push(byLabel.get(cursor) ?? buildRowAbsentObservation(cursor, sourceFamily));
    cursor = addMsIso(cursor, 1000);
  }
  return out;
}

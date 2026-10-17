/**
 * LDI-07 — historical S4 offline reconstruction feasibility (read-only).
 */
export const LDI07_VEHICLE_ID = '8c850ff1-4201-432b-af2e-2711dbc7ca48';
export const LDI07_ORG_ID = 'faa710c9-6d91-4079-a7d5-91fdccdec14a';
export const LDI07_PRIMARY_TRIP_ID = 'a682d3df-545a-4a8a-aa14-d45c23fae985';
export const LDI07_FUSION_ALTERNATE_TRIP_ID = 'f3e1fa83-d1e3-46b9-9ab8-14b4676ec5c9';

export type GpsGapSummary = {
  gapThresholdSeconds: number;
  gapRunCount: number;
  maxGapSeconds: number;
  gapsGte3s: number;
};

export type NativeAlignmentRow = {
  eventId: string;
  eventType: string;
  recordedAtUtc: string;
  bucketLabelUtc: string;
  waypointAtBucket: boolean;
  nearestWaypointDeltaMs: number | null;
  eventSpeedKmh: number | null;
  l3SpeedAtBucketKmh: number | null;
};

export function buildLdi07ResultLines(input: {
  rawGpsAvailable: string;
  gpsSampleCount: number;
  gpsCadence: string;
  gpsGaps: string;
  offlineFeasible: string;
  expectedTrustedCoverage: string;
  hfAvailable: string;
  obdAvailable: string;
  nativeAligned: string;
  independentValidationFeasible: string;
  fusionReadiness: string;
  nextSafeAction: string;
}): string[] {
  return [
    'LDI07_RESULT=HISTORICAL_S4_RECONSTRUCTION_AUDIT_COMPLETE',
    `RAW_GPS_AVAILABLE=${input.rawGpsAvailable}`,
    `GPS_SAMPLE_COUNT=${input.gpsSampleCount}`,
    `GPS_CADENCE=${input.gpsCadence}`,
    `GPS_GAPS=${input.gpsGaps}`,
    `OFFLINE_S4_RECONSTRUCTION_FEASIBLE=${input.offlineFeasible}`,
    `EXPECTED_TRUSTED_COVERAGE=${input.expectedTrustedCoverage}`,
    `HF_AVAILABLE=${input.hfAvailable}`,
    `OBD_AVAILABLE=${input.obdAvailable}`,
    `NATIVE_EVENTS_ALIGNED=${input.nativeAligned}`,
    `INDEPENDENT_VALIDATION_FEASIBLE=${input.independentValidationFeasible}`,
    `FUSION_READINESS=${input.fusionReadiness}`,
    `NEXT_SAFE_ACTION=${input.nextSafeAction}`,
    'PRODUCTION_MUTATIONS=NONE',
  ];
}

export function analyzeInterWaypointCadence(
  sortedTimesMs: number[],
  gapThresholdSeconds = 3,
): { medianDeltaMs: number | null; p95DeltaMs: number | null; summary: GpsGapSummary } {
  const deltas: number[] = [];
  let gapRuns = 0;
  let maxGap = 0;
  let gapsGte3 = 0;
  for (let i = 1; i < sortedTimesMs.length; i++) {
    const d = sortedTimesMs[i] - sortedTimesMs[i - 1];
    if (d > 0) deltas.push(d);
    if (d > gapThresholdSeconds * 1000) {
      gapRuns += 1;
      gapsGte3 += 1;
      maxGap = Math.max(maxGap, d / 1000);
    }
  }
  deltas.sort((a, b) => a - b);
  const median = deltas.length ? deltas[Math.floor(deltas.length / 2)] : null;
  const p95 = deltas.length ? deltas[Math.floor(deltas.length * 0.95)] : null;
  return {
    medianDeltaMs: median,
    p95DeltaMs: p95,
    summary: {
      gapThresholdSeconds,
      gapRunCount: gapRuns,
      maxGapSeconds: maxGap,
      gapsGte3s: gapsGte3,
    },
  };
}

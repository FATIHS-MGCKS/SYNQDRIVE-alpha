import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';

export const HV_R22_COUNTER_TEMPORAL_COVERAGE_SCHEMA_V1 =
  'hv-r22-counter-temporal-v1' as const;

export interface HvChargingCounterReturnedRowNumericCoverageV1 {
  returnedRowCount: number;
  numericLastCount: number;
  nullLastCount: number;
  returnedRowNumericCoverageRatio: number | null;
}

export interface HvChargingCounterTemporalCoverageV1 {
  schemaVersion: typeof HV_R22_COUNTER_TEMPORAL_COVERAGE_SCHEMA_V1;
  /** Inclusive 1m provider slots implied by the query window span. */
  expectedMinuteGridSlots: number;
  /** Returned provider rows whose timestamps fall inside the query window. */
  observedMinuteGridSlots: number;
  missingMinuteGridSlots: number;
  temporalCoverageRatio: number | null;
  /** Longest gap between consecutive returned rows (minutes). 0 when ≤1 row. */
  longestTemporalGapMinutes: number;
  /** Sum of missing interior minute steps between consecutive returned row timestamps. */
  missingMinuteGapsBetweenReturnedRows: number;
}

export type HvChargingCounterTemporalCompletenessQualityV1 =
  | 'COMPLETE_MINUTE_GRID'
  | 'PARTIAL_MINUTE_GRID'
  | 'SPARSE_MINUTE_GRID';

function parseMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Provider-aligned 1m query window slot count (matches R22 boundary forensics
 * `expectedMinutes` and P1C pilot forensics).
 */
function expectedProviderMinuteSlots(queryFromMs: number, queryToMs: number): number {
  return Math.max(0, Math.floor((queryToMs - queryFromMs) / 60_000)) + 1;
}

export function analyzeHvChargingCounterReturnedRowNumericCoverageV1(
  rows: HvChargingCounterDimoIntervalRowV1[],
): HvChargingCounterReturnedRowNumericCoverageV1 {
  let numericLastCount = 0;
  let nullLastCount = 0;
  for (const row of rows) {
    const last = row.addedKwhLast;
    if (typeof last === 'number' && Number.isFinite(last)) numericLastCount++;
    else nullLastCount++;
  }
  const returnedRowCount = rows.length;
  return {
    returnedRowCount,
    numericLastCount,
    nullLastCount,
    returnedRowNumericCoverageRatio:
      returnedRowCount > 0 ? numericLastCount / returnedRowCount : null,
  };
}

export function analyzeHvChargingCounterTemporalCoverageV1(input: {
  queryFromInclusive: string;
  queryToInclusive: string;
  rows: HvChargingCounterDimoIntervalRowV1[];
}): HvChargingCounterTemporalCoverageV1 {
  const queryFromMs = parseMs(input.queryFromInclusive);
  const queryToMs = parseMs(input.queryToInclusive);

  if (queryFromMs == null || queryToMs == null || queryToMs < queryFromMs) {
    return {
      schemaVersion: HV_R22_COUNTER_TEMPORAL_COVERAGE_SCHEMA_V1,
      expectedMinuteGridSlots: 0,
      observedMinuteGridSlots: 0,
      missingMinuteGridSlots: 0,
      temporalCoverageRatio: null,
      longestTemporalGapMinutes: 0,
      missingMinuteGapsBetweenReturnedRows: 0,
    };
  }

  const sorted = [...input.rows].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  let observedMinuteGridSlots = 0;
  for (const row of sorted) {
    const ms = parseMs(row.timestamp);
    if (ms == null) continue;
    if (ms < queryFromMs || ms > queryToMs) continue;
    observedMinuteGridSlots++;
  }

  const expectedMinuteGridSlots = expectedProviderMinuteSlots(
    queryFromMs,
    queryToMs,
  );
  const missingMinuteGridSlots = Math.max(
    0,
    expectedMinuteGridSlots - observedMinuteGridSlots,
  );

  let missingMinuteGapsBetweenReturnedRows = 0;
  let longestTemporalGapMinutes = 0;
  let prevMs: number | null = null;
  for (const row of sorted) {
    const ms = parseMs(row.timestamp);
    if (ms == null) continue;
    if (prevMs != null && ms > prevMs) {
      const gapMinutes = Math.round((ms - prevMs) / 60_000);
      if (gapMinutes > 1) {
        missingMinuteGapsBetweenReturnedRows += gapMinutes - 1;
        longestTemporalGapMinutes = Math.max(longestTemporalGapMinutes, gapMinutes);
      }
    }
    prevMs = ms;
  }

  return {
    schemaVersion: HV_R22_COUNTER_TEMPORAL_COVERAGE_SCHEMA_V1,
    expectedMinuteGridSlots,
    observedMinuteGridSlots,
    missingMinuteGridSlots,
    temporalCoverageRatio:
      expectedMinuteGridSlots > 0
        ? observedMinuteGridSlots / expectedMinuteGridSlots
        : null,
    longestTemporalGapMinutes,
    missingMinuteGapsBetweenReturnedRows,
  };
}

export function resolveHvChargingCounterTemporalCompletenessQualityV1(
  temporal: HvChargingCounterTemporalCoverageV1,
): HvChargingCounterTemporalCompletenessQualityV1 {
  if (
    temporal.expectedMinuteGridSlots > 0 &&
    temporal.missingMinuteGridSlots === 0 &&
    temporal.longestTemporalGapMinutes <= 1
  ) {
    return 'COMPLETE_MINUTE_GRID';
  }
  const ratio = temporal.temporalCoverageRatio;
  if (ratio != null && ratio >= 0.85) {
    return 'PARTIAL_MINUTE_GRID';
  }
  return 'SPARSE_MINUTE_GRID';
}

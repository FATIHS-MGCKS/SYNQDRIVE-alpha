import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';

export type HvChargingCounterCapabilityVerdictV1 =
  | 'QUERY_SUCCESS_SIGNAL_UNAVAILABLE'
  | 'QUERY_SUCCESS_SIGNAL_PRESENT_NOT_PLAUSIBLE'
  | 'QUERY_SUCCESS_SIGNAL_PLAUSIBLE';

export interface HvChargingCounterCapabilityEvalV1 {
  querySucceeded: boolean;
  bucketCount: number;
  bucketsWithNumericLast: number;
  bucketsWithMinMax: number;
  bucketsWithAllNullEnergy: number;
  gapCount: number;
  negativeLastDeltaCount: number;
  nonMonotonicLastDeltaCount: number;
  firstNumericLastKwh: number | null;
  lastNumericLastKwh: number | null;
  verdict: HvChargingCounterCapabilityVerdictV1;
  notes: string[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Evaluates DIMO interval rows for R22 capability — distinct from non-empty `signals[]`.
 * Does not persist or call providers.
 */
export function evaluateHvChargingCounterCapabilityV1(
  rows: HvChargingCounterDimoIntervalRowV1[],
): HvChargingCounterCapabilityEvalV1 {
  const notes: string[] = [];
  const bucketCount = rows.length;

  if (bucketCount === 0) {
    return {
      querySucceeded: false,
      bucketCount: 0,
      bucketsWithNumericLast: 0,
      bucketsWithMinMax: 0,
      bucketsWithAllNullEnergy: 0,
      gapCount: 0,
      negativeLastDeltaCount: 0,
      nonMonotonicLastDeltaCount: 0,
      firstNumericLastKwh: null,
      lastNumericLastKwh: null,
      verdict: 'QUERY_SUCCESS_SIGNAL_UNAVAILABLE',
      notes: ['empty_interval_series'],
    };
  }

  let bucketsWithNumericLast = 0;
  let bucketsWithMinMax = 0;
  let bucketsWithAllNullEnergy = 0;
  let gapCount = 0;
  let negativeLastDeltaCount = 0;
  let nonMonotonicLastDeltaCount = 0;

  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  let prevMs: number | null = null;
  let prevLast: number | null = null;
  let firstNumericLastKwh: number | null = null;
  let lastNumericLastKwh: number | null = null;

  for (const row of sorted) {
    const ms = Date.parse(row.timestamp);
    if (!Number.isFinite(ms)) {
      notes.push('invalid_timestamp');
      continue;
    }
    if (prevMs != null && ms - prevMs > 60_000) {
      gapCount += 1;
    }
    prevMs = ms;

    const hasLast = isFiniteNumber(row.addedKwhLast);
    const hasMin = isFiniteNumber(row.addedKwhMin);
    const hasMax = isFiniteNumber(row.addedKwhMax);

    if (!hasLast && !hasMin && !hasMax) {
      bucketsWithAllNullEnergy += 1;
    }
    if (hasLast) {
      const lastKwh = row.addedKwhLast as number;
      bucketsWithNumericLast += 1;
      if (firstNumericLastKwh == null) {
        firstNumericLastKwh = lastKwh;
      }
      lastNumericLastKwh = lastKwh;

      if (prevLast != null) {
        const delta = lastKwh - prevLast;
        if (delta < 0) {
          negativeLastDeltaCount += 1;
        }
        if (delta < -1e-6) {
          nonMonotonicLastDeltaCount += 1;
        }
      }
      prevLast = lastKwh;
    }
    if (hasMin && hasMax) {
      bucketsWithMinMax += 1;
    }
  }

  let verdict: HvChargingCounterCapabilityVerdictV1;
  if (bucketsWithNumericLast === 0) {
    verdict = 'QUERY_SUCCESS_SIGNAL_UNAVAILABLE';
    notes.push('no_numeric_last_values');
  } else if (bucketsWithNumericLast < 2) {
    verdict = 'QUERY_SUCCESS_SIGNAL_PRESENT_NOT_PLAUSIBLE';
    notes.push('insufficient_numeric_last_for_trend');
  } else if (negativeLastDeltaCount > 0) {
    verdict = 'QUERY_SUCCESS_SIGNAL_PRESENT_NOT_PLAUSIBLE';
    notes.push('negative_last_deltas_observed');
  } else {
    verdict = 'QUERY_SUCCESS_SIGNAL_PLAUSIBLE';
  }

  return {
    querySucceeded: true,
    bucketCount,
    bucketsWithNumericLast,
    bucketsWithMinMax,
    bucketsWithAllNullEnergy,
    gapCount,
    negativeLastDeltaCount,
    nonMonotonicLastDeltaCount,
    firstNumericLastKwh,
    lastNumericLastKwh,
    verdict,
    notes,
  };
}

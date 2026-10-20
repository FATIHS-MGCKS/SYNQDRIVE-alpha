import type { HvChargingCounterDimoIntervalRowV1 } from './hv-charging-counter-evidence.types.v1';

export const HV_R22_GAP_AWARE_MONOTONICITY_SCHEMA_V1 =
  'hv-r22-gap-aware-monotonicity-v1' as const;

export interface HvChargingCounterGapAwareMonotonicityV1 {
  schemaVersion: typeof HV_R22_GAP_AWARE_MONOTONICITY_SCHEMA_V1;
  positiveDeltas: number;
  negativeDeltas: number;
  zeroDeltas: number;
  /** Legacy semantics: consecutive returned numeric rows with non-decreasing LAST (ignores time gaps). */
  maxConsecutiveReturnedRowMonotonicRunLength: number;
  /** Breaks a run on negative deltas or when inter-row gap exceeds `gapBreakThresholdMinutes`. */
  maxGapAwareMonotonicRunLength: number;
  gapBreakThresholdMinutes: number;
}

function parseMs(iso: string): number | null {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function isNumeric(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function analyzeHvChargingCounterGapAwareMonotonicityV1(
  rows: HvChargingCounterDimoIntervalRowV1[],
  options?: { gapBreakThresholdMinutes?: number },
): HvChargingCounterGapAwareMonotonicityV1 {
  const gapBreakThresholdMinutes = options?.gapBreakThresholdMinutes ?? 1;

  const sorted = [...rows].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp),
  );

  const numericSeries = sorted
    .map((row) => ({
      ms: parseMs(row.timestamp),
      last: row.addedKwhLast,
    }))
    .filter((row) => row.ms != null && isNumeric(row.last)) as Array<{
    ms: number;
    last: number;
  }>;

  let positiveDeltas = 0;
  let negativeDeltas = 0;
  let zeroDeltas = 0;
  let maxConsecutiveReturnedRowMonotonicRunLength = numericSeries.length > 0 ? 1 : 0;
  let maxGapAwareMonotonicRunLength = numericSeries.length > 0 ? 1 : 0;
  let rowRun = 1;
  let gapAwareRun = 1;

  for (let i = 1; i < numericSeries.length; i++) {
    const delta = numericSeries[i].last - numericSeries[i - 1].last;
    const gapMinutes = Math.round(
      (numericSeries[i].ms - numericSeries[i - 1].ms) / 60_000,
    );
    const gapBreaksRun = gapMinutes > gapBreakThresholdMinutes;

    if (delta > 0) positiveDeltas++;
    else if (delta < 0) negativeDeltas++;
    else zeroDeltas++;

    if (delta >= 0) rowRun++;
    else {
      maxConsecutiveReturnedRowMonotonicRunLength = Math.max(
        maxConsecutiveReturnedRowMonotonicRunLength,
        rowRun,
      );
      rowRun = 1;
    }

    if (delta >= 0 && !gapBreaksRun) gapAwareRun++;
    else {
      maxGapAwareMonotonicRunLength = Math.max(
        maxGapAwareMonotonicRunLength,
        gapAwareRun,
      );
      gapAwareRun = 1;
    }
  }

  maxConsecutiveReturnedRowMonotonicRunLength = Math.max(
    maxConsecutiveReturnedRowMonotonicRunLength,
    rowRun,
  );
  maxGapAwareMonotonicRunLength = Math.max(
    maxGapAwareMonotonicRunLength,
    gapAwareRun,
  );

  return {
    schemaVersion: HV_R22_GAP_AWARE_MONOTONICITY_SCHEMA_V1,
    positiveDeltas,
    negativeDeltas,
    zeroDeltas,
    maxConsecutiveReturnedRowMonotonicRunLength,
    maxGapAwareMonotonicRunLength,
    gapBreakThresholdMinutes,
  };
}

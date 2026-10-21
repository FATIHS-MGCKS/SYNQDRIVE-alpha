/**
 * Derives the observed material fuel-level-rise interval for REFUEL events.
 *
 * This is NOT exact pump/nozzle duration — only the telemetry-visible transition
 * from a stable low level through a material increase to a post-refuel plateau.
 *
 * Algorithm (conservative):
 * 1. Require ≥3 samples with a usable fuel level in the detection window.
 * 2. Compute envelope min/max; require material delta (≥2 % or ≥1 L equivalent).
 * 3. Baseline = minimum sample before the maximum (min index < max index).
 * 4. Rise start = first sample after baseline where level ≥ baseline + 10% of delta,
 *    allowing one-sample regressions ≤1 % (noise).
 * 5. Rise end = first sample after rise start where level ≥ peak − 10% of delta.
 * 6. Require rise duration ≥30 s and ≤ detection window duration.
 * 7. If evidence is insufficient, return null fields.
 */

export interface FuelLevelSample {
  timestamp: Date;
  relativePercent: number | null;
  absoluteLiters: number | null;
}

export type RefuelFuelRiseDerivationReason =
  | 'derived'
  | 'insufficient_samples'
  | 'no_material_rise'
  | 'invalid_rise_shape'
  | 'rise_too_short';

export interface RefuelFuelRiseObservation {
  fuelLevelRiseStart: Date | null;
  fuelLevelRiseEnd: Date | null;
  fuelLevelRiseDurationSeconds: number | null;
  sampleCount: number;
  derivationReason: RefuelFuelRiseDerivationReason;
}

/** Minimum samples with a numeric level in the window. */
export const MIN_FUEL_RISE_SAMPLES = 3;

/** Minimum relative-percent rise to treat as material. */
export const MIN_MATERIAL_RISE_PERCENT = 2;

/** Minimum absolute-liter rise when only absolute samples exist. */
export const MIN_MATERIAL_RISE_LITERS = 1;

/** Fraction of total delta used to bracket rise start. */
export const RISE_START_BRACKET_FRACTION = 0.05;

/** Fraction of total delta used to bracket rise end (plateau detection). */
export const RISE_END_BRACKET_FRACTION = 0.05;

/** Minimum derived rise duration (seconds). */
export const MIN_RISE_DURATION_SECONDS = 30;

/** Maximum tolerated one-sample regression (percentage points). */
export const MAX_ONE_SAMPLE_REGRESSION_PERCENT = 1;

function sampleValue(sample: FuelLevelSample): number | null {
  if (
    typeof sample.relativePercent === 'number' &&
    Number.isFinite(sample.relativePercent)
  ) {
    return sample.relativePercent;
  }
  if (
    typeof sample.absoluteLiters === 'number' &&
    Number.isFinite(sample.absoluteLiters)
  ) {
    return sample.absoluteLiters;
  }
  return null;
}

function emptyObservation(
  sampleCount: number,
  reason: RefuelFuelRiseDerivationReason,
): RefuelFuelRiseObservation {
  return {
    fuelLevelRiseStart: null,
    fuelLevelRiseEnd: null,
    fuelLevelRiseDurationSeconds: null,
    sampleCount,
    derivationReason: reason,
  };
}

export function deriveRefuelFuelLevelRise(
  samples: FuelLevelSample[],
  windowStart: Date,
  windowEnd: Date,
): RefuelFuelRiseObservation {
  const windowStartMs = windowStart.getTime();
  const windowEndMs = windowEnd.getTime();
  const windowDurationSeconds = Math.max(
    0,
    Math.round((windowEndMs - windowStartMs) / 1000),
  );

  const ordered = samples
    .filter((s) => {
      const t = s.timestamp.getTime();
      return t >= windowStartMs && t <= windowEndMs && sampleValue(s) != null;
    })
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  if (ordered.length < MIN_FUEL_RISE_SAMPLES) {
    return emptyObservation(ordered.length, 'insufficient_samples');
  }

  const values = ordered.map((s) => sampleValue(s) as number);
  const usesPercent = ordered.every(
    (s) =>
      typeof s.relativePercent === 'number' &&
      Number.isFinite(s.relativePercent),
  );
  const minThreshold = usesPercent
    ? MIN_MATERIAL_RISE_PERCENT
    : MIN_MATERIAL_RISE_LITERS;

  let minIdx = 0;
  let maxIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] < values[minIdx]) minIdx = i;
    if (values[i] > values[maxIdx]) maxIdx = i;
  }

  if (minIdx >= maxIdx) {
    return emptyObservation(ordered.length, 'no_material_rise');
  }

  const baseline = values[minIdx];
  const peak = values[maxIdx];
  const materialDelta = peak - baseline;
  if (materialDelta < minThreshold) {
    return emptyObservation(ordered.length, 'no_material_rise');
  }

  const startThreshold = baseline + RISE_START_BRACKET_FRACTION * materialDelta;
  const endThreshold = peak - RISE_END_BRACKET_FRACTION * materialDelta;

  let riseStartIdx: number | null = null;
  for (let i = minIdx + 1; i <= maxIdx; i++) {
    if (values[i] >= startThreshold) {
      const prev = values[i - 1];
      const regression = prev - values[i];
      if (
        regression > MAX_ONE_SAMPLE_REGRESSION_PERCENT &&
        i + 1 <= maxIdx &&
        values[i + 1] < startThreshold
      ) {
        continue;
      }
      riseStartIdx = i;
      break;
    }
  }

  if (riseStartIdx == null) {
    return emptyObservation(ordered.length, 'invalid_rise_shape');
  }

  let riseEndIdx: number | null = null;
  for (let i = riseStartIdx; i <= maxIdx; i++) {
    if (values[i] >= endThreshold) {
      riseEndIdx = i;
    }
  }
  if (riseEndIdx == null) {
    riseEndIdx = maxIdx;
  }

  const riseStart = ordered[riseStartIdx].timestamp;
  const riseEnd = ordered[riseEndIdx].timestamp;
  const riseDurationSeconds = Math.round(
    (riseEnd.getTime() - riseStart.getTime()) / 1000,
  );

  if (riseDurationSeconds < MIN_RISE_DURATION_SECONDS) {
    return emptyObservation(ordered.length, 'rise_too_short');
  }
  if (windowDurationSeconds > 0 && riseDurationSeconds > windowDurationSeconds) {
    return emptyObservation(ordered.length, 'invalid_rise_shape');
  }

  return {
    fuelLevelRiseStart: riseStart,
    fuelLevelRiseEnd: riseEnd,
    fuelLevelRiseDurationSeconds: riseDurationSeconds,
    sampleCount: ordered.length,
    derivationReason: 'derived',
  };
}

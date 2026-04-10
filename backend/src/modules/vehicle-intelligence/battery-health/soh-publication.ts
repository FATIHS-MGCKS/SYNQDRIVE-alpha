/**
 * SOH Publication Utilities
 *
 * Shared deterministic functions for the three-layer SOH model:
 *   Layer 1: Raw SOH (computed by existing formulas)
 *   Layer 2: Stabilized SOH (EWMA-smoothed with outlier guard)
 *   Layer 3: Published SOH (hysteresis-gated value shown to users)
 *
 * Plus maturity determination for both LV (12V) and HV (traction) batteries.
 */

export type PublicationState = 'INITIAL_CALIBRATION' | 'STABILIZING' | 'STABLE';
export type ConfidenceLevel = 'none' | 'low' | 'medium' | 'high';

// ── EWMA ────────────────────────────────────────────────────────────────────────

/**
 * Exponential Weighted Moving Average update.
 * Returns the new smoothed value.
 * If no previous stabilized value exists, seeds with the raw value.
 */
export function ewmaUpdate(
  prevStabilized: number | null,
  raw: number,
  alpha: number,
): number {
  if (prevStabilized == null) return raw;
  return alpha * raw + (1 - alpha) * prevStabilized;
}

// ── Outlier Detection ───────────────────────────────────────────────────────────

const DEFAULT_OUTLIER_THRESHOLD_PP = 5;

/**
 * Returns true when the new raw value deviates from the stabilized
 * value by more than `thresholdPp` percentage points.
 */
export function isOutlier(
  raw: number,
  stabilized: number | null,
  thresholdPp: number = DEFAULT_OUTLIER_THRESHOLD_PP,
): boolean {
  if (stabilized == null) return false;
  return Math.abs(raw - stabilized) > thresholdPp;
}

/**
 * Apply EWMA with outlier damping.
 * Normal readings use the configured alpha; outliers use a heavily damped alpha.
 */
export function stabilize(
  prevStabilized: number | null,
  raw: number,
  normalAlpha: number,
  dampedAlpha: number = 0.05,
  outlierThreshold: number = DEFAULT_OUTLIER_THRESHOLD_PP,
): { stabilized: number; wasOutlier: boolean } {
  const outlier = isOutlier(raw, prevStabilized, outlierThreshold);
  const alpha = outlier ? dampedAlpha : normalAlpha;
  const stabilized = Math.round(ewmaUpdate(prevStabilized, raw, alpha) * 100) / 100;
  return { stabilized, wasOutlier: outlier };
}

// ── Publication Hysteresis ──────────────────────────────────────────────────────

const DEFAULT_MIN_DELTA_PP = 2;
const CRITICAL_THRESHOLDS = [50, 70];

/**
 * Determines whether the published SOH should be updated.
 * Returns true when:
 *   - delta >= minDelta percentage points, OR
 *   - a critical threshold boundary is crossed (e.g. 70%, 50%)
 */
export function shouldPublish(
  stabilized: number,
  currentPublished: number | null,
  minDelta: number = DEFAULT_MIN_DELTA_PP,
): boolean {
  if (currentPublished == null) return true;

  const delta = Math.abs(stabilized - currentPublished);
  if (delta >= minDelta) return true;

  for (const t of CRITICAL_THRESHOLDS) {
    const wasBelowOrAt = currentPublished <= t;
    const isNowAbove = stabilized > t;
    const wasAbove = currentPublished > t;
    const isNowBelowOrAt = stabilized <= t;
    if ((wasBelowOrAt && isNowAbove) || (wasAbove && isNowBelowOrAt)) {
      return true;
    }
  }

  return false;
}

// ── LV Maturity ─────────────────────────────────────────────────────────────────

export interface LvMaturityInput {
  qualifiedEventCount: number;
  daysSinceFirstMeasurement: number | null;
  restObservationCount: number;
  crankObservationCount: number;
}

export function determineLvMaturity(input: LvMaturityInput): PublicationState {
  const { qualifiedEventCount, daysSinceFirstMeasurement, restObservationCount, crankObservationCount } = input;
  const days = daysSinceFirstMeasurement ?? 0;

  if (
    qualifiedEventCount >= 5 &&
    days >= 7 &&
    restObservationCount >= 2 &&
    crankObservationCount >= 2
  ) {
    return 'STABLE';
  }

  if (
    qualifiedEventCount >= 3 &&
    days >= 5 &&
    restObservationCount >= 1 &&
    crankObservationCount >= 1
  ) {
    return 'STABILIZING';
  }

  return 'INITIAL_CALIBRATION';
}

// ── HV Maturity ─────────────────────────────────────────────────────────────────

export interface HvMaturityInput {
  validEstimateCount: number;
  daysSinceFirstMeasurement: number | null;
  method: string;
}

export function determineHvMaturity(input: HvMaturityInput): PublicationState {
  const { validEstimateCount, daysSinceFirstMeasurement, method } = input;
  const days = daysSinceFirstMeasurement ?? 0;

  if (method === 'degradation_model' || method === 'insufficient_data') {
    return 'INITIAL_CALIBRATION';
  }

  if (validEstimateCount >= 10 && days >= 14) {
    return 'STABLE';
  }

  if (validEstimateCount >= 5 && days >= 7) {
    return 'STABILIZING';
  }

  return 'INITIAL_CALIBRATION';
}

// ── Confidence ──────────────────────────────────────────────────────────────────

/**
 * Combine signal confidence (feature coverage) with maturity confidence
 * (temporal depth) into a single user-facing label.
 */
export function combinedConfidence(
  signalConfidence: ConfidenceLevel,
  maturityState: PublicationState,
): ConfidenceLevel {
  const maturityConf: ConfidenceLevel =
    maturityState === 'STABLE' ? 'high'
    : maturityState === 'STABILIZING' ? 'medium'
    : 'low';

  const levels: ConfidenceLevel[] = ['none', 'low', 'medium', 'high'];
  const signalIdx = levels.indexOf(signalConfidence);
  const maturityIdx = levels.indexOf(maturityConf);

  return levels[Math.min(signalIdx, maturityIdx)];
}

/**
 * Map the existing LV weight-based confidence string to a ConfidenceLevel.
 */
export function mapSignalConfidence(conf: string | null): ConfidenceLevel {
  if (conf === 'high') return 'high';
  if (conf === 'medium') return 'medium';
  if (conf === 'low') return 'low';
  return 'none';
}

/**
 * Helper: days between two dates (fractional, returns null if either is null).
 */
export function daysBetween(from: Date | null | undefined, to: Date): number | null {
  if (!from) return null;
  return (to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24);
}

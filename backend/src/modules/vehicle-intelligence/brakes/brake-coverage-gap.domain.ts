/**
 * Brake wear coverage gap policy — no retroactive rolling-window leakage.
 *
 * Historical kilometers without per-trip driving impact use neutral baseline wear
 * only. Current rolling summaries must never back-fill older gaps.
 */

export type BrakeModelingSource =
  | 'OBSERVED'
  | 'MIXED_OBSERVED_NEUTRAL_GAP'
  | 'NEUTRAL_GAP_ONLY'
  | 'INCONSISTENT'
  | 'NOT_ENOUGH_DATA';

/** @deprecated Legacy persisted values — map on read for summaries. */
export type LegacyBrakeModelingSource =
  | 'trip_impacts'
  | 'trip_impacts_plus_rolling_gap'
  | 'rolling_gap_only'
  | 'none';

export type BrakeCoverageStatus = 'FULL' | 'PARTIAL' | 'ZERO' | 'OVER' | 'UNKNOWN';

export interface BrakeCoverageGapInput {
  /** Odometer delta since anchor; null when distance is unknown. */
  distanceSinceAnchorKm: number | null;
  /** Trip-impact distance counted toward wear (after odometer budget cap). */
  observedDistanceKm: number;
  observedTripCount: number;
  /** Uncapped sum of trip distances — used to surface overcoverage. */
  rawTripDistanceKm?: number;
}

export interface BrakeCoverageGapAssessment {
  underCoverageKm: number;
  overCoverageKm: number;
  coverageRatioRaw: number | null;
  coverageStatus: BrakeCoverageStatus;
  modelingSource: BrakeModelingSource;
  reconciliationRequired: boolean;
  /** Share of anchor distance without per-trip behavior (0–1). */
  gapShare: number;
  confidenceAdjustment: number;
  remainingKmSpreadMultiplier: number;
}

export interface TripDistanceAllocation<T> {
  item: T;
  tripDistanceKm: number;
  allocatedKm: number;
}

const FULL_COVERAGE_RATIO = 0.99;

export function normalizeModelingSource(
  value: string | null | undefined,
): BrakeModelingSource {
  switch (value) {
    case 'OBSERVED':
    case 'MIXED_OBSERVED_NEUTRAL_GAP':
    case 'NEUTRAL_GAP_ONLY':
    case 'INCONSISTENT':
    case 'NOT_ENOUGH_DATA':
      return value;
    case 'trip_impacts':
      return 'OBSERVED';
    case 'trip_impacts_plus_rolling_gap':
      return 'MIXED_OBSERVED_NEUTRAL_GAP';
    case 'rolling_gap_only':
      return 'NEUTRAL_GAP_ONLY';
    case 'none':
      return 'NOT_ENOUGH_DATA';
    default:
      return 'NOT_ENOUGH_DATA';
  }
}

/**
 * Chronologically cap trip distances to the odometer budget. Excess km are
 * excluded from wear — they contribute to overCoverageKm only.
 */
export function allocateTripDistancesToOdometerBudget<T>(
  trips: T[],
  resolveDistanceKm: (trip: T) => number,
  odometerBudgetKm: number,
): {
  allocations: TripDistanceAllocation<T>[];
  observedDistanceKm: number;
  overCoverageKm: number;
} {
  const budget = Math.max(0, odometerBudgetKm);
  let remaining = budget;
  let observedDistanceKm = 0;
  let rawTripSum = 0;
  const allocations: TripDistanceAllocation<T>[] = [];

  for (const item of trips) {
    const tripDistanceKm = Math.max(0, resolveDistanceKm(item));
    if (!(tripDistanceKm > 0)) continue;
    rawTripSum += tripDistanceKm;
    const allocatedKm = remaining > 0 ? Math.min(tripDistanceKm, remaining) : 0;
    if (allocatedKm > 0) {
      observedDistanceKm += allocatedKm;
      remaining -= allocatedKm;
    }
    allocations.push({ item, tripDistanceKm, allocatedKm });
  }

  const overCoverageKm = Math.max(0, rawTripSum - budget);
  return { allocations, observedDistanceKm, overCoverageKm };
}

export function assessBrakeCoverageGap(input: BrakeCoverageGapInput): BrakeCoverageGapAssessment {
  const distance =
    typeof input.distanceSinceAnchorKm === 'number' && Number.isFinite(input.distanceSinceAnchorKm)
      ? Math.max(0, input.distanceSinceAnchorKm)
      : null;
  const observed = Math.max(0, input.observedDistanceKm);
  const tripCount = Math.max(0, input.observedTripCount);
  const rawTrip = Math.max(0, input.rawTripDistanceKm ?? observed);

  if (distance == null) {
    return finalizeAssessment({
      underCoverageKm: 0,
      overCoverageKm: 0,
      coverageRatioRaw: null,
      coverageStatus: 'UNKNOWN',
      modelingSource: 'NOT_ENOUGH_DATA',
      reconciliationRequired: false,
      gapShare: 1,
    });
  }

  const overCoverageKm = Math.max(0, rawTrip - distance);
  const underCoverageKm = Math.max(0, distance - observed);
  const coverageRatioRaw = distance > 0 ? rawTrip / distance : rawTrip > 0 ? null : 0;
  const gapShare = distance > 0 ? underCoverageKm / distance : 1;

  let coverageStatus: BrakeCoverageStatus;
  if (overCoverageKm > 0) {
    coverageStatus = 'OVER';
  } else if (coverageRatioRaw == null) {
    coverageStatus = 'UNKNOWN';
  } else if (coverageRatioRaw >= FULL_COVERAGE_RATIO) {
    coverageStatus = 'FULL';
  } else if (coverageRatioRaw <= 0) {
    coverageStatus = 'ZERO';
  } else {
    coverageStatus = 'PARTIAL';
  }

  let modelingSource: BrakeModelingSource;
  if (distance <= 0 && tripCount === 0) {
    modelingSource = 'NOT_ENOUGH_DATA';
  } else if (overCoverageKm > 0) {
    modelingSource = 'INCONSISTENT';
  } else if (tripCount > 0 && underCoverageKm <= distance * (1 - FULL_COVERAGE_RATIO)) {
    modelingSource = 'OBSERVED';
  } else if (tripCount > 0) {
    modelingSource = 'MIXED_OBSERVED_NEUTRAL_GAP';
  } else if (distance > 0) {
    modelingSource = 'NEUTRAL_GAP_ONLY';
  } else {
    modelingSource = 'NOT_ENOUGH_DATA';
  }

  return finalizeAssessment({
    underCoverageKm,
    overCoverageKm,
    coverageRatioRaw,
    coverageStatus,
    modelingSource,
    reconciliationRequired: overCoverageKm > 0,
    gapShare,
  });
}

function finalizeAssessment(
  partial: Omit<
    BrakeCoverageGapAssessment,
    'confidenceAdjustment' | 'remainingKmSpreadMultiplier'
  >,
): BrakeCoverageGapAssessment {
  return {
    ...partial,
    confidenceAdjustment: computeGapConfidenceAdjustment(partial),
    remainingKmSpreadMultiplier: computeRemainingKmSpreadMultiplier(
      partial.gapShare,
      partial.modelingSource,
      partial.coverageStatus,
    ),
  };
}

export function computeGapConfidenceAdjustment(
  assessment: Pick<
    BrakeCoverageGapAssessment,
    'modelingSource' | 'coverageStatus' | 'gapShare' | 'reconciliationRequired'
  >,
): number {
  let delta = 0;

  switch (assessment.modelingSource) {
    case 'INCONSISTENT':
      delta -= 22;
      break;
    case 'NOT_ENOUGH_DATA':
      delta -= 24;
      break;
    case 'NEUTRAL_GAP_ONLY':
      delta -= 18;
      break;
    case 'MIXED_OBSERVED_NEUTRAL_GAP':
      delta -= Math.round(6 + assessment.gapShare * 22);
      break;
    default:
      break;
  }

  if (assessment.coverageStatus === 'OVER' || assessment.reconciliationRequired) {
    delta -= 10;
  }
  if (assessment.gapShare > 0.4) delta -= 6;
  if (assessment.gapShare > 0.7) delta -= 10;

  return delta;
}

export function computeRemainingKmSpreadMultiplier(
  gapShare: number,
  modelingSource: BrakeModelingSource,
  coverageStatus: BrakeCoverageStatus,
): number {
  let multiplier = 1;

  switch (modelingSource) {
    case 'NEUTRAL_GAP_ONLY':
      multiplier = 2.6;
      break;
    case 'MIXED_OBSERVED_NEUTRAL_GAP':
      multiplier = 1 + gapShare * 1.8;
      break;
    case 'INCONSISTENT':
      multiplier = 1.9;
      break;
    case 'NOT_ENOUGH_DATA':
      multiplier = 3;
      break;
    default:
      break;
  }

  if (coverageStatus === 'OVER') {
    multiplier = Math.max(multiplier, 1.7);
  }

  return round2(multiplier);
}

/** Neutral baseline factors for gap kilometers (no behavioral inference). */
export const NEUTRAL_GAP_WEAR_FACTORS = {
  padUsage: 1,
  padStopDensity: 1,
  padHardBrake: 1,
  padFullBraking: 1,
  padReku: 1,
  discUsage: 1,
  discHighSpeed: 1,
  discHardBrake: 1,
  discFullBraking: 1,
  discThermal: 1,
  discReku: 1,
} as const;

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

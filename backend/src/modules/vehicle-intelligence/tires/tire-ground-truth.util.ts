/**
 * Ground-truth validation for tire wear regression / calibration.
 *
 * Invariant: predicted tread must never be persisted as `actualTreadMm` on
 * TireWearDataPoint rows. Only verified manual/documented measurements qualify.
 */

export const GROUND_TRUTH_MEASUREMENT_SOURCES = new Set([
  'manual',
  'workshop',
  'manual_registration',
  'documented_registration',
  'ai_confirmed',
  'calibration',
]);

export type TireAxle = 'front' | 'rear';

export interface TreadMeasurementGroundTruthInput {
  tireSetupId: string;
  source: string;
  measuredAt: Date;
  frontLeftMm?: number | null;
  frontRightMm?: number | null;
  rearLeftMm?: number | null;
  rearRightMm?: number | null;
}

export function isGroundTruthMeasurementSource(source: string | null | undefined): boolean {
  if (!source) return false;
  return GROUND_TRUTH_MEASUREMENT_SOURCES.has(source.trim().toLowerCase());
}

function isValidTreadMm(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

function axleWheelValues(
  measurement: TreadMeasurementGroundTruthInput,
  axle: TireAxle,
): [number | null | undefined, number | null | undefined] {
  return axle === 'front'
    ? [measurement.frontLeftMm, measurement.frontRightMm]
    : [measurement.rearLeftMm, measurement.rearRightMm];
}

/**
 * Returns true when the measurement row provides complete, valid ground truth
 * for the requested axle on the given setup — without extrapolating to unmeasured wheels.
 */
export function hasValidGroundTruthMeasurement(args: {
  measurement: TreadMeasurementGroundTruthInput | null | undefined;
  tireSetupId: string;
  axle: TireAxle;
  /** Prediction / recalc instant — measurements strictly after this are excluded. */
  asOf?: Date;
}): boolean {
  const { measurement, tireSetupId, axle, asOf } = args;
  if (!measurement) return false;
  if (measurement.tireSetupId !== tireSetupId) return false;
  if (!isGroundTruthMeasurementSource(measurement.source)) return false;

  const measuredAt =
    measurement.measuredAt instanceof Date
      ? measurement.measuredAt
      : new Date(measurement.measuredAt);
  if (Number.isNaN(measuredAt.getTime())) return false;
  if (asOf && measuredAt.getTime() > asOf.getTime()) return false;

  const [left, right] = axleWheelValues(measurement, axle);
  return isValidTreadMm(left) && isValidTreadMm(right);
}

/**
 * Mean tread for an axle from measured wheels only. Returns null when either wheel is missing.
 */
export function resolveAxleGroundTruthTreadMm(
  measurement: TreadMeasurementGroundTruthInput,
  axle: TireAxle,
): number | null {
  const [left, right] = axleWheelValues(measurement, axle);
  if (!isValidTreadMm(left) || !isValidTreadMm(right)) return null;
  return (left + right) / 2;
}

/** Reject wear-data rows where actual was copied from prediction (legacy leak guard). */
export function isSyntheticPredictedGroundTruthLeak(
  actualTreadMm: number,
  predictedTreadMm: number,
  epsilonMm = 0.001,
): boolean {
  return Math.abs(actualTreadMm - predictedTreadMm) <= epsilonMm;
}

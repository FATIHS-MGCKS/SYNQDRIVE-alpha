import { BRAKE_HEALTH_CONFIG } from './brake-health.config';

export type BrakeCalibrationComponent =
  | 'FRONT_PADS'
  | 'REAR_PADS'
  | 'FRONT_DISCS'
  | 'REAR_DISCS';

export interface BrakeKFactorCalibrationResult {
  newK: number;
  alpha: number;
  applied: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * EMA k-factor update from a confirmed workshop measurement vs model prediction.
 * No-op when predicted wear is below minimum threshold (target leakage guard).
 */
export function calibrateBrakeKFactor(
  currentK: number,
  anchorMm: number,
  predictedCurrentMm: number,
  measuredCurrentMm: number,
  measurementCount: number,
): BrakeKFactorCalibrationResult {
  const c = BRAKE_HEALTH_CONFIG.calibration;
  const predictedWear = anchorMm - predictedCurrentMm;
  const actualWear = anchorMm - measuredCurrentMm;

  if (predictedWear < c.minPredictedWearMm) {
    return { newK: currentK, alpha: 0, applied: false };
  }

  const targetK = actualWear / predictedWear;
  let alpha: number;
  if (measurementCount <= 1) alpha = c.alphaFirst;
  else if (measurementCount <= c.fewThreshold) alpha = c.alphaFew;
  else alpha = c.alphaStabilized;

  const isPad = true; // bounds selected by caller
  const minK = isPad ? c.padMinK : c.discMinK;
  const maxK = isPad ? c.padMaxK : c.discMaxK;
  const newK = round3(clamp((1 - alpha) * currentK + alpha * targetK, minK, maxK));
  return { newK, alpha, applied: true };
}

export function calibrateBrakeKFactorForComponent(
  component: BrakeCalibrationComponent,
  currentK: number,
  anchorMm: number,
  predictedCurrentMm: number,
  measuredCurrentMm: number,
  measurementCount: number,
): BrakeKFactorCalibrationResult {
  const c = BRAKE_HEALTH_CONFIG.calibration;
  const predictedWear = anchorMm - predictedCurrentMm;
  const actualWear = anchorMm - measuredCurrentMm;

  if (predictedWear < c.minPredictedWearMm) {
    return { newK: currentK, alpha: 0, applied: false };
  }

  const targetK = actualWear / predictedWear;
  let alpha: number;
  if (measurementCount <= 1) alpha = c.alphaFirst;
  else if (measurementCount <= c.fewThreshold) alpha = c.alphaFew;
  else alpha = c.alphaStabilized;

  const isPad = component === 'FRONT_PADS' || component === 'REAR_PADS';
  const minK = isPad ? c.padMinK : c.discMinK;
  const maxK = isPad ? c.padMaxK : c.discMaxK;
  const newK = round3(clamp((1 - alpha) * currentK + alpha * targetK, minK, maxK));
  return { newK, alpha, applied: true };
}

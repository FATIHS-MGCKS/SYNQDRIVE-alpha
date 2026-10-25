import {
  TIRE_WEAR_V3_PRIOR_CONFIG,
  type TireWearV3PriorConfig,
} from './tire-wear-v3-prior.config';
import type { TireWearV3MeasurementPoint } from './tire-wear-v3-prior.types';

/**
 * P3A: `isCalibrationPoint` / workshop source alone do not prove 0.2 mm accuracy.
 * Use conservative default σ unless a future verified-quality contract exists.
 */
export function resolveRateCalibrationSigmaMm(
  segment: TireWearV3MeasurementPoint[],
  config: TireWearV3PriorConfig = TIRE_WEAR_V3_PRIOR_CONFIG,
): { sigmaMm: number; flags: string[] } {
  const flags: string[] = [];
  const defaultSigma = config.defaultMeasurementUncertaintyMm;

  if (segment.length === 0) {
    return { sigmaMm: defaultSigma, flags };
  }

  const hasUnverifiedPrecisionClaim = segment.some(
    (p) => p.isCalibrationPoint || p.source === 'workshop',
  );
  if (hasUnverifiedPrecisionClaim) {
    flags.push('MEASUREMENT_PRECISION_CLAIM_NOT_VERIFIED');
  }

  const perPointSigma = segment.map(() => defaultSigma);
  const sigmaMm = Math.max(...perPointSigma, defaultSigma);

  return { sigmaMm, flags };
}

export function rateCalibrationBlockedByMeasurementQuality(
  flags: string[],
): boolean {
  return (
    flags.includes('TREAD_JUMP_SUSPECT') ||
    flags.includes('RATE_MEASUREMENT_SERIES_CONTRADICTORY')
  );
}

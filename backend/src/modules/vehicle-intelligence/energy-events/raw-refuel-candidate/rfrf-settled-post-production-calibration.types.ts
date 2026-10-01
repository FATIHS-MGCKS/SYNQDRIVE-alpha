/**
 * Future Production calibration bundle — required fields only, no defaults (R1 types).
 * Not populated or read by runtime in R1.
 */
export const RFRF_SETTLED_POST_PRODUCTION_CALIBRATION_AUTHORITY_V1 =
  'rfrf-settled-post-production-calibration-v1' as const;

export interface RfrfSettledPostProductionCalibrationBundleV1 {
  authorityVersion: typeof RFRF_SETTLED_POST_PRODUCTION_CALIBRATION_AUTHORITY_V1;
  maxPeakToSettledDropLiters: number;
  maxPeakToSettledDropRatioOfRise: number;
  maxPeakToSettledContinuityGapMs: number;
}

export function assertCompleteProductionCalibrationBundle(
  input: Partial<RfrfSettledPostProductionCalibrationBundleV1> | null | undefined,
): input is RfrfSettledPostProductionCalibrationBundleV1 {
  if (input == null) return false;
  if (input.authorityVersion !== RFRF_SETTLED_POST_PRODUCTION_CALIBRATION_AUTHORITY_V1) {
    return false;
  }
  const liters = input.maxPeakToSettledDropLiters;
  const ratio = input.maxPeakToSettledDropRatioOfRise;
  const gapMs = input.maxPeakToSettledContinuityGapMs;

  return (
    typeof liters === 'number' &&
    Number.isFinite(liters) &&
    liters >= 0 &&
    typeof ratio === 'number' &&
    Number.isFinite(ratio) &&
    ratio >= 0 &&
    ratio <= 1 &&
    typeof gapMs === 'number' &&
    Number.isFinite(gapMs) &&
    gapMs >= 0
  );
}

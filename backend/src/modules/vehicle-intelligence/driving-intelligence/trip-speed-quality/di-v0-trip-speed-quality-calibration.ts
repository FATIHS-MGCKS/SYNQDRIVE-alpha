import { CALIBRATION_UNSET_V0_BUNDLE } from '../core/calibration/CALIBRATION_UNSET_V0';
import type { DiV0CalibrationBundle } from '../core/calibration/types';

/**
 * Resolves the calibration bundle used to re-classify pinned position evidence for QC.
 * Fail-closed: only bundles explicitly bound to the shadow run version are allowed.
 */
export function resolveDiV0TripSpeedQualityCalibrationBundle(calibrationVersion: string): DiV0CalibrationBundle {
  if (calibrationVersion !== CALIBRATION_UNSET_V0_BUNDLE.calibrationVersion) {
    throw new Error(
      `DI_V0_TRIP_SPEED_QUALITY:UNSUPPORTED_CALIBRATION_VERSION:${calibrationVersion}`,
    );
  }
  return CALIBRATION_UNSET_V0_BUNDLE;
}

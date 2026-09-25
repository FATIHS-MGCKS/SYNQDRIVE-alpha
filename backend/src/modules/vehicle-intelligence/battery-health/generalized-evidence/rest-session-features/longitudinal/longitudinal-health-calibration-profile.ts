import {
  canonicalFeatureInputUtf8,
  sha256HexLowercaseUtf8,
} from '../feature-input-canonical.serializer';
import type { M3_3E_CALIBRATION_MATURITY_V1 } from './longitudinal-health-evaluation.constants';

export const M3_3E_CALIBRATION_UNSET_V1 = 'M3_3E_CALIBRATION_UNSET_V1' as const;

export type M3_3E_CALIBRATION_PROFILE_ID_V1 = typeof M3_3E_CALIBRATION_UNSET_V1;

export type M3_3E_CalibrationProfileV1 = {
  calibrationProfileId: M3_3E_CALIBRATION_PROFILE_ID_V1;
  calibrationMaturity: M3_3E_CALIBRATION_MATURITY_V1;
  parameters: {
    'CAL-M3.3E-001': null;
    'CAL-M3.3E-002': null;
    'CAL-M3.3E-003': null;
    'CAL-M3.3E-004': null;
    'CAL-M3.3E-005': null;
    'CAL-M3.3E-006': null;
    'CAL-M3.3E-007': null;
    'CAL-M3.3E-008': null;
    'CAL-M3.3E-009': null;
    'CAL-M3.3E-010': null;
    'CAL-M3.3E-011': null;
  };
};

export const M3_3E_CALIBRATION_UNSET_PROFILE_V1: M3_3E_CalibrationProfileV1 = {
  calibrationProfileId: M3_3E_CALIBRATION_UNSET_V1,
  calibrationMaturity: 'UNCALIBRATED',
  parameters: {
    'CAL-M3.3E-001': null,
    'CAL-M3.3E-002': null,
    'CAL-M3.3E-003': null,
    'CAL-M3.3E-004': null,
    'CAL-M3.3E-005': null,
    'CAL-M3.3E-006': null,
    'CAL-M3.3E-007': null,
    'CAL-M3.3E-008': null,
    'CAL-M3.3E-009': null,
    'CAL-M3.3E-010': null,
    'CAL-M3.3E-011': null,
  },
};

export function computeM3_3E_CalibrationProfileFingerprintV1(
  profile: M3_3E_CalibrationProfileV1,
): string {
  return sha256HexLowercaseUtf8(canonicalFeatureInputUtf8(profile));
}

/** Pinned fingerprint for `M3_3E_CALIBRATION_UNSET_V1` (tests / golden). */
export const M3_3E_CALIBRATION_UNSET_PROFILE_FINGERPRINT_V1 =
  computeM3_3E_CalibrationProfileFingerprintV1(M3_3E_CALIBRATION_UNSET_PROFILE_V1);

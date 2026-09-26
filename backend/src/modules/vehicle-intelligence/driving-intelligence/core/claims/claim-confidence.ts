import type { DiV0CalibrationBundle } from '../calibration/types';
import type {
  ClaimLevel,
  MotionState,
  NativeEventCalibrationState,
  SourceRelation,
  SpeedEvidenceState,
  ValueConfidence,
} from '../types';

export function maxClaimForNumericL3(): ClaimLevel {
  return 'L2';
}

export function maxClaimForUncalibratedNative(state: NativeEventCalibrationState): ClaimLevel {
  return state === 'VALIDATED' ? 'L2' : 'L1';
}

export function maxClaimForR1Point(): ClaimLevel {
  return 'L0';
}

export function deriveValueConfidence(
  l3SpeedKmh: number | null,
  sourceRelation: SourceRelation,
  calibration: DiV0CalibrationBundle,
  flags: string[],
): ValueConfidence {
  if (l3SpeedKmh == null) {
    return 'UNAVAILABLE';
  }
  if (sourceRelation === 'CONFLICTING' || sourceRelation === 'CONFLICT_EXPLAINED') {
    return 'LOW';
  }
  if (flags.includes('L3_SUPPORT_CROSSES_HOLD') || flags.includes('L3_SUPPORT_CROSSES_RELEASE')) {
    return 'LOW';
  }
  if (l3SpeedKmh < calibration.l3CrawlBandMaxKmh) {
    return 'MODERATE';
  }
  const band = l3SpeedKmh * calibration.confidenceHighSpeedRangePct;
  if (band > 0) {
    return 'HIGH';
  }
  return 'MODERATE';
}

export function deriveSpeedEvidenceState(
  motionState: MotionState,
  l3SpeedKmh: number | null,
  valueConfidence: ValueConfidence,
): SpeedEvidenceState {
  if (motionState === 'NO_MOTION_EVIDENCE' || motionState === 'TRANSITION_UNCERTAIN') {
    return motionState === 'TRANSITION_UNCERTAIN' ? 'ABSTAINED' : 'NONE';
  }
  if (motionState === 'MOVING_SPEED_UNKNOWN') {
    return 'MOVEMENT_ONLY';
  }
  if (motionState === 'STATIONARY_SUPPORTED') {
    return 'STATIONARY_BAND';
  }
  if (l3SpeedKmh == null) {
    return 'ABSTAINED';
  }
  if (valueConfidence === 'HIGH') {
    return 'NUMERIC_HIGH';
  }
  if (valueConfidence === 'MODERATE') {
    return 'NUMERIC_MODERATE';
  }
  return 'ABSTAINED';
}

export function deriveSpeedRangeKmh(
  l3SpeedKmh: number | null,
  valueConfidence: ValueConfidence,
  calibration: DiV0CalibrationBundle,
): [number, number] | null {
  if (l3SpeedKmh == null) {
    return null;
  }
  if (valueConfidence === 'HIGH') {
    const margin = l3SpeedKmh * calibration.confidenceHighSpeedRangePct;
    return [Math.max(0, l3SpeedKmh - margin), l3SpeedKmh + margin];
  }
  if (valueConfidence === 'MODERATE') {
    const margin = Math.max(
      calibration.confidenceModerateSpeedRangeAbsKmh,
      l3SpeedKmh * calibration.confidenceModerateSpeedRangePct,
    );
    return [Math.max(0, l3SpeedKmh - margin), l3SpeedKmh + margin];
  }
  return null;
}

export function clampClaimLevel(requested: ClaimLevel, ceiling: ClaimLevel): ClaimLevel {
  const order: ClaimLevel[] = ['L0', 'L1', 'L2', 'L3'];
  return order[Math.min(order.indexOf(requested), order.indexOf(ceiling))];
}

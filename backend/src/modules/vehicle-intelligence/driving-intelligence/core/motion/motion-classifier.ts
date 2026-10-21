import type { DiV0CalibrationBundle } from '../calibration/types';
import type { ClassifiedPositionRow } from '../position/hold-release';
import { isFrozenPositionState } from '../position/hold-release';
import type { MotionState } from '../types';

export interface MotionClassificationInput {
  row: ClassifiedPositionRow;
  l3SpeedKmh: number | null;
  l3Eligible: boolean;
  abstentionReason: string | null;
  intervalMeanSpeedLowerBoundKmh: number | null;
}

export function classifyMotionState(
  input: MotionClassificationInput,
  calibration: DiV0CalibrationBundle,
): MotionState {
  const { row, l3SpeedKmh, l3Eligible, abstentionReason, intervalMeanSpeedLowerBoundKmh } = input;

  if (row.observation.availability === 'ROW_ABSENT') {
    return 'NO_MOTION_EVIDENCE';
  }
  if (row.observation.availability === 'SIGNAL_NULL') {
    return 'NO_MOTION_EVIDENCE';
  }
  if (row.positionState === 'RELEASE') {
    return 'TRANSITION_UNCERTAIN';
  }
  if (row.positionState === 'FROZEN_UNRESOLVED') {
    return 'TRANSITION_UNCERTAIN';
  }
  if (row.positionState === 'FROZEN_MOVEMENT_SUPPORTED') {
    return 'MOVING_SPEED_UNKNOWN';
  }
  if (row.positionState === 'FROZEN_STOP_SUPPORTED') {
    return 'STATIONARY_SUPPORTED';
  }
  if (l3Eligible && l3SpeedKmh != null) {
    if (l3SpeedKmh < calibration.stopStationaryBandMaxKmh) {
      return 'STATIONARY_SUPPORTED';
    }
    if (l3SpeedKmh >= calibration.stopMovingBandMinKmh) {
      return 'MOVING_SPEED_ESTIMATED';
    }
    return 'TRANSITION_UNCERTAIN';
  }
  if (intervalMeanSpeedLowerBoundKmh != null && intervalMeanSpeedLowerBoundKmh >= calibration.stopMovingBandMinKmh) {
    return 'MOVING_SPEED_UNKNOWN';
  }
  if (abstentionReason === 'POSITION_FROZEN' || abstentionReason === 'POSITION_RELEASE') {
    return 'TRANSITION_UNCERTAIN';
  }
  if (abstentionReason === 'ROW_ABSENT' || abstentionReason === 'ROW_GAP_IN_SUPPORT') {
    return 'NO_MOTION_EVIDENCE';
  }
  return 'TRANSITION_UNCERTAIN';
}

export function intervalMovementLowerBoundKmh(row: ClassifiedPositionRow): number | null {
  if (row.positionState !== 'FROZEN_MOVEMENT_SUPPORTED') {
    return null;
  }
  return null;
}

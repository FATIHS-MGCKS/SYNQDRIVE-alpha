import type { MotionState } from '../core/types';
import { DiV0TripSpeedQualityProjectionError } from './di-v0-trip-speed-quality-projection.errors';
import type { DiV0TripSpeedQualityProjectionMotionV1 } from './di-v0-trip-speed-quality-projection.types';

export const CANONICAL_DI_V0_MOTION_STATES: readonly MotionState[] = [
  'STATIONARY_SUPPORTED',
  'MOVING_SPEED_ESTIMATED',
  'MOVING_SPEED_UNKNOWN',
  'TRANSITION_UNCERTAIN',
  'NO_MOTION_EVIDENCE',
] as const;

type MotionCounterKey = keyof DiV0TripSpeedQualityProjectionMotionV1;

const MOTION_TO_COUNTER: Record<MotionState, MotionCounterKey> = {
  STATIONARY_SUPPORTED: 'stationarySupportedCount',
  MOVING_SPEED_ESTIMATED: 'movingEstimatedCount',
  MOVING_SPEED_UNKNOWN: 'movingUnknownCount',
  TRANSITION_UNCERTAIN: 'uncertainCount',
  NO_MOTION_EVIDENCE: 'noMotionEvidenceCount',
};

export function incrementDiV0TripSpeedQualityMotionCounter(
  motion: string,
  motionCounts: DiV0TripSpeedQualityProjectionMotionV1,
): void {
  if (!(motion in MOTION_TO_COUNTER)) {
    throw new DiV0TripSpeedQualityProjectionError('UNSUPPORTED_MOTION_STATE', motion);
  }
  const key = MOTION_TO_COUNTER[motion as MotionState];
  motionCounts[key] += 1;
}

export function emptyDiV0TripSpeedQualityMotionCounts(): DiV0TripSpeedQualityProjectionMotionV1 {
  return {
    stationarySupportedCount: 0,
    movingEstimatedCount: 0,
    movingUnknownCount: 0,
    uncertainCount: 0,
    noMotionEvidenceCount: 0,
  };
}

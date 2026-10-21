import { TripDetectionState } from '@prisma/client';

export type WakeContinuationClass =
  | 'ELIGIBLE_RESTING'
  | 'DEFINITIVELY_NOT_RESTING'
  | 'DEFINITIVELY_INELIGIBLE'
  | 'UNKNOWN';

export interface WakeContinuationInput {
  fsmState: TripDetectionState | null;
  vehicleEligible: boolean | null;
  fsmReadError?: boolean;
  eligibilityReadError?: boolean;
}

const NON_RESTING_START_WAKE_STATES = new Set<TripDetectionState>([
  TripDetectionState.POSSIBLE_START,
  TripDetectionState.ACTIVE_TRIP,
  TripDetectionState.IDLE_WITHIN_TRIP,
  TripDetectionState.POSSIBLE_END,
]);

export function classifyWakeContinuation(
  input: WakeContinuationInput,
): WakeContinuationClass {
  if (input.fsmReadError || input.eligibilityReadError) {
    return 'UNKNOWN';
  }
  if (input.vehicleEligible === false) {
    return 'DEFINITIVELY_INELIGIBLE';
  }
  if (input.fsmState == null) {
    return 'UNKNOWN';
  }
  if (input.fsmState === TripDetectionState.RESTING) {
    return input.vehicleEligible === true
      ? 'ELIGIBLE_RESTING'
      : 'DEFINITIVELY_INELIGIBLE';
  }
  if (NON_RESTING_START_WAKE_STATES.has(input.fsmState)) {
    return 'DEFINITIVELY_NOT_RESTING';
  }
  return 'DEFINITIVELY_NOT_RESTING';
}

export function mayScheduleWakeSuccessor(
  continuation: WakeContinuationClass,
): boolean {
  return continuation === 'ELIGIBLE_RESTING';
}

export function shouldRetireObsoleteWake(
  continuation: WakeContinuationClass,
): boolean {
  return (
    continuation === 'DEFINITIVELY_NOT_RESTING' ||
    continuation === 'DEFINITIVELY_INELIGIBLE'
  );
}

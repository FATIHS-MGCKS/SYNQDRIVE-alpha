import { TripDetectionState } from '@prisma/client';

import {
  classifyWakeContinuation,
  mayScheduleWakeSuccessor,
  shouldRetireObsoleteWake,
} from './snapshot-wake-continuation.util';

describe('snapshot-wake-continuation.util', () => {
  it('ELIGIBLE_RESTING when RESTING and vehicle eligible', () => {
    expect(
      classifyWakeContinuation({
        fsmState: TripDetectionState.RESTING,
        vehicleEligible: true,
      }),
    ).toBe('ELIGIBLE_RESTING');
    expect(mayScheduleWakeSuccessor('ELIGIBLE_RESTING')).toBe(true);
  });

  it('DEFINITIVELY_NOT_RESTING for live non-resting FSM states', () => {
    for (const state of [
      TripDetectionState.POSSIBLE_START,
      TripDetectionState.ACTIVE_TRIP,
      TripDetectionState.IDLE_WITHIN_TRIP,
      TripDetectionState.POSSIBLE_END,
    ]) {
      expect(
        classifyWakeContinuation({
          fsmState: state,
          vehicleEligible: true,
        }),
      ).toBe('DEFINITIVELY_NOT_RESTING');
    }
    expect(shouldRetireObsoleteWake('DEFINITIVELY_NOT_RESTING')).toBe(true);
    expect(mayScheduleWakeSuccessor('DEFINITIVELY_NOT_RESTING')).toBe(false);
  });

  it('DEFINITIVELY_INELIGIBLE when disconnected or unavailable vehicle', () => {
    expect(
      classifyWakeContinuation({
        fsmState: TripDetectionState.RESTING,
        vehicleEligible: false,
      }),
    ).toBe('DEFINITIVELY_INELIGIBLE');
  });

  it('UNKNOWN on FSM or eligibility read failure', () => {
    expect(
      classifyWakeContinuation({
        fsmState: TripDetectionState.RESTING,
        vehicleEligible: true,
        fsmReadError: true,
      }),
    ).toBe('UNKNOWN');
    expect(
      classifyWakeContinuation({
        fsmState: TripDetectionState.RESTING,
        vehicleEligible: null,
        eligibilityReadError: true,
      }),
    ).toBe('UNKNOWN');
    expect(mayScheduleWakeSuccessor('UNKNOWN')).toBe(false);
    expect(shouldRetireObsoleteWake('UNKNOWN')).toBe(false);
  });
});

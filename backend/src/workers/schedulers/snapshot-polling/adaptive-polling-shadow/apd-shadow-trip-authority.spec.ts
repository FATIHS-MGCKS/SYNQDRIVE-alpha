import { TripDetectionState } from '@prisma/client';
import {
  isFsmTripActivityLikely,
  resolveApdShadowTripAuthority,
} from './apd-shadow-trip-authority';

describe('apd-shadow-trip-authority', () => {
  it('Audi-like: vehicle_trips inactive, FSM ACTIVE_TRIP → disagreement, profile not trip-invalidated', () => {
    const auth = resolveApdShadowTripAuthority({
      inTripPerVehicleTripsAtDecision: false,
      tripDetectionState: TripDetectionState.ACTIVE_TRIP,
    });
    expect(auth.profileTripInvalidationActive).toBe(false);
    expect(auth.tripAuthorityDisagreement).toBe(true);
    expect(auth.conservativeTripSafetyLatch).toBe(true);
  });

  it('interval-active trip → profile invalidation and safety latch', () => {
    const auth = resolveApdShadowTripAuthority({
      inTripPerVehicleTripsAtDecision: true,
      tripDetectionState: TripDetectionState.RESTING,
    });
    expect(auth.profileTripInvalidationActive).toBe(true);
    expect(auth.tripAuthorityDisagreement).toBe(false);
    expect(auth.conservativeTripSafetyLatch).toBe(true);
  });

  it('RESTING FSM and no interval → no latch', () => {
    const auth = resolveApdShadowTripAuthority({
      inTripPerVehicleTripsAtDecision: false,
      tripDetectionState: TripDetectionState.RESTING,
    });
    expect(auth.conservativeTripSafetyLatch).toBe(false);
    expect(auth.tripAuthorityDisagreement).toBe(false);
  });

  it('POSSIBLE_START counts as FSM trip activity', () => {
    expect(isFsmTripActivityLikely(TripDetectionState.POSSIBLE_START)).toBe(true);
  });
});

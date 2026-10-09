import { TripDetectionState } from '@prisma/client';
import { ACTIVE_TRIP_DETECTION_STATES } from '../fast-reconciliation-cohort';

/**
 * Shadow trip authority (APDS R4 P2).
 *
 * - Profile invalidation uses canonical `vehicle_trips` intervals (PS1 reconciliation corpus).
 * - FSM states indicating ongoing/imminent trip activity drive a conservative safety latch
 *   (fail-closed) without treating stale FSM alone as profile TRIP_ACTIVE invalidation.
 */
export interface ApdShadowTripAuthority {
  inTripPerVehicleTripsAtDecision: boolean;
  fsmTripActivityLikely: boolean;
  /** Do not allow permissive WOULD_SKIP when either interval or FSM indicates trip risk. */
  conservativeTripSafetyLatch: boolean;
  /** Passed to evaluateP25ApdProfile `tripActive` (interval authority only). */
  profileTripInvalidationActive: boolean;
  /** FSM implies trip activity but vehicle_trips interval is inactive at decision time. */
  tripAuthorityDisagreement: boolean;
}

export function isFsmTripActivityLikely(
  tripDetectionState: TripDetectionState | null | undefined,
): boolean {
  if (tripDetectionState == null) return false;
  return ACTIVE_TRIP_DETECTION_STATES.includes(tripDetectionState);
}

export function resolveApdShadowTripAuthority(input: {
  inTripPerVehicleTripsAtDecision: boolean;
  tripDetectionState: TripDetectionState | null | undefined;
}): ApdShadowTripAuthority {
  const fsmTripActivityLikely = isFsmTripActivityLikely(input.tripDetectionState);
  const inTrip = input.inTripPerVehicleTripsAtDecision;
  return {
    inTripPerVehicleTripsAtDecision: inTrip,
    fsmTripActivityLikely,
    conservativeTripSafetyLatch: inTrip || fsmTripActivityLikely,
    profileTripInvalidationActive: inTrip,
    tripAuthorityDisagreement: fsmTripActivityLikely && !inTrip,
  };
}

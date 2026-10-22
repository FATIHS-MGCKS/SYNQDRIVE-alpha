import type { TripDetectionState } from '@prisma/client';

export type Dtc02VsiDtcFreshness = 'FRESH' | 'STALE' | 'UNKNOWN';

export type Dtc02TripActivityPhase =
  | 'STANDBY'
  | 'TRIP_ACTIVE'
  | 'TRIP_START'
  | 'TRIP_END'
  | 'UNKNOWN';

export type Dtc02TripVsiPlannerContext = {
  tripPhase: Dtc02TripActivityPhase;
  vsiDtcFreshness: Dtc02VsiDtcFreshness;
  inTripInterval: boolean;
  fsmTripActivityLikely: boolean;
  tripAuthorityDisagreement: boolean;
  /** Latest FSM boundary signal used for trip-start/end intent (null when not applicable). */
  lastTripTransitionAtMs: number | null;
  /** VLS poll or source-head fetch — coalescing anchor (no extra DIMO calls in shadow). */
  lastPollOrIntentAtMs: number | null;
};

export type Dtc02TripVsiResolverInput = {
  evaluatedAtMs: number;
  inTripInterval: boolean;
  tripDetectionState: TripDetectionState | null | undefined;
  lastActivityAtMs: number | null;
  possibleStartEnteredAtMs: number | null;
  possibleEndEnteredAtMs: number | null;
  vsiDtcLastSourceTimestamp: string | null;
  tripFsmTransitionMaxAgeMs: number;
};

import { TripDetectionState } from '@prisma/client';
import { ACTIVE_TRIP_DETECTION_STATES } from '../../../../workers/schedulers/snapshot-polling/fast-reconciliation-cohort';
import { isFsmTripActivityLikely } from '../../../../workers/schedulers/snapshot-polling/adaptive-polling-shadow/apd-shadow-trip-authority';
import { computeSignalFreshnessAtEvaluation } from '../../vehicle-signal-intelligence/vsi-capability-resolver.freshness';
import type {
  Dtc02TripActivityPhase,
  Dtc02TripVsiPlannerContext,
  Dtc02TripVsiResolverInput,
  Dtc02VsiDtcFreshness,
} from './dtc-02-adaptive-trip-vsi.types';

function isRecentTransition(
  atMs: number | null,
  evaluatedAtMs: number,
  maxAgeMs: number,
): boolean {
  if (atMs == null) return false;
  const age = evaluatedAtMs - atMs;
  return age >= 0 && age <= maxAgeMs;
}

export function resolveVsiDtcFreshness(input: {
  vsiDtcLastSourceTimestamp: string | null;
  evaluatedAtMs: number;
}): Dtc02VsiDtcFreshness {
  return computeSignalFreshnessAtEvaluation({
    lastSourceTimestamp: input.vsiDtcLastSourceTimestamp,
    evaluationTimeMs: input.evaluatedAtMs,
  });
}

export function resolveDtc02TripActivityPhase(
  input: Dtc02TripVsiResolverInput,
): Pick<
  Dtc02TripVsiPlannerContext,
  | 'tripPhase'
  | 'lastTripTransitionAtMs'
  | 'fsmTripActivityLikely'
  | 'tripAuthorityDisagreement'
  | 'inTripInterval'
> {
  const fsmTripActivityLikely = isFsmTripActivityLikely(input.tripDetectionState);
  const inTripInterval = input.inTripInterval;
  const state = input.tripDetectionState ?? TripDetectionState.RESTING;
  const ongoingFsmWithoutInterval =
    !inTripInterval &&
    (state === TripDetectionState.ACTIVE_TRIP ||
      state === TripDetectionState.IDLE_WITHIN_TRIP);
  const tripAuthorityDisagreement = ongoingFsmWithoutInterval;

  const maxAge = input.tripFsmTransitionMaxAgeMs;

  if (inTripInterval || state === TripDetectionState.ACTIVE_TRIP) {
    return {
      tripPhase: 'TRIP_ACTIVE',
      lastTripTransitionAtMs: input.lastActivityAtMs,
      fsmTripActivityLikely,
      tripAuthorityDisagreement,
      inTripInterval,
    };
  }

  if (
    state === TripDetectionState.POSSIBLE_START &&
    isRecentTransition(input.possibleStartEnteredAtMs, input.evaluatedAtMs, maxAge)
  ) {
    return {
      tripPhase: 'TRIP_START',
      lastTripTransitionAtMs: input.possibleStartEnteredAtMs,
      fsmTripActivityLikely,
      tripAuthorityDisagreement,
      inTripInterval,
    };
  }

  if (
    state === TripDetectionState.POSSIBLE_END &&
    isRecentTransition(input.possibleEndEnteredAtMs, input.evaluatedAtMs, maxAge)
  ) {
    return {
      tripPhase: 'TRIP_END',
      lastTripTransitionAtMs: input.possibleEndEnteredAtMs,
      fsmTripActivityLikely,
      tripAuthorityDisagreement,
      inTripInterval,
    };
  }

  if (ACTIVE_TRIP_DETECTION_STATES.includes(state)) {
    if (isRecentTransition(input.lastActivityAtMs, input.evaluatedAtMs, maxAge)) {
      return {
        tripPhase: 'TRIP_ACTIVE',
        lastTripTransitionAtMs: input.lastActivityAtMs,
        fsmTripActivityLikely,
        tripAuthorityDisagreement,
        inTripInterval,
      };
    }
  }

  if (tripAuthorityDisagreement) {
    return {
      tripPhase: 'UNKNOWN',
      lastTripTransitionAtMs: input.lastActivityAtMs,
      fsmTripActivityLikely,
      tripAuthorityDisagreement,
      inTripInterval,
    };
  }

  return {
    tripPhase: 'STANDBY',
    lastTripTransitionAtMs: null,
    fsmTripActivityLikely,
    tripAuthorityDisagreement,
    inTripInterval,
  };
}

export function buildDtc02TripVsiPlannerContext(
  input: Dtc02TripVsiResolverInput & { lastPollOrIntentAtMs: number | null },
): Dtc02TripVsiPlannerContext {
  const vsiDtcFreshness = resolveVsiDtcFreshness({
    vsiDtcLastSourceTimestamp: input.vsiDtcLastSourceTimestamp,
    evaluatedAtMs: input.evaluatedAtMs,
  });
  const trip = resolveDtc02TripActivityPhase(input);
  return {
    ...trip,
    vsiDtcFreshness,
    lastPollOrIntentAtMs: input.lastPollOrIntentAtMs,
  };
}

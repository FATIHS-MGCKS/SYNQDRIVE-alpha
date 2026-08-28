/**
 * SynqDrive — Event → Trip association resolver (pure domain).
 *
 * Root cause this replaces: the previous resolver required
 * `endTime IS NULL OR endTime >= observedAt`. While a trip is ONGOING the V2
 * tracking FSM rewrites `end_time = now` on every ~30s tick, so `end_time` is a
 * rolling activity cursor that trails real time. Any event landing between two
 * ticks was excluded from its own live trip and orphaned permanently.
 *
 * The fix is semantic, not a time tolerance: an ONGOING trip has an OPEN upper
 * boundary. A tolerance such as `endTime + 30s` would only hide the race and
 * couple correctness to the polling cadence.
 *
 * Precedence (first tier that yields exactly one trip wins):
 *   1. ACTIVE_TRIP_MATCH      — canonical `active_trip_id` from the detection FSM
 *   2. ONGOING_TRIP_MATCH     — ONGOING trip started at/before the event, open upper bound
 *   3. FINALIZED_WINDOW_MATCH — COMPLETED trip whose finalized window contains the event
 *
 * CANCELLED trips are never eligible at any tier — including the stale
 * `CANCELLED` + `end_time IS NULL` rows that could previously masquerade as
 * open trips and beat the real one.
 *
 * A tier that yields more than one plausible trip resolves to AMBIGUOUS_TRIPS
 * rather than guessing: a safe NULL is always preferred over a wrong FK.
 */
import { TripStatus } from '@prisma/client';
import {
  EVENT_TRIP_ASSOCIATION_REASONS,
  type EventTripAssociationDecision,
  type ResolveEventTripInput,
  type TripAssociationCandidate,
} from './event-trip-association.types';

/** Trip states that may never receive an event association. */
const INELIGIBLE_TRIP_STATUSES: ReadonlySet<TripStatus> = new Set([
  TripStatus.CANCELLED,
]);

function startsAtOrBefore(trip: TripAssociationCandidate, observedAt: Date): boolean {
  return trip.startTime.getTime() <= observedAt.getTime();
}

/** ONGOING trips have an open upper boundary — rolling endTime is ignored. */
function isOpenOngoingMatch(
  trip: TripAssociationCandidate,
  observedAt: Date,
): boolean {
  return trip.tripStatus === TripStatus.ONGOING && startsAtOrBefore(trip, observedAt);
}

/** COMPLETED trips use canonical containment against the finalized end boundary. */
function isFinalizedWindowMatch(
  trip: TripAssociationCandidate,
  observedAt: Date,
): boolean {
  if (trip.tripStatus !== TripStatus.COMPLETED || trip.endTime == null) return false;
  return (
    startsAtOrBefore(trip, observedAt) &&
    trip.endTime.getTime() >= observedAt.getTime()
  );
}

/**
 * True when a CANCELLED trip would have matched under the legacy semantics.
 * Only used to surface the CANCELLED_EXCLUDED diagnostic — never to associate.
 */
function matchesCancelledDecoy(
  trip: TripAssociationCandidate,
  observedAt: Date,
): boolean {
  if (trip.tripStatus !== TripStatus.CANCELLED) return false;
  if (!startsAtOrBefore(trip, observedAt)) return false;
  return trip.endTime == null || trip.endTime.getTime() >= observedAt.getTime();
}

function decide(
  matches: TripAssociationCandidate[],
  reason:
    | typeof EVENT_TRIP_ASSOCIATION_REASONS.ONGOING_TRIP_MATCH
    | typeof EVENT_TRIP_ASSOCIATION_REASONS.FINALIZED_WINDOW_MATCH,
): EventTripAssociationDecision | null {
  if (matches.length === 1) {
    return { tripId: matches[0].id, reason };
  }
  if (matches.length > 1) {
    return {
      tripId: null,
      reason: EVENT_TRIP_ASSOCIATION_REASONS.AMBIGUOUS_TRIPS,
      ambiguousTripIds: matches.map((t) => t.id).sort(),
    };
  }
  return null;
}

/**
 * Resolves the canonical trip for an event observed at `observedAt`.
 * Callers pass every trip for the vehicle that could plausibly contain the
 * event; filtering, precedence and ambiguity handling live here.
 */
export function resolveEventTripAssociation(
  input: ResolveEventTripInput,
): EventTripAssociationDecision {
  const { observedAt, activeTripId, trips } = input;

  const cancelledExcluded = trips.some((t) => matchesCancelledDecoy(t, observedAt));
  const eligible = trips.filter((t) => !INELIGIBLE_TRIP_STATUSES.has(t.tripStatus));

  const withDiagnostics = (
    decision: EventTripAssociationDecision,
  ): EventTripAssociationDecision =>
    cancelledExcluded ? { ...decision, cancelledExcluded: true } : decision;

  // ── Tier 1: canonical active trip from the detection FSM ────────────────
  // Authoritative while the vehicle is driving: the FSM knows which trip is
  // open even when the rolling endTime trails the event by several seconds.
  if (activeTripId) {
    const activeTrip = eligible.find((t) => t.id === activeTripId);
    if (
      activeTrip &&
      activeTrip.tripStatus === TripStatus.ONGOING &&
      startsAtOrBefore(activeTrip, observedAt)
    ) {
      return withDiagnostics({
        tripId: activeTrip.id,
        reason: EVENT_TRIP_ASSOCIATION_REASONS.ACTIVE_TRIP_MATCH,
      });
    }
  }

  // ── Tier 2: ONGOING trip with an open upper boundary ────────────────────
  const ongoingDecision = decide(
    eligible.filter((t) => isOpenOngoingMatch(t, observedAt)),
    EVENT_TRIP_ASSOCIATION_REASONS.ONGOING_TRIP_MATCH,
  );
  if (ongoingDecision) return withDiagnostics(ongoingDecision);

  // ── Tier 3: finalized trip containing the event ─────────────────────────
  const finalizedDecision = decide(
    eligible.filter((t) => isFinalizedWindowMatch(t, observedAt)),
    EVENT_TRIP_ASSOCIATION_REASONS.FINALIZED_WINDOW_MATCH,
  );
  if (finalizedDecision) return withDiagnostics(finalizedDecision);

  if (cancelledExcluded) {
    return {
      tripId: null,
      reason: EVENT_TRIP_ASSOCIATION_REASONS.CANCELLED_EXCLUDED,
      cancelledExcluded: true,
    };
  }

  return { tripId: null, reason: EVENT_TRIP_ASSOCIATION_REASONS.NO_TRIP_YET };
}

import { TripStatus } from '@prisma/client';
import { TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS } from '../generalized-evidence.constants';
import type {
  ChargeContextCompletenessReason,
  ChargeOpportunityRestSessionSnapshot,
  ChargeOpportunityTripSnapshot,
  ResolvedChargeOpportunityWindow,
} from './charge-opportunity.types';

function sortReasons(reasons: ChargeContextCompletenessReason[]): ChargeContextCompletenessReason[] {
  return [...new Set(reasons)].sort();
}

function validateTripAgainstAnchor(input: {
  trip: ChargeOpportunityTripSnapshot;
  sessionVehicleId: string;
  anchorAt: Date;
}): ChargeContextCompletenessReason[] {
  const reasons: ChargeContextCompletenessReason[] = [];
  const { trip, sessionVehicleId, anchorAt } = input;

  if (trip.vehicleId !== sessionVehicleId) {
    reasons.push('TRIP_NOT_COMPLETED');
    return reasons;
  }
  if (trip.tripStatus !== TripStatus.COMPLETED) {
    reasons.push('TRIP_NOT_COMPLETED');
  }
  if (trip.startTime == null) {
    reasons.push('TRIP_START_MISSING');
  }
  if (trip.endTime == null) {
    reasons.push('TRIP_END_MISSING');
  }
  if (trip.startTime != null && trip.startTime.getTime() >= anchorAt.getTime()) {
    reasons.push('TRIP_START_AFTER_ANCHOR');
  }
  if (trip.endTime != null) {
    const deltaMs = Math.abs(anchorAt.getTime() - trip.endTime.getTime());
    if (deltaMs > TRIP_ASSOCIATION_ANCHOR_TOLERANCE_MS) {
      reasons.push('TRIP_END_ANCHOR_MISMATCH');
    }
  }
  return reasons;
}

function buildValidWindow(input: {
  windowSource: 'CONFIRMED_TRIP' | 'CANDIDATE_TRIP';
  trip: ChargeOpportunityTripSnapshot;
  anchorAt: Date;
  extraReasons: ChargeContextCompletenessReason[];
}): ResolvedChargeOpportunityWindow {
  const { trip, anchorAt, windowSource, extraReasons } = input;
  const startTime = trip.startTime!;
  const endTime = trip.endTime!;
  const durationMs = endTime.getTime() - startTime.getTime();
  const tripEndToAnchorDeltaMs = anchorAt.getTime() - endTime.getTime();
  const reasons = [...extraReasons];
  if (trip.distanceKm == null || !Number.isFinite(trip.distanceKm)) {
    reasons.push('MISSING_DISTANCE');
  }
  if (
    trip.outsideTemperatureStartC == null ||
    !Number.isFinite(trip.outsideTemperatureStartC)
  ) {
    reasons.push('MISSING_TEMPERATURE');
  }
  return {
    windowSource,
    precedingTripId: trip.id,
    precedingTripStartAt: startTime,
    precedingTripEndAt: endTime,
    chargeContextStartAt: startTime,
    chargeContextEndAt: anchorAt,
    tripEndToAnchorDeltaMs,
    precedingTripDurationMs: durationMs >= 0 ? durationMs : null,
    precedingTripDistanceKm: trip.distanceKm,
    outsideTemperatureStartC: trip.outsideTemperatureStartC,
    completenessReasons: sortReasons(reasons),
  };
}

function invalidLinkedTripWindow(
  anchorAt: Date,
  reasons: ChargeContextCompletenessReason[],
): ResolvedChargeOpportunityWindow {
  return {
    windowSource: 'NONE',
    precedingTripId: null,
    precedingTripStartAt: null,
    precedingTripEndAt: null,
    chargeContextStartAt: null,
    chargeContextEndAt: anchorAt,
    tripEndToAnchorDeltaMs: null,
    precedingTripDurationMs: null,
    precedingTripDistanceKm: null,
    outsideTemperatureStartC: null,
    completenessReasons: sortReasons(reasons),
  };
}

function noTripWindow(anchorAt: Date): ResolvedChargeOpportunityWindow {
  return {
    windowSource: 'NONE',
    precedingTripId: null,
    precedingTripStartAt: null,
    precedingTripEndAt: null,
    chargeContextStartAt: null,
    chargeContextEndAt: anchorAt,
    tripEndToAnchorDeltaMs: null,
    precedingTripDurationMs: null,
    precedingTripDistanceKm: null,
    outsideTemperatureStartC: null,
    completenessReasons: ['NO_RELIABLE_PRECEDING_TRIP'],
  };
}

/**
 * Resolves charge context window from explicit rest-session trip links only.
 * Does not infer lookback windows or alternate nearby trips.
 */
export function resolveChargeOpportunityWindow(input: {
  session: ChargeOpportunityRestSessionSnapshot;
  confirmedTrip: ChargeOpportunityTripSnapshot | null;
  candidateTrip: ChargeOpportunityTripSnapshot | null;
}): ResolvedChargeOpportunityWindow {
  const { session, confirmedTrip, candidateTrip } = input;
  const anchorAt = session.anchorAt;

  if (session.confirmedTripId != null) {
    if (!confirmedTrip || confirmedTrip.id !== session.confirmedTripId) {
      return invalidLinkedTripWindow(anchorAt, ['TRIP_NOT_COMPLETED']);
    }
    const reasons = validateTripAgainstAnchor({
      trip: confirmedTrip,
      sessionVehicleId: session.vehicleId,
      anchorAt,
    });
    if (reasons.length > 0) {
      return invalidLinkedTripWindow(anchorAt, reasons);
    }
    return buildValidWindow({
      windowSource: 'CONFIRMED_TRIP',
      trip: confirmedTrip,
      anchorAt,
      extraReasons: [],
    });
  }

  if (session.candidateTripId != null) {
    if (!candidateTrip || candidateTrip.id !== session.candidateTripId) {
      return invalidLinkedTripWindow(anchorAt, ['TRIP_NOT_COMPLETED']);
    }
    const reasons = validateTripAgainstAnchor({
      trip: candidateTrip,
      sessionVehicleId: session.vehicleId,
      anchorAt,
    });
    if (reasons.length > 0) {
      return invalidLinkedTripWindow(anchorAt, reasons);
    }
    return buildValidWindow({
      windowSource: 'CANDIDATE_TRIP',
      trip: candidateTrip,
      anchorAt,
      extraReasons: ['CANDIDATE_TRIP_CONTEXT'],
    });
  }

  return noTripWindow(anchorAt);
}

export function isTimestampInChargeWindow(
  observedAt: Date | null | undefined,
  window: ResolvedChargeOpportunityWindow,
): boolean {
  if (observedAt == null || Number.isNaN(observedAt.getTime())) return false;
  if (window.chargeContextStartAt == null) return false;
  const t = observedAt.getTime();
  const start = window.chargeContextStartAt.getTime();
  const end = window.chargeContextEndAt.getTime();
  return t >= start && t < end;
}

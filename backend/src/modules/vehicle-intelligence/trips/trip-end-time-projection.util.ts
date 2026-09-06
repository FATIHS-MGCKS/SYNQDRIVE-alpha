export type TripEndTimeSemantics =
  | 'CANONICAL_EVENT_BOUNDARY'
  | 'PROVISIONAL_WORKER_OBSERVATION'
  | 'CANCELLED';

export interface TripEndTimeProjection {
  endTime: string | null;
  canonicalEndTime: string | null;
  provisionalLastObservedAt: string | null;
  endTimeSemantics: TripEndTimeSemantics;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Explicit ONGOING vs COMPLETED end-time semantics for API/UI consumers (R8). */
export function projectTripEndTimeFields(trip: {
  tripStatus?: string | null;
  endTime?: Date | string | null;
}): TripEndTimeProjection {
  const status = trip.tripStatus ?? null;
  const endIso = toIso(trip.endTime);

  if (status === 'COMPLETED') {
    return {
      endTime: endIso,
      canonicalEndTime: endIso,
      provisionalLastObservedAt: null,
      endTimeSemantics: 'CANONICAL_EVENT_BOUNDARY',
    };
  }

  if (status === 'ONGOING') {
    return {
      endTime: endIso,
      canonicalEndTime: null,
      provisionalLastObservedAt: endIso,
      endTimeSemantics: 'PROVISIONAL_WORKER_OBSERVATION',
    };
  }

  return {
    endTime: endIso,
    canonicalEndTime: null,
    provisionalLastObservedAt: null,
    endTimeSemantics: 'CANCELLED',
  };
}

/** Duration display helper — ongoing trips use provisional observation or wall clock upstream. */
export function resolveTripDurationEndAnchor(
  projection: TripEndTimeProjection,
  now: Date = new Date(),
): Date | null {
  if (projection.endTimeSemantics === 'CANONICAL_EVENT_BOUNDARY') {
    return projection.canonicalEndTime ? new Date(projection.canonicalEndTime) : null;
  }
  if (projection.endTimeSemantics === 'PROVISIONAL_WORKER_OBSERVATION') {
    return projection.provisionalLastObservedAt
      ? new Date(projection.provisionalLastObservedAt)
      : now;
  }
  return null;
}

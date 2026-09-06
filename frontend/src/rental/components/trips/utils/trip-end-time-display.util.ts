export type TripEndTimeSemantics =
  | 'CANONICAL_EVENT_BOUNDARY'
  | 'PROVISIONAL_WORKER_OBSERVATION'
  | 'CANCELLED';

/** Resolve display/KPI end anchor without treating ONGOING provisional end as canonical. */
export function resolveTripDisplayEndTime(trip: {
  tripStatus?: string | null;
  endTime?: string | null;
  canonicalEndTime?: string | null;
  provisionalLastObservedAt?: string | null;
}): string | null {
  if (trip.tripStatus === 'COMPLETED') {
    return trip.canonicalEndTime ?? trip.endTime ?? null;
  }
  if (trip.tripStatus === 'ONGOING') {
    return trip.provisionalLastObservedAt ?? trip.endTime ?? null;
  }
  return trip.endTime ?? null;
}

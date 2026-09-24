import { haversineM, type TripQualityCheck } from './trip-evidence.helpers';

export interface ResolveFinalizeEndTimeInput {
  cusumSegmentEnd?: Date | null;
  lastMeaningfulMovementAt?: Date | null;
  latestWaypointRecordedAt?: Date | null;
  possibleEndAt?: Date | null;
  tripStartTime: Date;
  fallbackNow: Date;
}

export interface ResolvedFinalizeEndTime {
  endTime: Date;
  source:
    | 'cusum_segment_end'
    | 'clickhouse_segment_end'
    | 'movement_extent'
    | 'last_meaningful_movement'
    | 'last_waypoint'
    | 'possible_end_at'
    | 'fallback_now';
}

/**
 * Event-time finalize boundary: CUSUM wins; otherwise use the latest credible
 * movement anchor (LMM vs persisted route waypoint), not whichever happens to
 * be listed first in a fallback chain.
 */
export function resolveFinalizeEndTime(
  input: ResolveFinalizeEndTimeInput,
): ResolvedFinalizeEndTime {
  if (input.cusumSegmentEnd) {
    return {
      endTime: input.cusumSegmentEnd,
      source: 'cusum_segment_end',
    };
  }

  const startMs = input.tripStartTime.getTime();
  const movementMs: number[] = [];
  if (
    input.lastMeaningfulMovementAt &&
    input.lastMeaningfulMovementAt.getTime() >= startMs
  ) {
    movementMs.push(input.lastMeaningfulMovementAt.getTime());
  }
  if (
    input.latestWaypointRecordedAt &&
    input.latestWaypointRecordedAt.getTime() >= startMs
  ) {
    movementMs.push(input.latestWaypointRecordedAt.getTime());
  }

  if (movementMs.length > 0) {
    const endMs = Math.max(...movementMs);
    const endTime = new Date(endMs);
    const waypointMs = input.latestWaypointRecordedAt?.getTime();
    const lmmMs = input.lastMeaningfulMovementAt?.getTime();
    if (waypointMs != null && waypointMs === endMs && waypointMs !== lmmMs) {
      return { endTime, source: 'last_waypoint' };
    }
    if (movementMs.length > 1) {
      return { endTime, source: 'movement_extent' };
    }
    if (lmmMs != null && lmmMs === endMs) {
      return { endTime, source: 'last_meaningful_movement' };
    }
    return { endTime, source: 'last_waypoint' };
  }

  if (input.possibleEndAt) {
    return { endTime: input.possibleEndAt, source: 'possible_end_at' };
  }

  return { endTime: input.fallbackNow, source: 'fallback_now' };
}

export function computePersistedRouteDisplacementM(
  first: { latitude: number; longitude: number } | null | undefined,
  last: { latitude: number; longitude: number } | null | undefined,
): number | null {
  if (!first || !last) return null;
  return haversineM(first.latitude, first.longitude, last.latitude, last.longitude);
}

/** Main-branch finalize end-time chain (BASE repro for quality regressions). */
export function resolveLegacyFinalizeEndTime(
  input: ResolveFinalizeEndTimeInput,
): Date {
  if (input.cusumSegmentEnd) {
    return input.cusumSegmentEnd;
  }
  return (
    input.lastMeaningfulMovementAt ??
    input.latestWaypointRecordedAt ??
    input.possibleEndAt ??
    input.fallbackNow
  );
}

/** Main-branch quality gate (no persisted-route movement evidence). */
export function checkTripQualityLegacyMain(
  durationMs: number,
  distanceKm: number | null,
  maxConsecutiveActive: number,
  previousTripEndTime: Date | null,
  currentTripStartTime: Date,
): TripQualityCheck {
  if (durationMs < 60_000 && (distanceKm == null || distanceKm < 0.1)) {
    return {
      shouldDiscard: true,
      shouldMergeWithPrevious: false,
      reason: 'too_short_no_distance',
    };
  }
  if (
    distanceKm != null &&
    distanceKm < 0.1 &&
    maxConsecutiveActive < 2
  ) {
    return {
      shouldDiscard: true,
      shouldMergeWithPrevious: false,
      reason: 'no_meaningful_movement',
    };
  }
  if (previousTripEndTime) {
    const gapMs =
      currentTripStartTime.getTime() - previousTripEndTime.getTime();
    if (gapMs >= 0 && gapMs < 5 * 60_000) {
      return {
        shouldDiscard: false,
        shouldMergeWithPrevious: true,
        reason: 'small_gap_merge',
      };
    }
  }
  return { shouldDiscard: false, shouldMergeWithPrevious: false };
}

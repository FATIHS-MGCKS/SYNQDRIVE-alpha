import {
  getProfileThresholds,
  haversineM,
  TRIP_ROUTE_MOVEMENT_MIN_METERS,
  type TripQualityCheck,
} from './trip-evidence.helpers';

export interface PersistedRouteWaypointForMovement {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  recordedAt: Date;
}

/**
 * Persisted route movement semantics aligned with `findEarliestRouteActivityAt`:
 * speed above profile `speedMotionKmh` and/or consecutive coordinate progression
 * above `TRIP_ROUTE_MOVEMENT_MIN_METERS`. Meaningful drive additionally requires
 * cumulative path length ≥ profile `odometerMinDeltaKm` (50 m for ICE/EV/HYBRID).
 */
export interface PersistedRouteMovementAnalysis {
  hasMeaningfulMovement: boolean;
  movementAuthority: string;
  cumulativeRouteMovementM: number;
  netDisplacementM: number | null;
  latestCredibleMovementAt: Date | null;
  motionWaypointCount: number;
}

export interface ResolveFinalizeEndTimeInput {
  cusumSegmentEnd?: Date | null;
  lastMeaningfulMovementAt?: Date | null;
  /** Latest waypoint event-time that satisfies route movement semantics — not latest fix. */
  latestCredibleMovementAt?: Date | null;
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
    | 'persisted_route_movement'
    | 'possible_end_at'
    | 'fallback_now';
}

export const FINALIZE_END_AUTHORITY_ORDER =
  'cusum_segment_end → max(last_meaningful_movement_at, latest_credible_route_movement_at) → last_meaningful_movement_at → latest_credible_route_movement_at → possible_end_at → fallback_now';

function isRouteMovementWaypoint(
  point: PersistedRouteWaypointForMovement,
  previous: PersistedRouteWaypointForMovement | null,
  speedMotionKmh: number,
): boolean {
  const hasSpeedMotion =
    point.speedKmh != null && point.speedKmh > speedMotionKmh;
  const segmentM =
    previous != null
      ? haversineM(
          previous.latitude,
          previous.longitude,
          point.latitude,
          point.longitude,
        )
      : 0;
  const hasCoordinateJump = segmentM > TRIP_ROUTE_MOVEMENT_MIN_METERS;
  return hasSpeedMotion || hasCoordinateJump;
}

export function analyzePersistedRouteMovement(
  waypoints: PersistedRouteWaypointForMovement[],
  profile: string,
): PersistedRouteMovementAnalysis {
  const t = getProfileThresholds(profile);
  const minCumulativeM = t.odometerMinDeltaKm * 1000;

  if (waypoints.length === 0) {
    return {
      hasMeaningfulMovement: false,
      movementAuthority: 'none',
      cumulativeRouteMovementM: 0,
      netDisplacementM: null,
      latestCredibleMovementAt: null,
      motionWaypointCount: 0,
    };
  }

  const sorted = [...waypoints].sort(
    (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
  );

  let cumulativeRouteMovementM = 0;
  let motionWaypointCount = 0;
  let latestCredibleMovementAt: Date | null = null;
  let movementAuthority = 'none';

  for (let i = 0; i < sorted.length; i++) {
    const point = sorted[i]!;
    const previous = i > 0 ? sorted[i - 1]! : null;
    const segmentM =
      previous != null
        ? haversineM(
            previous.latitude,
            previous.longitude,
            point.latitude,
            point.longitude,
          )
        : 0;
    cumulativeRouteMovementM += segmentM;

    if (!isRouteMovementWaypoint(point, previous, t.speedMotionKmh)) {
      continue;
    }

    motionWaypointCount += 1;
    latestCredibleMovementAt = point.recordedAt;

    if (point.speedKmh != null && point.speedKmh > t.speedMotionKmh) {
      movementAuthority = 'route_speed_motion';
    } else if (movementAuthority === 'none') {
      movementAuthority = 'route_consecutive_segment_m';
    }
  }

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const netDisplacementM = haversineM(
    first.latitude,
    first.longitude,
    last.latitude,
    last.longitude,
  );

  const hasMeaningfulMovement =
    motionWaypointCount >= 1 && cumulativeRouteMovementM >= minCumulativeM;

  if (hasMeaningfulMovement && movementAuthority === 'none') {
    movementAuthority = 'route_cumulative_path_m';
  }

  return {
    hasMeaningfulMovement,
    movementAuthority,
    cumulativeRouteMovementM,
    netDisplacementM,
    latestCredibleMovementAt,
    motionWaypointCount,
  };
}

/**
 * Canonical finalize boundary — CUSUM first, else credible movement event-time
 * (core LMM vs persisted route movement), never a stationary tail waypoint.
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
    input.latestCredibleMovementAt &&
    input.latestCredibleMovementAt.getTime() >= startMs
  ) {
    movementMs.push(input.latestCredibleMovementAt.getTime());
  }

  if (movementMs.length > 0) {
    const endMs = Math.max(...movementMs);
    const endTime = new Date(endMs);
    const routeMs = input.latestCredibleMovementAt?.getTime();
    const lmmMs = input.lastMeaningfulMovementAt?.getTime();
    if (routeMs != null && routeMs === endMs && routeMs !== lmmMs) {
      return { endTime, source: 'persisted_route_movement' };
    }
    if (movementMs.length > 1) {
      return { endTime, source: 'movement_extent' };
    }
    if (lmmMs != null && lmmMs === endMs) {
      return { endTime, source: 'last_meaningful_movement' };
    }
    return { endTime, source: 'persisted_route_movement' };
  }

  if (input.possibleEndAt) {
    return { endTime: input.possibleEndAt, source: 'possible_end_at' };
  }

  return { endTime: input.fallbackNow, source: 'fallback_now' };
}

/** PR #1750 intermediate HEAD — unsafe max(LMM, latest waypoint timestamp). */
export function resolvePr1750UnsafeFinalizeEndTime(input: {
  cusumSegmentEnd?: Date | null;
  lastMeaningfulMovementAt?: Date | null;
  latestWaypointRecordedAt?: Date | null;
  possibleEndAt?: Date | null;
  tripStartTime: Date;
  fallbackNow: Date;
}): ResolvedFinalizeEndTime {
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
    return {
      endTime: new Date(Math.max(...movementMs)),
      source: 'movement_extent',
    };
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
  input: ResolveFinalizeEndTimeInput & {
    latestWaypointRecordedAt?: Date | null;
  },
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

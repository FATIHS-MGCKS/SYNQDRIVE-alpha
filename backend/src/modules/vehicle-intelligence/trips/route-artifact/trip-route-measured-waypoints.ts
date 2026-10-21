import type { RoutePoint } from '../../../dimo/dimo-segments.service';
import type { TripRouteInputPoint } from './trip-route.types';
import { computeTripRouteInputFingerprint } from './trip-route-input-fingerprint';
import { buildTripRouteInputFingerprintInput } from './trip-route-input-fingerprint';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';

export type TripRouteWaypointFidelity = 'canonical' | 'bounded';

export interface PersistedTripWaypointRow {
  latitude: number;
  longitude: number;
  recordedAt: Date;
  speedKmh?: number | null;
}

/** Convert DIMO route points to canonical fingerprint/preprocessor input. */
export function routePointsToTripRouteInputPoints(
  points: RoutePoint[],
): TripRouteInputPoint[] {
  return points.map((p) => ({
    latitude: p.latitude,
    longitude: p.longitude,
    recordedAt: p.timestamp,
  }));
}

/** Reconstruct fingerprint input from durable VehicleTripWaypoint rows. */
export function waypointsToTripRouteInputPoints(
  waypoints: PersistedTripWaypointRow[],
): TripRouteInputPoint[] {
  return waypoints
    .slice()
    .sort((a, b) => {
      const ta = a.recordedAt.getTime();
      const tb = b.recordedAt.getTime();
      if (ta !== tb) return ta - tb;
      return 0;
    })
    .map((w) => ({
      latitude: w.latitude,
      longitude: w.longitude,
      recordedAt: w.recordedAt.toISOString(),
    }));
}

/**
 * Select waypoint rows for persistence.
 * Canonical path stores all measured observations (route-enriched trips).
 * Bounded path retains legacy <=500 sampling for non-canonical caches.
 */
export function selectWaypointsForPersistence(
  points: RoutePoint[],
  fidelity: TripRouteWaypointFidelity,
  options?: { canonicalMax?: number; boundedMax?: number },
): RoutePoint[] {
  if (fidelity === 'canonical') {
    const max = options?.canonicalMax ?? 10_000;
    if (points.length <= max) return points;
    const step = Math.ceil(points.length / max);
    return points.filter((_, i) => i % step === 0);
  }

  const boundedMax = options?.boundedMax ?? 500;
  if (points.length <= boundedMax) return points;
  const step = Math.ceil(points.length / boundedMax);
  return points.filter((_, i) => i % step === 0);
}

/** Prove durable waypoints reproduce the canonical fingerprint input. */
export function computeFingerprintFromWaypoints(
  tripId: string,
  waypoints: PersistedTripWaypointRow[],
  algorithmVersion: string = TRIP_ROUTE_ALGORITHM_VERSION,
): string {
  return computeTripRouteInputFingerprint(
    buildTripRouteInputFingerprintInput(
      tripId,
      algorithmVersion,
      waypointsToTripRouteInputPoints(waypoints),
    ),
  );
}

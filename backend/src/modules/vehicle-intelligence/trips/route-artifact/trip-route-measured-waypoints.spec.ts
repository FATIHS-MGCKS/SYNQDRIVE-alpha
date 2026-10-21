import {
  computeFingerprintFromWaypoints,
  routePointsToTripRouteInputPoints,
  selectWaypointsForPersistence,
  waypointsToTripRouteInputPoints,
} from './trip-route-measured-waypoints';
import {
  buildTripRouteInputFingerprintInput,
  computeTripRouteInputFingerprint,
} from './trip-route-input-fingerprint';
import { TRIP_ROUTE_ALGORITHM_VERSION } from './trip-route-algorithm-version';
import { TRIP_ROUTE_CANONICAL_WAYPOINT_MAX } from './trip-route-preprocessing.constants';
import type { RoutePoint } from '../../../dimo/dimo-segments.service';

function makeRoutePoints(count: number): RoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    latitude: 52.52 + i * 0.00001,
    longitude: 13.4 + i * 0.00001,
    speedKmh: 50,
    timestamp: new Date(Date.UTC(2026, 7, 1, 10, 0, i * 7)).toISOString(),
  }));
}

describe('trip-route-measured-waypoints (R2 pre-merge)', () => {
  it('persists all canonical observations for >500 input points', () => {
    const points = makeRoutePoints(1200);
    const persisted = selectWaypointsForPersistence(points, 'canonical');
    expect(persisted).toHaveLength(1200);
  });

  it('bounded path still samples to <=500', () => {
    const points = makeRoutePoints(2400);
    const persisted = selectWaypointsForPersistence(points, 'bounded');
    expect(persisted.length).toBeLessThanOrEqual(500);
    expect(persisted.length).toBeGreaterThan(2);
  });

  it('reconstructs exact fingerprint input from durable waypoints (>500)', () => {
    const tripId = 'trip-large';
    const source = makeRoutePoints(1200);
    const inputPoints = routePointsToTripRouteInputPoints(source);
    const expectedFingerprint = computeTripRouteInputFingerprint(
      buildTripRouteInputFingerprintInput(tripId, TRIP_ROUTE_ALGORITHM_VERSION, inputPoints),
    );

    const persisted = selectWaypointsForPersistence(source, 'canonical');
    const waypointRows = persisted.map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
      recordedAt: new Date(p.timestamp),
      speedKmh: p.speedKmh,
    }));

    const reconstructedInput = waypointsToTripRouteInputPoints(waypointRows);
    expect(reconstructedInput).toEqual(inputPoints);
    expect(computeFingerprintFromWaypoints(tripId, waypointRows)).toBe(expectedFingerprint);
  });

  it('documents canonical safety valve at 10k observations', () => {
    expect(TRIP_ROUTE_CANONICAL_WAYPOINT_MAX).toBe(10_000);
  });
});

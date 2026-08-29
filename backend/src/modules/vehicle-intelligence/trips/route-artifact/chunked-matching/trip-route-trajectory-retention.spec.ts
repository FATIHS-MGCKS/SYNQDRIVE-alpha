import {
  retainTrajectoryPoints,
  maxSpacingBetweenRetained,
  estimateRetainedPointCount,
} from './trip-route-trajectory-retention';
import { planRouteChunks } from './trip-route-chunk-planner';
import type { MeasuredRoutePoint } from '../trip-route-preprocessing.types';
import {
  TRIP_ROUTE_RETENTION_MAX_SPACING_METERS,
  TRIP_ROUTE_RETENTION_MAX_SPACING_SECONDS,
} from './trip-route-chunked-matching.constants';

function straightDense(count: number): MeasuredRoutePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    latitude: 52.52 + i * 0.0001,
    longitude: 13.4 + i * 0.0001,
    recordedAt: new Date(Date.UTC(2026, 7, 1, 10, 0, i * 7)).toISOString(),
    sourceIndex: i,
  }));
}

function urbanCurvy(count: number): MeasuredRoutePoint[] {
  const points = straightDense(count);
  for (let i = 10; i < count - 10; i += 12) {
    points[i] = { ...points[i], latitude: points[i].latitude + 0.002 };
    points[i + 1] = { ...points[i + 1], longitude: points[i + 1].longitude + 0.002 };
  }
  return points;
}

describe('trajectory retention spacing', () => {
  it.each([500, 1000, 2500, 5000, 10000])(
    'reduces straight dense %i-point route materially',
    (count) => {
      const retained = retainTrajectoryPoints(straightDense(count));
      expect(retained.length).toBeLessThan(count * 0.5);
      expect(retained.length).toBeGreaterThan(10);
    },
  );

  it('preserves urban turns better than straight collapse', () => {
    const straight = retainTrajectoryPoints(straightDense(500));
    const urban = retainTrajectoryPoints(urbanCurvy(500));
    expect(urban.length).toBeGreaterThan(straight.length);
  });

  it('respects max spacing contract on straights', () => {
    const retained = retainTrajectoryPoints(straightDense(1000));
    const spacing = maxSpacingBetweenRetained(retained);
    expect(spacing.maxSpacingMeters).toBeLessThanOrEqual(
      TRIP_ROUTE_RETENTION_MAX_SPACING_METERS + 20,
    );
    expect(spacing.maxSpacingSeconds).toBeLessThanOrEqual(
      TRIP_ROUTE_RETENTION_MAX_SPACING_SECONDS + 10,
    );
  });

  it('reports request counts after retention for straight routes', () => {
    const counts = [500, 1000, 2500, 5000, 10000].map((count) => {
      const retained = estimateRetainedPointCount(count);
      return { count, retained, chunks: planRouteChunks(retained, 0).length };
    });

    expect(counts[0].retained).toBeLessThan(500);
    expect(counts[4].chunks).toBeLessThan(125);
  });
});

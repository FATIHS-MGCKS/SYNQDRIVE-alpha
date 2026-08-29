import { MapboxService } from '../../mapbox.service';
import {
  TRIP_ROUTE_TRAJECTORY_BEARING_THRESHOLD_DEG,
  TRIP_ROUTE_RETENTION_MAX_SPACING_METERS,
  TRIP_ROUTE_RETENTION_MAX_SPACING_SECONDS,
} from './trip-route-chunked-matching.constants';
import type { MeasuredRoutePoint } from '../trip-route-preprocessing.types';

function bearingDegrees(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function bearingChangeDegrees(
  prev: MeasuredRoutePoint,
  mid: MeasuredRoutePoint,
  next: MeasuredRoutePoint,
): number {
  const b1 = bearingDegrees(prev.latitude, prev.longitude, mid.latitude, mid.longitude);
  const b2 = bearingDegrees(mid.latitude, mid.longitude, next.latitude, next.longitude);
  let delta = Math.abs(b2 - b1);
  if (delta > 180) delta = 360 - delta;
  return delta;
}

function timeDiffSeconds(a: string, b: string): number | null {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null;
  return Math.abs(tb - ta) / 1000;
}

function maxSpacingBetweenRetained(
  retained: MeasuredRoutePoint[],
): { maxSpacingMeters: number; maxSpacingSeconds: number } {
  let maxSpacingMeters = 0;
  let maxSpacingSeconds = 0;
  for (let i = 1; i < retained.length; i++) {
    maxSpacingMeters = Math.max(
      maxSpacingMeters,
      MapboxService.haversineM(
        retained[i - 1].latitude,
        retained[i - 1].longitude,
        retained[i].latitude,
        retained[i].longitude,
      ),
    );
    const gapSeconds = timeDiffSeconds(retained[i - 1].recordedAt, retained[i].recordedAt);
    if (gapSeconds != null) {
      maxSpacingSeconds = Math.max(maxSpacingSeconds, gapSeconds);
    }
  }
  return { maxSpacingMeters, maxSpacingSeconds };
}

/**
 * Trajectory-aware retention with bounded spatial/temporal spacing on straights.
 * Measured vertices only — no synthesis.
 */
export function retainTrajectoryPoints(points: MeasuredRoutePoint[]): MeasuredRoutePoint[] {
  if (points.length <= 2) return [...points];

  const keep = new Set<number>([0, points.length - 1]);

  for (let i = 1; i < points.length - 1; i++) {
    const change = bearingChangeDegrees(points[i - 1], points[i], points[i + 1]);
    if (change >= TRIP_ROUTE_TRAJECTORY_BEARING_THRESHOLD_DEG) {
      keep.add(i);
    }
  }

  let anchor = 0;
  for (let i = 1; i < points.length; i++) {
    const spatial = MapboxService.haversineM(
      points[anchor].latitude,
      points[anchor].longitude,
      points[i].latitude,
      points[i].longitude,
    );
    const temporal = timeDiffSeconds(points[anchor].recordedAt, points[i].recordedAt) ?? 0;

    if (
      spatial >= TRIP_ROUTE_RETENTION_MAX_SPACING_METERS ||
      temporal >= TRIP_ROUTE_RETENTION_MAX_SPACING_SECONDS
    ) {
      keep.add(i);
      anchor = i;
    }
  }

  return points.filter((_, idx) => keep.has(idx));
}

export { maxSpacingBetweenRetained };

export function sourceDistanceMeters(points: MeasuredRoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += MapboxService.haversineM(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude,
    );
  }
  return total;
}

export function estimateRetainedPointCount(straightPointCount: number): number {
  return retainTrajectoryPoints(
    Array.from({ length: straightPointCount }, (_, i) => ({
      latitude: 52.52 + i * 0.0001,
      longitude: 13.4 + i * 0.0001,
      recordedAt: new Date(Date.UTC(2026, 7, 1, 10, 0, i * 7)).toISOString(),
      sourceIndex: i,
    })),
  ).length;
}

import { MapboxService } from '../../mapbox.service';
import {
  TRIP_ROUTE_TRAJECTORY_BEARING_THRESHOLD_DEG,
  TRIP_ROUTE_TRAJECTORY_RETENTION_MAX,
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

/**
 * Trajectory-aware retention: measured vertices only, preserves turns/curves.
 */
export function retainTrajectoryPoints(
  points: MeasuredRoutePoint[],
  maxPoints: number = TRIP_ROUTE_TRAJECTORY_RETENTION_MAX,
): MeasuredRoutePoint[] {
  if (points.length <= maxPoints) return [...points];
  if (points.length < 2) return [...points];

  const keep = new Set<number>([0, points.length - 1]);

  for (let i = 1; i < points.length - 1; i++) {
    const change = bearingChangeDegrees(points[i - 1], points[i], points[i + 1]);
    if (change >= TRIP_ROUTE_TRAJECTORY_BEARING_THRESHOLD_DEG) {
      keep.add(i);
    }
  }

  if (keep.size >= maxPoints) {
    return points.filter((_, idx) => keep.has(idx));
  }

  const remainingSlots = maxPoints - keep.size;
  const candidates: number[] = [];
  for (let i = 1; i < points.length - 1; i++) {
    if (!keep.has(i)) candidates.push(i);
  }

  if (candidates.length > 0 && remainingSlots > 0) {
    const step = candidates.length / remainingSlots;
    for (let i = 0; i < remainingSlots; i++) {
      keep.add(candidates[Math.min(candidates.length - 1, Math.floor(i * step))]);
    }
  }

  return points.filter((_, idx) => keep.has(idx));
}

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

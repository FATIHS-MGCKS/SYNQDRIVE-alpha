import type { RoutePoint, TripCoreDataPoint } from '../../../dimo/dimo-segments.service';
import {
  getProfileThresholds,
  TRIP_ROUTE_MOVEMENT_MIN_METERS,
} from '../trip-evidence.helpers';
import type { MovementEvidenceSource } from './trip-start-boundary-admission.types';

export interface TimedMovementEvidence {
  at: Date;
  source: MovementEvidenceSource;
}

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

function filterPointsInWindow<T extends { timestamp: string }>(
  points: T[],
  fromMs: number,
  toMs: number,
): T[] {
  return points.filter((p) => {
    const t = new Date(p.timestamp).getTime();
    return t >= fromMs && t <= toMs;
  });
}

export function findEarliestCoreMovementEvidence(
  corePoints: TripCoreDataPoint[],
  profile: string,
): TimedMovementEvidence | null {
  const t = getProfileThresholds(profile);
  let previousDistance: number | null = null;

  for (const point of corePoints) {
    const hasSpeedMotion =
      point.speed != null && point.speed > t.speedMotionKmh;
    const hasOdometerProgress =
      previousDistance != null &&
      point.travelledDistance != null &&
      point.travelledDistance > previousDistance + t.odometerMinDeltaKm;

    if (hasSpeedMotion) {
      return { at: new Date(point.timestamp), source: 'CORE_SPEED' };
    }
    if (hasOdometerProgress) {
      return { at: new Date(point.timestamp), source: 'CORE_ODOMETER' };
    }

    if (point.travelledDistance != null) {
      previousDistance = point.travelledDistance;
    }
  }

  return null;
}

export function findEarliestRouteMovementEvidence(
  routePoints: RoutePoint[],
  profile: string,
): TimedMovementEvidence | null {
  const t = getProfileThresholds(profile);

  for (let index = 0; index < routePoints.length; index++) {
    const point = routePoints[index];
    const previous = index > 0 ? routePoints[index - 1] : null;
    const hasSpeedMotion =
      point.speedKmh != null && point.speedKmh > t.speedMotionKmh;
    const hasCoordinateJump =
      previous != null &&
      haversineM(
        previous.latitude,
        previous.longitude,
        point.latitude,
        point.longitude,
      ) > TRIP_ROUTE_MOVEMENT_MIN_METERS;

    if (hasSpeedMotion) {
      return { at: new Date(point.timestamp), source: 'ROUTE_SPEED' };
    }
    if (hasCoordinateJump) {
      return { at: new Date(point.timestamp), source: 'ROUTE_POSITION' };
    }
  }

  return null;
}

/**
 * Earliest trusted movement inside [windowFrom, windowTo].
 * Picks min(timestamp) across core and route — no route-over-core priority.
 */
export function findEarliestTrustedMovementInWindow(
  windowFrom: Date,
  windowTo: Date,
  corePoints: TripCoreDataPoint[],
  routePoints: RoutePoint[],
  profile: string,
): { at: Date | null; sources: MovementEvidenceSource[] } {
  const fromMs = windowFrom.getTime();
  const toMs = windowTo.getTime();
  const core = filterPointsInWindow(corePoints, fromMs, toMs);
  const route = filterPointsInWindow(routePoints, fromMs, toMs);

  const coreEvidence = findEarliestCoreMovementEvidence(core, profile);
  const routeEvidence = findEarliestRouteMovementEvidence(route, profile);

  if (!coreEvidence && !routeEvidence) {
    return { at: null, sources: ['NONE'] };
  }

  if (coreEvidence && !routeEvidence) {
    return { at: coreEvidence.at, sources: [coreEvidence.source] };
  }
  if (routeEvidence && !coreEvidence) {
    return { at: routeEvidence.at, sources: [routeEvidence.source] };
  }

  if (coreEvidence!.at.getTime() <= routeEvidence!.at.getTime()) {
    return { at: coreEvidence!.at, sources: [coreEvidence!.source] };
  }
  return { at: routeEvidence!.at, sources: [routeEvidence!.source] };
}

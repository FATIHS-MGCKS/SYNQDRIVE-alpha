/**
 * Utilities for the Vehicle Detail Live Map: movement detection, bearing,
 * jitter suppression, and derived vehicle state (MOVING / IDLE / PARKED).
 * Motion is driven by 5s GPS updates; state combines GPS motion with snapshot signals.
 */

const EARTH_RADIUS_M = 6371000;

/** Distance between two [lng, lat] points in meters (haversine). */
export function distanceM(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  return EARTH_RADIUS_M * c;
}

/** Bearing in degrees from a to b (0 = north, 90 = east). */
export function bearingDeg(a: [number, number], b: [number, number]): number {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(dLng) * Math.cos((lat2 * Math.PI) / 180);
  const x =
    Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
    Math.sin((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.cos(dLng);
  let deg = (Math.atan2(y, x) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Minimum distance (m) to consider as real movement; below this treat as jitter. */
export const MOVEMENT_THRESHOLD_M = 8;

/** Whether the displacement is meaningful (not GPS jitter). */
export function isMeaningfulMovement(
  from: [number, number],
  to: [number, number],
  thresholdM: number = MOVEMENT_THRESHOLD_M
): boolean {
  return distanceM(from, to) >= thresholdM;
}

/**
 * Stable heading from recent points: use last meaningful segment to avoid jitter.
 * Returns null if not enough movement to determine heading.
 */
export function stableHeadingDeg(
  points: Array<[number, number]>,
  minMovementM: number = MOVEMENT_THRESHOLD_M
): number | null {
  if (points.length < 2) return null;
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1];
    const b = points[i];
    if (distanceM(a, b) >= minMovementM) return bearingDeg(a, b);
  }
  return null;
}

export type VehicleStateLabel = 'MOVING' | 'IDLE' | 'PARKED';
export type DisplayIgnition = 'ON' | 'OFF' | 'UNKNOWN';
export type OnlineStatus = 'ONLINE' | 'STANDBY' | 'OFFLINE';

/**
 * Local fallback: derive vehicle state from GPS-based motion and snapshot signals.
 * The backend now provides `displayState` as the canonical source; this remains
 * as a GPS-movement fallback when the backend field hasn't arrived yet.
 */
export function deriveVehicleState(
  gpsMoving: boolean,
  ignitionOn: boolean,
  engineLoad: number,
): VehicleStateLabel {
  if (gpsMoving) return 'MOVING';
  if (ignitionOn || engineLoad > 0) return 'IDLE';
  return 'PARKED';
}

/**
 * Linear interpolation between two [lng, lat] points.
 * t in [0, 1]; 0 = from, 1 = to.
 */
export function interpolateLngLat(
  from: [number, number],
  to: [number, number],
  t: number
): [number, number] {
  return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
}

/**
 * Ease-in-out so motion starts and ends smoothly (no overshoot).
 */
export function easeInOutCubic(t: number): number {
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

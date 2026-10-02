import type { LatLon } from '../types';

/** Fixed-precision key for exact-equality hold detection (C1D.4 input mapping). */
export function coordKey(lat: number, lon: number): string {
  return `${lat.toFixed(7)},${lon.toFixed(7)}`;
}

export function coordsEqual(a: LatLon, b: LatLon): boolean {
  return coordKey(a.latitude, a.longitude) === coordKey(b.latitude, b.longitude);
}

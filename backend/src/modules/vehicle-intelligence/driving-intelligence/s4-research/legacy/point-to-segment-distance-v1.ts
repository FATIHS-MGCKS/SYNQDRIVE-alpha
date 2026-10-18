/**
 * Historical V1 point–segment distance (dimensions-mismatched projection).
 * Retained read-only for before/after replay diffs — not used by matching V2+.
 */
import { haversineMeters } from '../../speed-qc/di-v0-speed-qc-geo';

export function pointToSegmentDistanceM_V1(
  plat: number,
  plon: number,
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const dA = haversineMeters(plat, plon, a.lat, a.lon);
  const segLen = haversineMeters(a.lat, a.lon, b.lat, b.lon);
  if (segLen < 0.5) return dA;
  const t = Math.max(
    0,
    Math.min(
      1,
      ((plat - a.lat) * (b.lat - a.lat) + (plon - a.lon) * (b.lon - a.lon)) / (segLen * segLen + 1e-12),
    ),
  );
  const projLat = a.lat + t * (b.lat - a.lat);
  const projLon = a.lon + t * (b.lon - a.lon);
  return haversineMeters(plat, plon, projLat, projLon);
}

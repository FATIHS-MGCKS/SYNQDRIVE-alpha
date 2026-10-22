import type { TripMotionMapPayload } from './motion-map.types';
import type { TripM7aMapOutcome, TripM7aMapPayload, TripM7aMapPoint } from './m7a-map.types';

export function isM7aMapEvaluationPresent(payload: TripM7aMapPayload | null | undefined): boolean {
  if (!payload) return false;
  return payload.status !== 'NOT_STARTED';
}

export function isM7aMapActive(payload: TripM7aMapPayload | null | undefined): boolean {
  if (!payload || payload.status !== 'SUCCEEDED') return false;
  if (payload.geometrySource !== 'POSITION_ANCHOR') return false;
  return payload.mapPoints.some((p) => p.positionResolved);
}

export type M7aMotionBinding = {
  compatible: boolean;
  reasonKey: string | null;
};

export function resolveM7aMotionBinding(
  motion: TripMotionMapPayload | null | undefined,
  m7a: TripM7aMapPayload | null | undefined,
): M7aMotionBinding {
  if (!m7a || !isM7aMapActive(m7a)) {
    return { compatible: false, reasonKey: 'trips.m7aMap.bindingM7aUnavailable' };
  }
  if (!motion || motion.status !== 'SUCCEEDED' && motion.status !== 'SUCCEEDED_EMPTY') {
    return { compatible: true, reasonKey: null };
  }
  if (!motion.snapshotBindingVerified) {
    return { compatible: false, reasonKey: 'trips.m7aMap.bindingMotionUnverified' };
  }
  if (!motion.pinnedSnapshotHash || !m7a.pinnedSnapshotHash) {
    return { compatible: false, reasonKey: 'trips.m7aMap.bindingSnapshotMissing' };
  }
  if (motion.pinnedSnapshotHash !== m7a.pinnedSnapshotHash) {
    return { compatible: false, reasonKey: 'trips.m7aMap.bindingSnapshotMismatch' };
  }
  // Zeitliche Kopplung erfolgt über identisches bucketLabelUtc je Sekunde; combinedInputIdentity
  // ist pro Shadow-Worker dieselbe Trip-Eingabe-Spalte, aber in unterschiedlichen Intent-Keys
  // eingebettet (Motion-Bundle vs. M7A+OSM-Fingerprint) — kein harter Gleichheitsgate.
  return { compatible: true, reasonKey: null };
}

export function findM7aPointForBucketLabel(
  payload: TripM7aMapPayload | null | undefined,
  bucketLabelUtc: string,
  binding: M7aMotionBinding,
): TripM7aMapPoint | null {
  if (!payload || !binding.compatible) return null;
  const point = payload.mapPoints.find((p) => p.bucketLabelUtc === bucketLabelUtc);
  if (!point || !point.positionResolved) return null;
  return point;
}

export function m7aOutcomeColor(outcome: TripM7aMapOutcome, isDark: boolean): string {
  switch (outcome) {
    case 'CONFIRMED':
      return isDark ? '#34d399' : '#059669';
    case 'AMBIGUOUS':
      return isDark ? '#fbbf24' : '#d97706';
    default:
      return isDark ? '#94a3b8' : '#64748b';
  }
}

export function buildM7aPointFeatures(points: TripM7aMapPoint[]): GeoJSON.Feature<GeoJSON.Point>[] {
  return points
    .filter((p) => p.positionResolved && p.latitude != null && p.longitude != null)
    .map((p) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.longitude!, p.latitude!] },
      properties: {
        bucketLabelUtc: p.bucketLabelUtc,
        outcome: p.outcome,
        osmWayId: p.osmWayId,
      },
    }));
}

export function m7aOutcomeLabelKey(outcome: TripM7aMapOutcome): string {
  switch (outcome) {
    case 'CONFIRMED':
      return 'trips.m7aMap.outcomeConfirmed';
    case 'AMBIGUOUS':
      return 'trips.m7aMap.outcomeAmbiguous';
    default:
      return 'trips.m7aMap.outcomeUnknown';
  }
}

export function groupM7aPointsByCoordinate(points: TripM7aMapPoint[]): Map<string, TripM7aMapPoint[]> {
  const map = new Map<string, TripM7aMapPoint[]>();
  for (const point of points) {
    if (!point.positionResolved || point.latitude == null || point.longitude == null) continue;
    const key = `${Math.round(point.latitude * 1e5)}:${Math.round(point.longitude * 1e5)}`;
    const list = map.get(key) ?? [];
    list.push(point);
    list.sort((a, b) => a.bucketLabelUtc.localeCompare(b.bucketLabelUtc));
    map.set(key, list);
  }
  return map;
}

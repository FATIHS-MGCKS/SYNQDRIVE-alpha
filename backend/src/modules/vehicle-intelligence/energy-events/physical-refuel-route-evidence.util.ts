import { createHash } from 'crypto';
import type { RoutePoint } from '@modules/dimo/dimo-segments.service';

/** Selector outcomes that may reflect temporally incomplete route evidence. */
export const ROUTE_EVIDENCE_ABSENCE_SELECTOR_STATUSES = new Set([
  'NO_DWELL_FOUND',
  'INSUFFICIENT_EVIDENCE',
  'AMBIGUOUS',
]);

export function computeRouteEvidenceFingerprint(
  points: Array<Pick<RoutePoint, 'timestamp' | 'latitude' | 'longitude'>>,
): string {
  const first = points[0];
  const last = points[points.length - 1];
  const payload = {
    count: points.length,
    firstTs: first?.timestamp ?? null,
    lastTs: last?.timestamp ?? null,
    firstLat: first?.latitude ?? null,
    firstLng: first?.longitude ?? null,
    lastLat: last?.latitude ?? null,
    lastLng: last?.longitude ?? null,
  };
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
}

export function hasRouteEvidenceChanged(
  persistedFingerprint: string | null | undefined,
  currentFingerprint: string | null | undefined,
): boolean {
  if (!persistedFingerprint || !currentFingerprint) return false;
  return persistedFingerprint !== currentFingerprint;
}

export function isRouteEvidenceAbsenceSelectorStatus(status: string): boolean {
  return ROUTE_EVIDENCE_ABSENCE_SELECTOR_STATUSES.has(status);
}

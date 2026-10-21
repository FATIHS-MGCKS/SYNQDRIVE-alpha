import { createHash } from 'crypto';
import type { TripRouteInputFingerprintInput, TripRouteInputPoint } from './trip-route.types';

const COORD_DECIMALS = 6;

function roundCoord(value: number): number {
  const factor = 10 ** COORD_DECIMALS;
  return Math.round(value * factor) / factor;
}

function normalizeRecordedAt(value: string): string {
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid recordedAt for route fingerprint: ${value}`);
  }
  return new Date(ms).toISOString();
}

/**
 * Canonicalize measured route points for fingerprinting.
 * Sorts by recordedAt ASC, then original index for stable ordering.
 */
export function canonicalizeTripRouteInputPoints(
  points: TripRouteInputPoint[],
): Array<{ latitude: number; longitude: number; recordedAt: string; index: number }> {
  return points
    .map((point, index) => ({
      latitude: roundCoord(point.latitude),
      longitude: roundCoord(point.longitude),
      recordedAt: normalizeRecordedAt(point.recordedAt),
      index,
    }))
    .sort((a, b) => {
      const ta = Date.parse(a.recordedAt);
      const tb = Date.parse(b.recordedAt);
      if (ta !== tb) return ta - tb;
      return a.index - b.index;
    });
}

/**
 * Deterministic SHA-256 fingerprint for route processing input.
 *
 * Includes: tripId, algorithmVersion, ordered coordinates + recordedAt.
 * Excludes: speed (not used by matching pipeline), DB metadata, Mapbox output.
 */
export function computeTripRouteInputFingerprint(
  input: TripRouteInputFingerprintInput,
): string {
  const canonicalPoints = canonicalizeTripRouteInputPoints(input.points).map((p) => ({
    lat: p.latitude,
    lng: p.longitude,
    t: p.recordedAt,
  }));

  const payload = JSON.stringify({
    tripId: input.tripId,
    algorithmVersion: input.algorithmVersion,
    points: canonicalPoints,
  });

  return createHash('sha256').update(payload).digest('hex');
}

export function buildTripRouteInputFingerprintInput(
  tripId: string,
  algorithmVersion: string,
  points: TripRouteInputPoint[],
): TripRouteInputFingerprintInput {
  return { tripId, algorithmVersion, points };
}

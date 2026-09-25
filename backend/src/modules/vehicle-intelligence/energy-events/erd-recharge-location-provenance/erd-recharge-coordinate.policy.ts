import type { DimoRechargeSegmentLocation } from '@modules/dimo/recharge-segments/dimo-recharge-segments.types';

export interface NormalizedGeographicCoordinatePair {
  latitude: number;
  longitude: number;
}

/**
 * Valid only when both latitude and longitude are finite and in range.
 * Partial pairs, NaN, Infinity, and out-of-range values are rejected (no clamping).
 */
export function normalizeAuthoritativeCoordinatePair(input: {
  latitude: number | null | undefined;
  longitude: number | null | undefined;
}): NormalizedGeographicCoordinatePair | null {
  const { latitude, longitude } = input;
  if (latitude == null || longitude == null) {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90) {
    return null;
  }
  if (longitude < -180 || longitude > 180) {
    return null;
  }
  return { latitude, longitude };
}

export function normalizeDimoRechargeSegmentLocation(
  location: DimoRechargeSegmentLocation,
): NormalizedGeographicCoordinatePair | null {
  return normalizeAuthoritativeCoordinatePair({
    latitude: location.latitude,
    longitude: location.longitude,
  });
}

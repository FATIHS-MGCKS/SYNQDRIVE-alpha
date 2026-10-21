/**
 * Route geometry contract for Trip Route V2 artifacts.
 *
 * Serialized storage format: JSON array of [longitude, latitude] pairs (GeoJSON order).
 * Not [lat, lng].
 */
export type TripRouteLngLat = [number, number];

const MIN_LNG = -180;
const MAX_LNG = 180;
const MIN_LAT = -90;
const MAX_LAT = 90;

export function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isValidLngLatPair(pair: unknown): pair is TripRouteLngLat {
  if (!Array.isArray(pair) || pair.length !== 2) return false;
  const [lng, lat] = pair;
  if (!isFiniteCoordinate(lng) || !isFiniteCoordinate(lat)) return false;
  if (lng < MIN_LNG || lng > MAX_LNG) return false;
  if (lat < MIN_LAT || lat > MAX_LAT) return false;
  if (lng === 0 && lat === 0) return false;
  return true;
}

/**
 * Parse persisted JSON geometry into validated [lng, lat][].
 * Returns null for absent geometry; throws on malformed payloads.
 */
export function parseTripRouteGeometryJson(value: unknown): TripRouteLngLat[] | null {
  if (value == null) return null;
  if (!Array.isArray(value)) {
    throw new Error('Route geometry must be a JSON array of [longitude, latitude] pairs');
  }
  if (value.length === 0) return [];

  const out: TripRouteLngLat[] = [];
  for (let i = 0; i < value.length; i++) {
    const pair = value[i];
    if (!isValidLngLatPair(pair)) {
      throw new Error(
        `Invalid route geometry coordinate at index ${i}: expected [longitude, latitude]`,
      );
    }
    out.push([pair[0], pair[1]]);
  }
  return out;
}

/** Safe read-path parse — never throws on malformed persisted artifact geometry. */
export function safeParseTripRouteGeometryJson(value: unknown): TripRouteLngLat[] | null {
  try {
    return parseTripRouteGeometryJson(value);
  } catch {
    return null;
  }
}

/** Serialize domain geometry for Prisma JSON columns. */
export function serializeTripRouteGeometry(
  geometry: TripRouteLngLat[] | null | undefined,
): TripRouteLngLat[] | null {
  if (geometry == null) return null;
  return parseTripRouteGeometryJson(geometry);
}

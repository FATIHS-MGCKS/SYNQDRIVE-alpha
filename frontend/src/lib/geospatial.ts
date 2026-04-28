/**
 * Geospatial utilities for trip route preprocessing and map visualization.
 * Used by the Trips tab to densify sparse DIMO route coordinates and build
 * continuous heatmap/line geometry.
 */

const EARTH_RADIUS_M = 6371000;

/** Check if a coordinate pair is valid and non-null. */
export function isValidCoord(
  lat: number | null | undefined,
  lng: number | null | undefined
): boolean {
  if (lat == null || lng == null) return false;
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  if (lat === 0 && lng === 0) return false; // often a sentinel for "no fix"
  return true;
}

/** Haversine distance between two [lng, lat] points in meters. */
export function distanceMeters(
  a: [number, number],
  b: [number, number]
): number {
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

/**
 * Decide whether a vehicle is currently parked / "at home" at its assigned
 * station. The station defines a circular geofence via `latitude`,
 * `longitude` and `radiusMeters`. A vehicle is "at home" if all of:
 *   1. The station has valid coordinates AND a positive radius.
 *   2. The vehicle has a recent valid GPS fix.
 *   3. The haversine distance is ≤ `radiusMeters`.
 *
 * Returns `null` when any required input is missing — callers can then
 * choose to render an "unbekannt" badge instead of a binary yes/no.
 */
export function isVehicleAtHomeStation(
  vehicle: { latitude: number | null | undefined; longitude: number | null | undefined },
  // V4.7.06 — `station` is now nullable in the type signature to match
  // the runtime contract (the body already early-returns `null` for a
  // missing station). Without this the `HomeAwayBadge` callers had to
  // pass a placeholder object whenever the vehicle's station could not
  // be resolved — clutter that the Operations → Fleet card consumer
  // hit when stations fetch is still inflight.
  station:
    | {
        latitude: number | null | undefined;
        longitude: number | null | undefined;
        radiusMeters: number | null | undefined;
      }
    | null
    | undefined,
): boolean | null {
  if (!station) return null;
  if (
    station.latitude == null ||
    station.longitude == null ||
    station.radiusMeters == null ||
    station.radiusMeters <= 0
  ) {
    return null;
  }
  if (!isValidCoord(vehicle.latitude, vehicle.longitude)) return null;

  const d = distanceMeters(
    [vehicle.longitude as number, vehicle.latitude as number],
    [station.longitude, station.latitude],
  );
  return d <= station.radiusMeters;
}

/**
 * Interpolate a point between a and b by fraction t in [0, 1].
 * Returns [lng, lat].
 */
export function interpolate(
  a: [number, number],
  b: [number, number],
  t: number
): [number, number] {
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  return [lng1 + (lng2 - lng1) * t, lat1 + (lat2 - lat1) * t];
}

export interface RoutePointInput {
  latitude: number;
  longitude: number;
  speedKmh?: number | null;
  timestamp?: string;
}

/**
 * Densify a route (ordered coordinates) by inserting points so that consecutive
 * points are at most maxStepMeters apart. Uses linear interpolation.
 * Preserves start/end; skips invalid points.
 * Cap: if the route would exceed maxOutputPoints, sample down instead of densifying.
 */
export function densifyRoute(
  points: RoutePointInput[],
  maxStepMeters: number = 35,
  maxOutputPoints: number = 8000
): Array<[number, number]> {
  const coords: [number, number][] = [];
  for (const p of points) {
    if (!isValidCoord(p.latitude, p.longitude)) continue;
    coords.push([p.longitude, p.latitude]);
  }
  if (coords.length < 2) return coords;

  const out: [number, number][] = [];
  out.push(coords[0]);

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const d = distanceMeters(prev, curr);
    if (d <= 0) continue;

    const n = Math.max(1, Math.ceil(d / maxStepMeters));
    const step = 1 / n;
    for (let k = 1; k < n; k++) {
      out.push(interpolate(prev, curr, step * k));
    }
    out.push(curr);
  }

  if (out.length > maxOutputPoints) {
    const step = out.length / maxOutputPoints;
    const sampled: [number, number][] = [];
    for (let i = 0; i < maxOutputPoints; i++) {
      const idx = Math.min(Math.floor(i * step), out.length - 1);
      sampled.push(out[idx]);
    }
    return sampled;
  }
  return out;
}

export interface HeatmapPointProperties {
  tripId?: string;
  vehicleId?: string;
  weight: number;
  timestamp?: string;
}

/**
 * Convert densified route coordinates to GeoJSON Point features for the heatmap.
 * Each point gets a weight; overlapping trips will sum visually.
 */
export function routeToHeatmapPoints(
  coords: Array<[number, number]>,
  options: {
    tripId?: string;
    vehicleId?: string;
    baseWeight?: number;
  } = {}
): GeoJSON.Feature<GeoJSON.Point>[] {
  const { tripId, vehicleId, baseWeight = 1 } = options;
  return coords.map((c, i) => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: c },
    properties: {
      tripId: tripId ?? undefined,
      vehicleId: vehicleId ?? undefined,
      weight: baseWeight,
    },
  }));
}

/**
 * Convert one or more routes (each an array of [lng, lat]) to GeoJSON LineString
 * features for the route overlay layer.
 */
export function routesToLineFeatures(
  routes: Array<{ coordinates: Array<[number, number]>; tripId?: string }>
): GeoJSON.Feature<GeoJSON.LineString>[] {
  const features: GeoJSON.Feature<GeoJSON.LineString>[] = [];
  for (const r of routes) {
    if (r.coordinates.length < 2) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: r.coordinates },
      properties: { tripId: r.tripId ?? undefined },
    });
  }
  return features;
}

export interface TripRouteInput {
  tripId: string;
  vehicleId?: string;
  points: RoutePointInput[];
}

/** Densification step in meters; ~20–50m yields continuous road-like corridors. */
const DENSIFY_STEP_M = 35;
const MAX_POINTS_PER_TRIP = 6000;

/**
 * Build derived GeoJSON for the Trips map: densified heatmap points and route lines.
 * Uses actual trip path geometry and densifies so the heatmap shows continuous
 * driven corridors instead of sparse dots.
 */
export function buildTripsMapGeoJson(
  tripRoutes: TripRouteInput[]
): {
  heatmap: GeoJSON.FeatureCollection<GeoJSON.Point>;
  lines: GeoJSON.FeatureCollection<GeoJSON.LineString>;
} {
  const heatFeatures: GeoJSON.Feature<GeoJSON.Point>[] = [];
  const lineFeatures: GeoJSON.Feature<GeoJSON.LineString>[] = [];

  for (const tr of tripRoutes) {
    if (!tr.points.length) continue;
    const densified = densifyRoute(
      tr.points,
      DENSIFY_STEP_M,
      MAX_POINTS_PER_TRIP
    );
    if (densified.length < 2) continue;

    const points = routeToHeatmapPoints(densified, {
      tripId: tr.tripId,
      vehicleId: tr.vehicleId,
      baseWeight: 1,
    });
    heatFeatures.push(...points);

    lineFeatures.push({
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: densified },
      properties: { tripId: tr.tripId },
    });
  }

  return {
    heatmap: { type: 'FeatureCollection', features: heatFeatures },
    lines: { type: 'FeatureCollection', features: lineFeatures },
  };
}

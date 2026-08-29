/** Mapbox Matching API coordinate limit per request. */
export const MAPBOX_MATCHING_MAX_COORDINATES = 100;

/** Target chunk size (headroom below API limit). */
export const TRIP_ROUTE_CHUNK_MAX_COORDINATES = 90;

/** Deterministic overlap between adjacent chunks within a continuous segment. */
export const TRIP_ROUTE_CHUNK_OVERLAP_COORDINATES = 10;

/** Max retained measured points per continuous segment before chunking. */
export const TRIP_ROUTE_TRAJECTORY_RETENTION_MAX = 10_000;

/** Minimum bearing change (degrees) to always retain a trajectory point. */
export const TRIP_ROUTE_TRAJECTORY_BEARING_THRESHOLD_DEG = 15;

/** Max seam distance (m) between stitched chunk boundaries. */
export const TRIP_ROUTE_SEAM_MAX_DISTANCE_METERS = 25;

/** Hard gate: minimum route-level match confidence (0..1). */
export const TRIP_ROUTE_MATCH_MIN_CONFIDENCE = 0.5;

/** Hard gate: minimum tracepoint coverage (0..1). */
export const TRIP_ROUTE_MATCH_MIN_COVERAGE = 0.85;

/** Hard gate: matched/filtered distance ratio lower bound. */
export const TRIP_ROUTE_MATCH_MIN_DISTANCE_RATIO = 0.7;

/** Hard gate: matched/filtered distance ratio upper bound. */
export const TRIP_ROUTE_MATCH_MAX_DISTANCE_RATIO = 1.5;

/** Conservative static GPS radius for Mapbox matching (meters). */
export const TRIP_ROUTE_MAPBOX_RADIUS_METERS = 25;

/** Per-request Mapbox timeout. */
export const TRIP_ROUTE_MAPBOX_REQUEST_TIMEOUT_MS = 30_000;

/** Safety cap on paid Mapbox requests per trip per job attempt. */
export const TRIP_ROUTE_MAX_MAPBOX_REQUESTS_PER_TRIP = 200;

/** Mapbox provider identity on MATCHED artifacts. */
export const TRIP_ROUTE_MAPBOX_PROVIDER = 'mapbox';

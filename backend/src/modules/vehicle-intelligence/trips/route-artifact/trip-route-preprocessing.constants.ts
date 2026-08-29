/**
 * Trip Route V2 R2 — deterministic preprocessing thresholds.
 *
 * Evidence basis (read-only audit / repo conventions):
 * - DIMO route enrichment buckets are ~7s (`RoutePoint` from 7-second buckets).
 * - Trip mid-gap split uses TRIP_MID_GAP_SPLIT_MS default 180_000 (3 min).
 * - GPS consumer-grade accuracy is typically 5–15 m; we use conservative margins.
 * - German autobahn legal max ~250 km/h; fleet plausibility cap includes safety margin.
 *
 * Production distribution measurements were not available in this environment;
 * thresholds are conservative and covered by the R2 test matrix.
 */

/** Coordinate rounding — must match fingerprint canonicalization (6 decimals). */
export const TRIP_ROUTE_COORD_DECIMALS = 6;

/**
 * Consecutive observations within this distance (m) and time window are near-duplicates.
 * Retains first in cluster; drops later redundant stationary jitter.
 */
export const TRIP_ROUTE_NEAR_DUPLICATE_METERS = 5;

/** Max elapsed seconds between near-duplicate observations. */
export const TRIP_ROUTE_NEAR_DUPLICATE_MAX_SECONDS = 30;

/**
 * Telemetry gap threshold for diagnostics (seconds).
 * Aligned with worker.tripMidGapSplitMs default (180s) — gaps are recorded, not bridged.
 */
export const TRIP_ROUTE_GAP_THRESHOLD_SECONDS = 180;

/**
 * Maximum plausible implied speed between consecutive measured points (km/h).
 * 280 km/h = autobahn ceiling + margin; avoids rejecting legitimate motorway travel.
 */
export const TRIP_ROUTE_MAX_PLAUSIBLE_SPEED_KMH = 280;

/** Minimum elapsed seconds when computing implied speed (avoids divide-by-zero noise). */
export const TRIP_ROUTE_MIN_ELAPSED_SECONDS = 1;

/**
 * Stationary cluster radius (m). Points within this distance over time with low movement
 * are collapsed while preserving cluster boundaries.
 */
export const TRIP_ROUTE_STATIONARY_CLUSTER_METERS = 15;

/** Minimum duration (s) before collapsing a stationary cluster (≈2× DIMO route cadence). */
export const TRIP_ROUTE_STATIONARY_MIN_DURATION_SECONDS = 14;

/**
 * Douglas–Peucker tolerance (m) on measured vertices only.
 * 8 m preserves urban turns while reducing dense straight-line redundancy.
 */
export const TRIP_ROUTE_SIMPLIFICATION_TOLERANCE_METERS = 8;

/** Skip simplification when point count is at or below this threshold. */
export const TRIP_ROUTE_SIMPLIFICATION_ACTIVATION_COUNT = 20;

/** Measured-route provider identity for R2 artifacts. */
export const TRIP_ROUTE_MEASURED_PROVIDER = 'dimo-route-enrichment';

/**
 * M3.2B shadow shutdown evidence acquisition constants.
 * Documented thresholds — do not silently weaken without architecture review.
 */

/** Capture window before trip end (ms). */
export const SHUTDOWN_CAPTURE_PRE_WINDOW_MS = 10 * 60_000;

/** Capture window after trip end (ms). */
export const SHUTDOWN_CAPTURE_POST_WINDOW_MS = 15 * 60_000;

/**
 * Max age after trip end for POST_ENGINE_OFF_PRE_SLEEP classification.
 * Rationale: shutdown anchor must be near trip boundary, not a later wake.
 */
export const SHUTDOWN_POST_ENGINE_OFF_MAX_AGE_AFTER_TRIP_END_MS = 10 * 60_000;

/**
 * Max cross-field timestamp spread for ALIGNED state (matches REST quality skew).
 */
export const SHUTDOWN_MAX_ALIGNED_FIELD_SKEW_MS = 60_000;

/**
 * Beyond this skew, classification must prefer STALE_OR_SKEWED_STATE.
 */
export const SHUTDOWN_MAX_ACCEPTABLE_FIELD_SKEW_MS = 5 * 60_000;

/** Speed at rest threshold (km/h) — aligned with lv-rest-window.policy. */
export const SHUTDOWN_SPEED_AT_REST_KMH = 0.5;

/** LV voltage implying alternator/charging influence. */
export const SHUTDOWN_ALTERNATOR_VOLTAGE_THRESHOLD_V = 13.8;

/** LV charging context threshold — aligned with REST policy default. */
export const SHUTDOWN_LV_CHARGING_VOLTAGE_THRESHOLD_V = 13.25;

/** Engine load proxy threshold for engineRunning derivation. */
export const SHUTDOWN_ENGINE_LOAD_RUNNING_THRESHOLD = 5;

export const SHUTDOWN_TIMESTAMP_SOURCES = {
  PROVIDER_SIGNAL_TIMESTAMP: 'PROVIDER_SIGNAL_TIMESTAMP',
  VLS_SOURCE_TIMESTAMP: 'VLS_SOURCE_TIMESTAMP',
  VLS_PROVIDER_FETCHED_AT: 'VLS_PROVIDER_FETCHED_AT',
  INGEST_WALL_CLOCK: 'INGEST_WALL_CLOCK',
  TRIP_FSM_CANONICAL: 'TRIP_FSM_CANONICAL',
  UNKNOWN: 'UNKNOWN',
} as const;

export type ShutdownTimestampSource =
  (typeof SHUTDOWN_TIMESTAMP_SOURCES)[keyof typeof SHUTDOWN_TIMESTAMP_SOURCES];

export const SHUTDOWN_EVIDENCE_SOURCE_KINDS = {
  LIVE_VOLTAGE_CLASSIFY: 'LIVE_VOLTAGE_CLASSIFY',
  TRIP_FINALIZE_SNAPSHOT: 'TRIP_FINALIZE_SNAPSHOT',
} as const;

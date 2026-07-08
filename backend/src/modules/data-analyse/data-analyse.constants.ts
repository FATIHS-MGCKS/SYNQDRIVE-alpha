export const DATA_ANALYSE_MODULE = 'data-analyse' as const;

/** Temporary internal debugging surface until MVP — not a long-term product hub. */

/** Default DIMO snapshot worker interval (see worker.config snapshotIntervalMs). */
export const DEFAULT_SNAPSHOT_EXPECTED_INTERVAL_MS = 30_000;

/** Signals observed faster than this are treated as high-frequency candidates. */
export const HIGH_FREQUENCY_THRESHOLD_MS = 2_000;

/** Conservative minimum sample interval for launch-like start detection. */
export const LAUNCH_DETECTION_MIN_INTERVAL_MS = 500;

/** ClickHouse lookback window for interval statistics. */
export const CLICKHOUSE_ANALYSIS_WINDOW_HOURS = 24;

/**
 * Maximum interval that is still treated as telemetry *cadence* rather than an
 * offline gap. Anything larger (vehicle parked/offline, re-onboarding, bad
 * timestamps) is excluded from cadence KPIs (avg/median/p95/slowest) so a
 * single multi-day gap can no longer surface as an absurd "slowest interval"
 * (e.g. ~40,505,646s). The true longest gap is still reported separately as a
 * gap metric. 6 hours is well above any real polling cadence (~30s snapshots,
 * 1s HF) yet below typical offline windows.
 */
export const MAX_PLAUSIBLE_CADENCE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/** Stale health calculation threshold (7 days). */
export const HEALTH_STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

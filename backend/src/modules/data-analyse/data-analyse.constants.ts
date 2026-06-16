export const DATA_ANALYSE_MODULE = 'data-analyse' as const;

/** Default DIMO snapshot worker interval (see worker.config snapshotIntervalMs). */
export const DEFAULT_SNAPSHOT_EXPECTED_INTERVAL_MS = 30_000;

/** Signals observed faster than this are treated as high-frequency candidates. */
export const HIGH_FREQUENCY_THRESHOLD_MS = 2_000;

/** Conservative minimum sample interval for launch-like start detection. */
export const LAUNCH_DETECTION_MIN_INTERVAL_MS = 500;

/** ClickHouse lookback window for interval statistics. */
export const CLICKHOUSE_ANALYSIS_WINDOW_HOURS = 24;

/** Stale health calculation threshold (7 days). */
export const HEALTH_STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

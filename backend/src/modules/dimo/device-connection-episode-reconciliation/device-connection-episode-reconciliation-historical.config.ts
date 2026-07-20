/** Default historical evidence window around each unplug episode. */
export const RECONCILIATION_HISTORICAL_DEFAULTS = {
  /** Lookback before unplug for baseline context. */
  preUnplugMs: 24 * 60 * 60 * 1000,
  /** Maximum post-unplug window when no explicit plug or recovery caps it earlier. */
  postUnplugMaxMs: 14 * 24 * 60 * 60 * 1000,
  /** receivedAt − observedAt above this marks a delayed/backfill snapshot. */
  backfillLagThresholdMs: 15 * 60 * 1000,
  /** Minimum span for sustained telemetry from historical samples. */
  sustainedTelemetryMinSpanMs: 5 * 60 * 1000,
} as const;

export type ReconciliationHistoricalWindowConfig =
  typeof RECONCILIATION_HISTORICAL_DEFAULTS;

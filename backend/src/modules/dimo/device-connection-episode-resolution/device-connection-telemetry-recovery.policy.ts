/**
 * Conservative sustained-telemetry recovery policy for TELEMETRY_RESUMED.
 *
 * A snapshot alone never resolves an unplug episode. Closure requires one of:
 * - SPAN: multiple operational snapshots spanning at least minSpanMs without large gaps
 * - TRIP: at least one valid operational snapshot plus a trip started/completed after unplug
 * - CONNECTION_STATUS: provider CONNECTED plus multiple fresh operational snapshots
 *
 * Configure via DEVICE_CONNECTION_TELEMETRY_RECOVERY_* env vars.
 */
export type TelemetryRecoveryPolicyVariant =
  | 'SPAN'
  | 'TRIP'
  | 'CONNECTION_STATUS';

export interface TelemetryRecoveryPolicy {
  minSnapshotsForSpan: number;
  minSpanMs: number;
  maxGapBetweenSnapshotsMs: number;
  minFreshSnapshotsWithConnection: number;
  connectionStatusFreshWindowMs: number;
  maxBackfillLagMs: number;
  requireOperationalSignal: boolean;
}

export const DEFAULT_TELEMETRY_RECOVERY_POLICY: TelemetryRecoveryPolicy = {
  minSnapshotsForSpan: 2,
  minSpanMs: 60_000,
  maxGapBetweenSnapshotsMs: 10 * 60_000,
  minFreshSnapshotsWithConnection: 2,
  connectionStatusFreshWindowMs: 5 * 60_000,
  maxBackfillLagMs: 24 * 60 * 60_000,
  requireOperationalSignal: true,
};

function readPositiveInt(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (raw == null || raw.trim() === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function loadTelemetryRecoveryPolicy(
  overrides: Partial<TelemetryRecoveryPolicy> = {},
): TelemetryRecoveryPolicy {
  return {
    minSnapshotsForSpan: readPositiveInt(
      'DEVICE_CONNECTION_TELEMETRY_RECOVERY_MIN_SNAPSHOTS',
      DEFAULT_TELEMETRY_RECOVERY_POLICY.minSnapshotsForSpan,
    ),
    minSpanMs: readPositiveInt(
      'DEVICE_CONNECTION_TELEMETRY_RECOVERY_MIN_SPAN_MS',
      DEFAULT_TELEMETRY_RECOVERY_POLICY.minSpanMs,
    ),
    maxGapBetweenSnapshotsMs: readPositiveInt(
      'DEVICE_CONNECTION_TELEMETRY_RECOVERY_MAX_GAP_MS',
      DEFAULT_TELEMETRY_RECOVERY_POLICY.maxGapBetweenSnapshotsMs,
    ),
    minFreshSnapshotsWithConnection: readPositiveInt(
      'DEVICE_CONNECTION_TELEMETRY_RECOVERY_MIN_FRESH_WITH_CONNECTION',
      DEFAULT_TELEMETRY_RECOVERY_POLICY.minFreshSnapshotsWithConnection,
    ),
    connectionStatusFreshWindowMs: readPositiveInt(
      'DEVICE_CONNECTION_TELEMETRY_RECOVERY_CONNECTION_FRESH_MS',
      DEFAULT_TELEMETRY_RECOVERY_POLICY.connectionStatusFreshWindowMs,
    ),
    maxBackfillLagMs: readPositiveInt(
      'DEVICE_CONNECTION_TELEMETRY_RECOVERY_MAX_BACKFILL_LAG_MS',
      DEFAULT_TELEMETRY_RECOVERY_POLICY.maxBackfillLagMs,
    ),
    requireOperationalSignal:
      process.env.DEVICE_CONNECTION_TELEMETRY_RECOVERY_REQUIRE_OPERATIONAL !== 'false',
    ...overrides,
  };
}

/** Align with `useLiveVehicleTelemetry` dashboard cycle (30s). */
export const BATTERY_LIVE_REFETCH_MS = 30_000;

/** Default health-model staleness when no targeted invalidation fired. */
export const BATTERY_HEALTH_STALE_MS = 5 * 60_000;

export type BatteryFreshnessScope = 'live' | 'health';

export interface BatteryFreshnessTimestamps {
  liveFetchedAt: number | null;
  healthFetchedAt: number | null;
}

export function isLiveStale(
  timestamps: BatteryFreshnessTimestamps,
  now = Date.now(),
  maxAgeMs = BATTERY_LIVE_REFETCH_MS,
): boolean {
  if (timestamps.liveFetchedAt == null) return true;
  return now - timestamps.liveFetchedAt >= maxAgeMs;
}

export function isHealthStale(
  timestamps: BatteryFreshnessTimestamps,
  now = Date.now(),
  maxAgeMs = BATTERY_HEALTH_STALE_MS,
): boolean {
  if (timestamps.healthFetchedAt == null) return true;
  return now - timestamps.healthFetchedAt >= maxAgeMs;
}

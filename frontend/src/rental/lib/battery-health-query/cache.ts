import type { BatteryFreshnessTimestamps } from './freshness';

export interface BatteryHealthCacheEntry<T> {
  data: T | null;
  error: string | null;
  liveFetchedAt: number | null;
  healthFetchedAt: number | null;
  version: number;
}

const cache = new Map<string, BatteryHealthCacheEntry<unknown>>();
let versionCounter = 0;

export function nextBatteryHealthCacheVersion(): number {
  versionCounter += 1;
  return versionCounter;
}

export function getBatteryHealthCacheEntry<T>(
  cacheKey: string,
): BatteryHealthCacheEntry<T> | undefined {
  return cache.get(cacheKey) as BatteryHealthCacheEntry<T> | undefined;
}

export function setBatteryHealthCacheEntry<T>(
  cacheKey: string,
  patch: Partial<BatteryHealthCacheEntry<T>> & {
    data?: T | null;
  },
): BatteryHealthCacheEntry<T> {
  const previous = cache.get(cacheKey) as BatteryHealthCacheEntry<T> | undefined;
  const next: BatteryHealthCacheEntry<T> = {
    data: patch.data !== undefined ? patch.data : (previous?.data ?? null),
    error: patch.error !== undefined ? patch.error : (previous?.error ?? null),
    liveFetchedAt:
      patch.liveFetchedAt !== undefined
        ? patch.liveFetchedAt
        : (previous?.liveFetchedAt ?? null),
    healthFetchedAt:
      patch.healthFetchedAt !== undefined
        ? patch.healthFetchedAt
        : (previous?.healthFetchedAt ?? null),
    version: patch.version ?? previous?.version ?? nextBatteryHealthCacheVersion(),
  };
  cache.set(cacheKey, next as BatteryHealthCacheEntry<unknown>);
  return next;
}

export function snapshotBatteryHealthCache<T>(
  cacheKey: string,
): BatteryHealthCacheEntry<T> | null {
  const entry = getBatteryHealthCacheEntry<T>(cacheKey);
  if (!entry) return null;
  return { ...entry };
}

export function rollbackBatteryHealthCache<T>(
  cacheKey: string,
  snapshot: BatteryHealthCacheEntry<T>,
): void {
  cache.set(cacheKey, { ...snapshot, version: nextBatteryHealthCacheVersion() });
}

export function clearBatteryHealthCacheForVehicle(
  orgId: string,
  vehicleId: string,
): void {
  const prefix = JSON.stringify(['battery-health', orgId, vehicleId]);
  for (const key of [...cache.keys()]) {
    if (key.startsWith(prefix.slice(0, -1))) {
      cache.delete(key);
    }
  }
}

export function getBatteryHealthCacheTimestamps(
  cacheKey: string,
): BatteryFreshnessTimestamps {
  const entry = cache.get(cacheKey);
  return {
    liveFetchedAt: entry?.liveFetchedAt ?? null,
    healthFetchedAt: entry?.healthFetchedAt ?? null,
  };
}

/** Test-only reset. */
export function resetBatteryHealthCache(): void {
  cache.clear();
  versionCounter = 0;
}

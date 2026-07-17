import { describe, expect, it, beforeEach } from 'vitest';
import {
  getBatteryHealthCacheEntry,
  resetBatteryHealthCache,
  rollbackBatteryHealthCache,
  setBatteryHealthCacheEntry,
  snapshotBatteryHealthCache,
} from './cache';
import { batteryHealthQueryKeys, serializeBatteryHealthQueryKey } from './keys';

describe('battery-health cache', () => {
  const cacheKey = serializeBatteryHealthQueryKey(
    batteryHealthQueryKeys.summary('org-a', 'veh-1'),
  );

  beforeEach(() => {
    resetBatteryHealthCache();
  });

  it('stores data, error, and freshness timestamps', () => {
    const entry = setBatteryHealthCacheEntry(cacheKey, {
      data: { canonical: { id: 'bat-1' } },
      error: null,
      liveFetchedAt: 100,
      healthFetchedAt: 200,
    });

    expect(getBatteryHealthCacheEntry(cacheKey)?.data).toEqual({ canonical: { id: 'bat-1' } });
    expect(entry.liveFetchedAt).toBe(100);
    expect(entry.healthFetchedAt).toBe(200);
  });

  it('rolls back to a prior snapshot on mutation failure', () => {
    setBatteryHealthCacheEntry(cacheKey, {
      data: { canonical: { id: 'stable' } },
      liveFetchedAt: 10,
      healthFetchedAt: 10,
    });
    const snapshot = snapshotBatteryHealthCache(cacheKey);
    expect(snapshot).not.toBeNull();

    setBatteryHealthCacheEntry(cacheKey, {
      data: { canonical: { id: 'optimistic' } },
      liveFetchedAt: 20,
      healthFetchedAt: 20,
    });

    rollbackBatteryHealthCache(cacheKey, snapshot!);

    const restored = getBatteryHealthCacheEntry(cacheKey);
    expect(restored?.data).toEqual({ canonical: { id: 'stable' } });
    expect(restored?.liveFetchedAt).toBe(10);
    expect(restored?.healthFetchedAt).toBe(10);
  });
});

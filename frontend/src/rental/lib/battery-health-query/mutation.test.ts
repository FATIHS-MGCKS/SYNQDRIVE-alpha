import { beforeEach, describe, expect, it } from 'vitest';
import {
  getBatteryHealthCacheEntry,
  resetBatteryHealthCache,
  setBatteryHealthCacheEntry,
} from './cache';
import { batteryHealthQueryKeys, serializeBatteryHealthQueryKey } from './keys';
import { withBatteryHealthCacheRollback } from './mutation';

describe('withBatteryHealthCacheRollback', () => {
  const cacheKey = serializeBatteryHealthQueryKey(
    batteryHealthQueryKeys.detail('org-a', 'veh-1'),
  );

  beforeEach(() => {
    resetBatteryHealthCache();
    setBatteryHealthCacheEntry(cacheKey, {
      data: { canonical: { id: 'before' } },
      liveFetchedAt: 1,
      healthFetchedAt: 1,
    });
  });

  it('restores cache snapshots when mutation throws', async () => {
    await expect(
      withBatteryHealthCacheRollback([cacheKey], async () => {
        setBatteryHealthCacheEntry(cacheKey, {
          data: { canonical: { id: 'during' } },
        });
        throw new Error('apply failed');
      }),
    ).rejects.toThrow('apply failed');

    expect(getBatteryHealthCacheEntry(cacheKey)?.data).toEqual({ canonical: { id: 'before' } });
  });

  it('keeps optimistic cache when mutation succeeds', async () => {
    await withBatteryHealthCacheRollback([cacheKey], async () => {
      setBatteryHealthCacheEntry(cacheKey, {
        data: { canonical: { id: 'after' } },
      });
      return 'ok';
    });

    expect(getBatteryHealthCacheEntry(cacheKey)?.data).toEqual({ canonical: { id: 'after' } });
  });
});

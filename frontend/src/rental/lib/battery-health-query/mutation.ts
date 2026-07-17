import {
  rollbackBatteryHealthCache,
  snapshotBatteryHealthCache,
  type BatteryHealthCacheEntry,
} from './cache';

export async function withBatteryHealthCacheRollback<T>(
  cacheKeys: string[],
  mutation: () => Promise<T>,
): Promise<T> {
  const snapshots = cacheKeys.map((key) => snapshotBatteryHealthCache(key));
  try {
    return await mutation();
  } catch (error) {
    cacheKeys.forEach((key, index) => {
      const snapshot = snapshots[index];
      if (snapshot) {
        rollbackBatteryHealthCache(key, snapshot as BatteryHealthCacheEntry<unknown>);
      }
    });
    throw error;
  }
}

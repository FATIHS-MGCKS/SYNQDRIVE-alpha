export { batteryHealthQueryKeys, serializeBatteryHealthQueryKey, queryKeyMatches } from './keys';
export {
  BATTERY_LIVE_REFETCH_MS,
  BATTERY_HEALTH_STALE_MS,
  isLiveStale,
  isHealthStale,
} from './freshness';
export {
  getBatteryHealthCacheEntry,
  setBatteryHealthCacheEntry,
  snapshotBatteryHealthCache,
  rollbackBatteryHealthCache,
  resetBatteryHealthCache,
} from './cache';
export {
  invalidateBatteryHealthQueries,
  subscribeBatteryHealthInvalidation,
  matchesBatteryHealthInvalidation,
  registerBatteryHealthReloadHandler,
  invalidateAllBatteryHealthForVehicle,
  resetBatteryHealthReloadHandlers,
} from './invalidate';
export { mergeBatteryLiveSlice } from './merge-live';
export { mapBatteryHealthQueryError, isBatteryHealthAbortError } from './errors';
export { withBatteryHealthCacheRollback } from './mutation';
export { deriveHvBatteryStatusFromDetail } from './derive-hv-status';
export { useBatteryHealthQuery } from './useBatteryHealthQuery';
export type { BatteryHealthQueryVariant, BatteryHealthQueryResult } from './useBatteryHealthQuery';

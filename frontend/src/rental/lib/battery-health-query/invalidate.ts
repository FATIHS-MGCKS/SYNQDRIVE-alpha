import { batteryHealthQueryKeys, queryKeyMatches } from './keys';
import {
  clearBatteryHealthCacheForVehicle,
  getBatteryHealthCacheEntry,
  nextBatteryHealthCacheVersion,
  setBatteryHealthCacheEntry,
} from './cache';

export const BATTERY_HEALTH_INVALIDATE_EVENT = 'battery-health:invalidate' as const;

export type BatteryHealthInvalidationReason =
  | 'publication-updated'
  | 'hv-session-completed'
  | 'evidence-added'
  | 'document-confirmed'
  | 'manual'
  | 'operational';

export type BatteryHealthInvalidationScope = 'summary' | 'detail' | 'live' | 'health';

export interface BatteryHealthInvalidationDetail {
  orgId: string;
  vehicleId: string;
  reason: BatteryHealthInvalidationReason;
  scopes?: BatteryHealthInvalidationScope[];
}

export interface BatteryHealthInvalidationEvent
  extends CustomEvent<BatteryHealthInvalidationDetail> {}

const reloadHandlers = new Map<string, Set<() => void>>();

function handlerKey(orgId: string, vehicleId: string, variant: 'summary' | 'detail'): string {
  return `${orgId}:${vehicleId}:${variant}`;
}

export function registerBatteryHealthReloadHandler(
  orgId: string,
  vehicleId: string,
  variant: 'summary' | 'detail',
  handler: () => void,
): () => void {
  const key = handlerKey(orgId, vehicleId, variant);
  const set = reloadHandlers.get(key) ?? new Set();
  set.add(handler);
  reloadHandlers.set(key, set);
  return () => {
    set.delete(handler);
    if (set.size === 0) reloadHandlers.delete(key);
  };
}

function dispatchReloadHandlers(
  orgId: string,
  vehicleId: string,
  scopes: BatteryHealthInvalidationScope[] | undefined,
): void {
  const wantsSummary =
    !scopes || scopes.includes('summary') || scopes.includes('health') || scopes.includes('live');
  const wantsDetail =
    !scopes || scopes.includes('detail') || scopes.includes('health') || scopes.includes('live');

  if (wantsSummary) {
    for (const handler of reloadHandlers.get(handlerKey(orgId, vehicleId, 'summary')) ?? []) {
      handler();
    }
  }
  if (wantsDetail) {
    for (const handler of reloadHandlers.get(handlerKey(orgId, vehicleId, 'detail')) ?? []) {
      handler();
    }
  }
}

export function invalidateBatteryHealthQueries(
  detail: BatteryHealthInvalidationDetail,
): void {
  if (!detail.orgId || !detail.vehicleId) return;

  const scopes = detail.scopes;
  const bustHealth =
    !scopes || scopes.includes('health') || scopes.includes('summary') || scopes.includes('detail');

  if (bustHealth) {
    for (const variant of ['summary', 'detail'] as const) {
      const key = batteryHealthQueryKeys[variant](detail.orgId, detail.vehicleId);
      const cacheKey = JSON.stringify(key);
      const entry = getBatteryHealthCacheEntry(cacheKey);
      if (entry) {
        setBatteryHealthCacheEntry(cacheKey, {
          healthFetchedAt: null,
          version: nextBatteryHealthCacheVersion(),
        });
      }
    }
  }

  if (scopes?.includes('live')) {
    for (const variant of ['summary', 'detail'] as const) {
      const cacheKey = JSON.stringify(
        batteryHealthQueryKeys[variant](detail.orgId, detail.vehicleId),
      );
      const entry = getBatteryHealthCacheEntry(cacheKey);
      if (entry) {
        setBatteryHealthCacheEntry(cacheKey, {
          liveFetchedAt: null,
          version: nextBatteryHealthCacheVersion(),
        });
      }
    }
  }

  dispatchReloadHandlers(detail.orgId, detail.vehicleId, scopes);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent<BatteryHealthInvalidationDetail>(BATTERY_HEALTH_INVALIDATE_EVENT, {
        detail,
      }),
    );
  }
}

export function subscribeBatteryHealthInvalidation(
  listener: (detail: BatteryHealthInvalidationDetail) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => {
    const custom = event as BatteryHealthInvalidationEvent;
    if (custom.detail) listener(custom.detail);
  };
  window.addEventListener(BATTERY_HEALTH_INVALIDATE_EVENT, handler);
  return () => window.removeEventListener(BATTERY_HEALTH_INVALIDATE_EVENT, handler);
}

export function matchesBatteryHealthInvalidation(
  detail: BatteryHealthInvalidationDetail,
  orgId: string | null | undefined,
  vehicleId: string | null | undefined,
  variant: 'summary' | 'detail',
): boolean {
  if (!orgId || !vehicleId) return false;
  if (detail.orgId !== orgId || detail.vehicleId !== vehicleId) return false;
  const scopes = detail.scopes;
  if (!scopes) return true;
  if (scopes.includes(variant)) return true;
  if (scopes.includes('health') || scopes.includes('live')) return true;
  return false;
}

export function invalidateAllBatteryHealthForVehicle(
  orgId: string,
  vehicleId: string,
  reason: BatteryHealthInvalidationReason = 'manual',
): void {
  clearBatteryHealthCacheForVehicle(orgId, vehicleId);
  invalidateBatteryHealthQueries({ orgId, vehicleId, reason });
}

export function batteryHealthKeysForVehicle(
  orgId: string,
  vehicleId: string,
): readonly (readonly unknown[])[] {
  return [
    batteryHealthQueryKeys.vehicle(orgId, vehicleId),
    batteryHealthQueryKeys.summary(orgId, vehicleId),
    batteryHealthQueryKeys.detail(orgId, vehicleId),
  ];
}

export function matchesBatteryHealthKeyPrefix(
  prefix: readonly unknown[],
  detail: BatteryHealthInvalidationDetail,
): boolean {
  return batteryHealthKeysForVehicle(detail.orgId, detail.vehicleId).some((key) =>
    queryKeyMatches(prefix, key),
  );
}

/** Test-only reset. */
export function resetBatteryHealthReloadHandlers(): void {
  reloadHandlers.clear();
}

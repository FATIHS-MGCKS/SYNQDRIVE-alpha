// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getBatteryHealthCacheEntry,
  resetBatteryHealthCache,
  setBatteryHealthCacheEntry,
} from './cache';
import { batteryHealthQueryKeys, serializeBatteryHealthQueryKey } from './keys';
import {
  BATTERY_HEALTH_INVALIDATE_EVENT,
  invalidateBatteryHealthQueries,
  matchesBatteryHealthInvalidation,
  registerBatteryHealthReloadHandler,
  resetBatteryHealthReloadHandlers,
  subscribeBatteryHealthInvalidation,
} from './invalidate';

describe('battery-health invalidation', () => {
  const orgId = 'org-a';
  const vehicleId = 'veh-1';
  const summaryKey = serializeBatteryHealthQueryKey(
    batteryHealthQueryKeys.summary(orgId, vehicleId),
  );
  const detailKey = serializeBatteryHealthQueryKey(
    batteryHealthQueryKeys.detail(orgId, vehicleId),
  );

  beforeEach(() => {
    resetBatteryHealthCache();
    resetBatteryHealthReloadHandlers();
    const now = Date.now();
    for (const key of [summaryKey, detailKey]) {
      setBatteryHealthCacheEntry(key, {
        data: { canonical: { id: key } },
        liveFetchedAt: now,
        healthFetchedAt: now,
      });
    }
  });

  it('matches vehicle + variant scopes', () => {
    expect(
      matchesBatteryHealthInvalidation(
        { orgId, vehicleId, reason: 'manual', scopes: ['summary'] },
        orgId,
        vehicleId,
        'summary',
      ),
    ).toBe(true);
    expect(
      matchesBatteryHealthInvalidation(
        { orgId, vehicleId, reason: 'manual', scopes: ['summary'] },
        orgId,
        vehicleId,
        'detail',
      ),
    ).toBe(false);
    expect(
      matchesBatteryHealthInvalidation(
        { orgId, vehicleId, reason: 'manual', scopes: ['health'] },
        orgId,
        vehicleId,
        'detail',
      ),
    ).toBe(true);
  });

  it('busts health timestamps and dispatches reload handlers', () => {
    const summaryReload = vi.fn();
    const detailReload = vi.fn();
    registerBatteryHealthReloadHandler(orgId, vehicleId, 'summary', summaryReload);
    registerBatteryHealthReloadHandler(orgId, vehicleId, 'detail', detailReload);

    invalidateBatteryHealthQueries({
      orgId,
      vehicleId,
      reason: 'publication-updated',
      scopes: ['detail'],
    });

    expect(getBatteryHealthCacheEntry(summaryKey)?.healthFetchedAt).toBeNull();
    expect(getBatteryHealthCacheEntry(detailKey)?.healthFetchedAt).toBeNull();
    expect(summaryReload).not.toHaveBeenCalled();
    expect(detailReload).toHaveBeenCalledTimes(1);
  });

  it('busts live timestamps for hv-session-completed invalidation', () => {
    invalidateBatteryHealthQueries({
      orgId,
      vehicleId,
      reason: 'hv-session-completed',
      scopes: ['live'],
    });

    expect(getBatteryHealthCacheEntry(summaryKey)?.liveFetchedAt).toBeNull();
    expect(getBatteryHealthCacheEntry(detailKey)?.liveFetchedAt).toBeNull();
    expect(getBatteryHealthCacheEntry(summaryKey)?.healthFetchedAt).not.toBeNull();
  });

  it('emits bus events for subscribers', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeBatteryHealthInvalidation(listener);

    invalidateBatteryHealthQueries({
      orgId,
      vehicleId,
      reason: 'evidence-added',
      scopes: ['health'],
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId,
        vehicleId,
        reason: 'evidence-added',
      }),
    );

    unsubscribe();
    window.dispatchEvent(
      new CustomEvent(BATTERY_HEALTH_INVALIDATE_EVENT, {
        detail: { orgId, vehicleId, reason: 'manual' },
      }),
    );
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

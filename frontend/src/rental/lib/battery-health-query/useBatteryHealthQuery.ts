import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type BatteryHealthDetail, type BatteryHealthSummary } from '../../../lib/api';
import {
  getBatteryHealthCacheEntry,
  setBatteryHealthCacheEntry,
} from './cache';
import { mapBatteryHealthQueryError, isBatteryHealthAbortError } from './errors';
import {
  BATTERY_LIVE_REFETCH_MS,
  isHealthStale,
  isLiveStale,
} from './freshness';
import {
  matchesBatteryHealthInvalidation,
  registerBatteryHealthReloadHandler,
  subscribeBatteryHealthInvalidation,
} from './invalidate';
import { batteryHealthQueryKeys, serializeBatteryHealthQueryKey } from './keys';
import { mergeBatteryLiveSlice } from './merge-live';

export type BatteryHealthQueryVariant = 'summary' | 'detail';

export interface BatteryHealthQueryResult<T> {
  data: T | null;
  canonical: T extends BatteryHealthSummary ? BatteryHealthSummary['canonical'] : BatteryHealthDetail['canonical'];
  loading: boolean;
  error: string | null;
  isLiveStale: boolean;
  isHealthStale: boolean;
  reload: (scope?: 'live' | 'health' | 'all') => Promise<void>;
  retry: () => Promise<void>;
  queryKey: readonly unknown[];
}

type BatteryHealthDataMap = {
  summary: BatteryHealthSummary;
  detail: BatteryHealthDetail;
};

async function fetchBatteryHealth<T extends BatteryHealthQueryVariant>(
  variant: T,
  vehicleId: string,
  signal: AbortSignal,
): Promise<BatteryHealthDataMap[T]> {
  if (variant === 'detail') {
    return api.vehicleIntelligence.batteryHealthDetail(vehicleId, { signal }) as Promise<
      BatteryHealthDataMap[T]
    >;
  }
  return api.vehicleIntelligence.batteryHealthSummary(vehicleId, { signal }) as Promise<
    BatteryHealthDataMap[T]
  >;
}

export function useBatteryHealthQuery<T extends BatteryHealthQueryVariant>(input: {
  orgId: string | null | undefined;
  vehicleId: string | null | undefined;
  variant: T;
  enabled?: boolean;
  /** Poll live telemetry slice only — does not reload full health model. */
  livePolling?: boolean;
}): BatteryHealthQueryResult<BatteryHealthDataMap[T]> {
  const { orgId, vehicleId, variant, enabled = true, livePolling = false } = input;
  const queryKey =
    orgId && vehicleId
      ? batteryHealthQueryKeys[variant](orgId, vehicleId)
      : (['battery-health', 'disabled'] as const);
  const cacheKey = serializeBatteryHealthQueryKey(queryKey);

  const cached = getBatteryHealthCacheEntry<BatteryHealthDataMap[T]>(cacheKey);
  const [data, setData] = useState<BatteryHealthDataMap[T] | null>(cached?.data ?? null);
  const [loading, setLoading] = useState(enabled && !cached?.data && !cached?.error);
  const [error, setError] = useState<string | null>(cached?.error ?? null);
  const [timestamps, setTimestamps] = useState({
    liveFetchedAt: cached?.liveFetchedAt ?? null,
    healthFetchedAt: cached?.healthFetchedAt ?? null,
  });

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);
  const dataRef = useRef(data);
  dataRef.current = data;

  const applyCacheEntry = useCallback(
    (entry: ReturnType<typeof getBatteryHealthCacheEntry<BatteryHealthDataMap[T]>>) => {
      if (!entry) return;
      setData(entry.data);
      setError(entry.error);
      setTimestamps({
        liveFetchedAt: entry.liveFetchedAt,
        healthFetchedAt: entry.healthFetchedAt,
      });
    },
    [],
  );

  const reload = useCallback(
    async (scope: 'live' | 'health' | 'all' = 'all') => {
      if (!enabled || !orgId || !vehicleId) {
        setLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const requestId = ++requestIdRef.current;
      const now = Date.now();

      if (!dataRef.current) {
        setLoading(true);
      }
      setError(null);

      try {
        const fresh = await fetchBatteryHealth(variant, vehicleId, controller.signal);
        if (requestId !== requestIdRef.current) return;

        let nextData: BatteryHealthDataMap[T];
        const previous = dataRef.current;
        const priorEntry = getBatteryHealthCacheEntry<BatteryHealthDataMap[T]>(cacheKey);

        if (scope === 'live' && previous) {
          nextData = mergeBatteryLiveSlice(previous, fresh);
        } else {
          nextData = fresh;
        }

        const entry = setBatteryHealthCacheEntry(cacheKey, {
          data: nextData,
          error: null,
          liveFetchedAt: now,
          healthFetchedAt:
            scope === 'live'
              ? (priorEntry?.healthFetchedAt ?? now)
              : now,
        });
        applyCacheEntry(entry);
      } catch (err) {
        if (isBatteryHealthAbortError(err) || requestId !== requestIdRef.current) return;
        const message = mapBatteryHealthQueryError(err);
        const now = Date.now();
        const priorEntry = getBatteryHealthCacheEntry<BatteryHealthDataMap[T]>(cacheKey);
        const entry = setBatteryHealthCacheEntry(cacheKey, {
          data: dataRef.current,
          error: message,
          healthFetchedAt: scope === 'live' ? (priorEntry?.healthFetchedAt ?? null) : now,
          liveFetchedAt:
            scope === 'live' ? now : (priorEntry?.liveFetchedAt ?? null),
        });
        applyCacheEntry(entry);
      } finally {
        if (requestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    },
    [applyCacheEntry, cacheKey, enabled, orgId, variant, vehicleId],
  );

  const retry = useCallback(async () => {
    await reload('all');
  }, [reload]);

  useEffect(() => {
    if (!enabled || !orgId || !vehicleId) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const entry = getBatteryHealthCacheEntry<BatteryHealthDataMap[T]>(cacheKey);
    if (entry) {
      applyCacheEntry(entry);
    }

    if (!entry?.data || isHealthStale({
      liveFetchedAt: entry?.liveFetchedAt ?? null,
      healthFetchedAt: entry?.healthFetchedAt ?? null,
    })) {
      void reload('health');
    }

    return () => {
      abortRef.current?.abort();
    };
  }, [applyCacheEntry, cacheKey, enabled, orgId, reload, vehicleId]);

  useEffect(() => {
    if (!livePolling || !enabled || !orgId || !vehicleId) return;

    const tick = () => {
      if (
        isLiveStale({
          liveFetchedAt: timestamps.liveFetchedAt,
          healthFetchedAt: timestamps.healthFetchedAt,
        })
      ) {
        void reload('live');
      }
    };

    const interval = window.setInterval(tick, BATTERY_LIVE_REFETCH_MS);
    return () => window.clearInterval(interval);
  }, [enabled, livePolling, orgId, reload, timestamps.healthFetchedAt, timestamps.liveFetchedAt, vehicleId]);

  useEffect(() => {
    if (!enabled || !orgId || !vehicleId) return;

    return registerBatteryHealthReloadHandler(orgId, vehicleId, variant, () => {
      void reload('health');
    });
  }, [enabled, orgId, reload, variant, vehicleId]);

  useEffect(() => {
    if (!enabled || !orgId || !vehicleId) return;

    return subscribeBatteryHealthInvalidation((detail) => {
      if (!matchesBatteryHealthInvalidation(detail, orgId, vehicleId, variant)) return;
      const bustLiveOnly = detail.scopes?.length === 1 && detail.scopes[0] === 'live';
      void reload(bustLiveOnly ? 'live' : 'health');
    });
  }, [enabled, orgId, reload, variant, vehicleId]);

  const isLiveStaleFlag = isLiveStale(timestamps);
  const isHealthStaleFlag = isHealthStale(timestamps);

  return {
    data,
    canonical: (data?.canonical ?? null) as BatteryHealthQueryResult<BatteryHealthDataMap[T]>['canonical'],
    loading,
    error,
    isLiveStale: isLiveStaleFlag,
    isHealthStale: isHealthStaleFlag,
    reload,
    retry,
    queryKey,
  };
}

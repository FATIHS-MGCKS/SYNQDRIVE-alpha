import { describe, expect, it } from 'vitest';
import {
  BATTERY_HEALTH_STALE_MS,
  BATTERY_LIVE_REFETCH_MS,
  isHealthStale,
  isLiveStale,
} from './freshness';

describe('battery-health freshness', () => {
  const now = 1_700_000_000_000;

  it('treats missing timestamps as stale', () => {
    expect(isLiveStale({ liveFetchedAt: null, healthFetchedAt: null }, now)).toBe(true);
    expect(isHealthStale({ liveFetchedAt: now, healthFetchedAt: null }, now)).toBe(true);
  });

  it('uses separate live vs health windows', () => {
    const timestamps = {
      liveFetchedAt: now - BATTERY_LIVE_REFETCH_MS,
      healthFetchedAt: now - BATTERY_HEALTH_STALE_MS,
    };

    expect(isLiveStale(timestamps, now)).toBe(true);
    expect(isHealthStale(timestamps, now)).toBe(true);

    const freshLive = {
      liveFetchedAt: now - BATTERY_LIVE_REFETCH_MS + 1,
      healthFetchedAt: now,
    };
    expect(isLiveStale(freshLive, now)).toBe(false);
    expect(isHealthStale(freshLive, now)).toBe(false);
  });

  it('keeps health fresh while live ages out', () => {
    const timestamps = {
      liveFetchedAt: now - BATTERY_LIVE_REFETCH_MS - 1,
      healthFetchedAt: now - 60_000,
    };

    expect(isLiveStale(timestamps, now)).toBe(true);
    expect(isHealthStale(timestamps, now)).toBe(false);
  });
});

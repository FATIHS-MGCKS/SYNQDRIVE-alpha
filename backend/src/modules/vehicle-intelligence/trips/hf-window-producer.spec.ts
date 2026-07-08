import type { HfSignalPoint } from '@modules/clickhouse/clickhouse-hf.types';
import {
  HF_WINDOW_SIZE_MS,
  buildHfWindowSummaries,
} from './hf-window-producer';

function point(
  over: Partial<HfSignalPoint> & Pick<HfSignalPoint, 'recordedAt' | 'signalName' | 'signalGroup'>,
): HfSignalPoint {
  return {
    orgId: 'org-1',
    vehicleId: 'veh-1',
    tokenId: 1,
    source: 'dimo',
    quality: 'normalized',
    tripId: 'trip-1',
    valueFloat: 50,
    unit: 'km/h',
    ...over,
  };
}

describe('buildHfWindowSummaries', () => {
  const ctx = {
    orgId: 'org-1',
    vehicleId: 'veh-1',
    tripId: 'trip-1',
    bookingId: 'book-1',
  };

  it('creates 60s windows with speed min/max/avg in stats_json', () => {
    const base = new Date('2026-06-25T10:00:00.000Z').getTime();
    const points: HfSignalPoint[] = [];
    for (let i = 0; i < 90; i++) {
      points.push(
        point({
          recordedAt: new Date(base + i * 1000),
          signalName: 'speed',
          signalGroup: 'speed',
          valueFloat: 40 + i,
        }),
      );
    }

    const windows = buildHfWindowSummaries(ctx, points);
    const speedWindows = windows.filter((w) => w.signalGroup === 'speed');
    expect(speedWindows.length).toBeGreaterThanOrEqual(2);
    expect(speedWindows[0]!.pointCount).toBeGreaterThan(0);
    expect(speedWindows[0]!.statsJson?.scalars?.speed?.min).toBe(40);
    expect(speedWindows[0]!.maxSpeedKmh).toBeGreaterThan(40);
    expect(speedWindows[0]!.tripId).toBe('trip-1');
    expect(speedWindows[0]!.bookingId).toBe('book-1');
    expect(speedWindows[0]!.windowEnd.getTime() - speedWindows[0]!.windowStart.getTime()).toBeLessThanOrEqual(
      HF_WINDOW_SIZE_MS,
    );
  });

  it('returns empty array when no points', () => {
    expect(buildHfWindowSummaries(ctx, [])).toEqual([]);
  });

  it('records gap indicators on speed windows', () => {
    const t0 = new Date('2026-06-25T10:00:00.000Z');
    const points = [
      point({ recordedAt: t0, signalName: 'speed', signalGroup: 'speed', valueFloat: 30 }),
      point({
        recordedAt: new Date(t0.getTime() + 5000),
        signalName: 'speed',
        signalGroup: 'speed',
        valueFloat: 35,
      }),
    ];
    const speedWindow = buildHfWindowSummaries(ctx, points).find(
      (w) => w.signalGroup === 'speed',
    );
    expect(speedWindow?.missingGapCount).toBe(1);
    expect(speedWindow?.largestGapMs).toBe(5000);
  });

  it('aggregates rpm/throttle when present in powertrain group', () => {
    const t = new Date('2026-06-25T10:00:00.000Z');
    const points = [
      point({
        recordedAt: t,
        signalName: 'powertrainCombustionEngineSpeed',
        signalGroup: 'powertrain',
        valueFloat: 2000,
        unit: 'rpm',
      }),
      point({
        recordedAt: t,
        signalName: 'obdThrottlePosition',
        signalGroup: 'powertrain',
        valueFloat: 45,
        unit: '%',
      }),
    ];
    const pw = buildHfWindowSummaries(ctx, points).find(
      (w) => w.signalGroup === 'powertrain',
    );
    expect(pw?.statsJson?.scalars?.rpm?.avg).toBe(2000);
    expect(pw?.statsJson?.scalars?.throttle?.avg).toBe(45);
  });

  it('repeated processing yields same window keys (idempotent dimensions)', () => {
    const t0 = new Date('2026-06-25T10:00:00.000Z');
    const points = Array.from({ length: 30 }, (_, i) =>
      point({
        recordedAt: new Date(t0.getTime() + i * 1000),
        signalName: 'speed',
        signalGroup: 'speed',
        valueFloat: 50,
      }),
    );
    const a = buildHfWindowSummaries(ctx, points);
    const b = buildHfWindowSummaries(ctx, points);
    const key = (w: (typeof a)[0]) =>
      `${w.windowStart.toISOString()}|${w.signalGroup}`;
    expect(a.map(key).sort()).toEqual(b.map(key).sort());
  });
});

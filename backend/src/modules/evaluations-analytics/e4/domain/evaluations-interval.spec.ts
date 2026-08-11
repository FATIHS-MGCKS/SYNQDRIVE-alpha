import {
  clipInterval,
  clipIntervals,
  countOverlappingPairs,
  mergeIntervals,
  subtractDurationMs,
  unionDurationMs,
} from './evaluations-interval';

const H = 60 * 60 * 1000;
const PERIOD_START = Date.UTC(2026, 0, 10, 0, 0, 0);
const PERIOD_END = Date.UTC(2026, 0, 20, 0, 0, 0);

describe('E4 interval algebra', () => {
  it('clips an interval that begins before and ends inside the period', () => {
    const clipped = clipInterval(
      { startMs: PERIOD_START - 5 * H, endExclusiveMs: PERIOD_START + 3 * H },
      PERIOD_START,
      PERIOD_END,
    );
    expect(clipped).toEqual({ startMs: PERIOD_START, endExclusiveMs: PERIOD_START + 3 * H });
  });

  it('clips an interval that begins inside and ends after the period', () => {
    const clipped = clipInterval(
      { startMs: PERIOD_END - 3 * H, endExclusiveMs: PERIOD_END + 5 * H },
      PERIOD_START,
      PERIOD_END,
    );
    expect(clipped).toEqual({ startMs: PERIOD_END - 3 * H, endExclusiveMs: PERIOD_END });
  });

  it('clips an interval that covers the whole period', () => {
    const clipped = clipInterval(
      { startMs: PERIOD_START - H, endExclusiveMs: PERIOD_END + H },
      PERIOD_START,
      PERIOD_END,
    );
    expect(clipped).toEqual({ startMs: PERIOD_START, endExclusiveMs: PERIOD_END });
  });

  it('drops intervals entirely outside the period', () => {
    expect(clipIntervals(
      [{ startMs: PERIOD_END + H, endExclusiveMs: PERIOD_END + 2 * H }],
      PERIOD_START,
      PERIOD_END,
    )).toEqual([]);
  });

  it('unions overlapping intervals without double counting', () => {
    const merged = mergeIntervals([
      { startMs: 0, endExclusiveMs: 10 },
      { startMs: 5, endExclusiveMs: 15 },
      { startMs: 20, endExclusiveMs: 25 },
    ]);
    expect(merged).toEqual([
      { startMs: 0, endExclusiveMs: 15 },
      { startMs: 20, endExclusiveMs: 25 },
    ]);
    expect(unionDurationMs([
      { startMs: 0, endExclusiveMs: 10 },
      { startMs: 5, endExclusiveMs: 15 },
    ])).toBe(15);
  });

  it('counts overlapping pairs as an anomaly signal without inflating duration', () => {
    const intervals = [
      { startMs: 0, endExclusiveMs: 10 },
      { startMs: 5, endExclusiveMs: 15 },
    ];
    expect(countOverlappingPairs(intervals)).toBe(1);
    expect(unionDurationMs(intervals)).toBe(15);
  });

  it('subtracts covered time (overlap-safe, never negative)', () => {
    expect(subtractDurationMs(
      [{ startMs: 0, endExclusiveMs: 100 }],
      [{ startMs: 10, endExclusiveMs: 30 }, { startMs: 20, endExclusiveMs: 40 }],
    )).toBe(70);
  });

  it('handles a 23-hour DST spring-forward day via real elapsed ms', () => {
    // Europe/Berlin 2026-03-29: local midnight to next local midnight = 23h.
    const start = Date.UTC(2026, 2, 28, 23, 0, 0); // 00:00 local (UTC+1)
    const end = Date.UTC(2026, 2, 29, 22, 0, 0); // next 00:00 local (UTC+2)
    expect(unionDurationMs([{ startMs: start, endExclusiveMs: end }])).toBe(23 * H);
  });

  it('handles a 25-hour DST fall-back day via real elapsed ms', () => {
    // Europe/Berlin 2026-10-25: local midnight to next local midnight = 25h.
    const start = Date.UTC(2026, 9, 24, 22, 0, 0); // 00:00 local (UTC+2)
    const end = Date.UTC(2026, 9, 25, 23, 0, 0); // next 00:00 local (UTC+1)
    expect(unionDurationMs([{ startMs: start, endExclusiveMs: end }])).toBe(25 * H);
  });
});

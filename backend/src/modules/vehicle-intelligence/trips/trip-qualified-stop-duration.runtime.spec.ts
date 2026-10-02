import { CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS } from './trip-qualified-stop-duration.policy';
import { checkTripQuality } from './trip-evidence.helpers';
import { findLargestQualifyingMidGapFromCoreTimeline } from './trip-mid-gap-split.util';

const max = CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS;
const t0 = new Date('2026-09-06T12:00:00.000Z');

function liveResult(gapMs: number): 'SAME' | 'SPLIT' {
  const candidate = findLargestQualifyingMidGapFromCoreTimeline({
    timeline: [
      { ts: new Date(t0.getTime()), speed: 0 },
      { ts: new Date(t0.getTime() + gapMs), speed: 12 },
    ],
    maxSameTripQualifiedStopMs: max,
  });
  return candidate ? 'SPLIT' : 'SAME';
}

function mergeResult(gapMs: number): 'SAME' | 'SEPARATE' {
  const prevEnd = new Date(t0.getTime());
  const nextStart = new Date(t0.getTime() + gapMs);
  const q = checkTripQuality(120_000, 5, 3, prevEnd, nextStart, undefined, max);
  return q.shouldMergeWithPrevious ? 'SAME' : 'SEPARATE';
}

describe('Qualified Stop Contract V1 — runtime paths', () => {
  it.each([
    [299_999, 'SAME'],
    [300_000, 'SAME'],
    [300_001, 'SPLIT'],
  ] as const)('LIVE mid-gap gapMs=%i → %s', (gapMs, expected) => {
    expect(liveResult(gapMs)).toBe(expected);
  });

  it.each([
    [299_999, 'SAME'],
    [300_000, 'SAME'],
    [300_001, 'SEPARATE'],
  ] as const)('small_gap_merge gapMs=%i → %s', (gapMs, expected) => {
    expect(mergeResult(gapMs)).toBe(expected);
  });

  it('217s qualified stop remains same trip on live path (KS FH 660E 2026-09-23)', () => {
    expect(liveResult(217_000)).toBe('SAME');
  });

  it('349586ms qualified stop splits on live path (KS FH 660E 2026-09-24)', () => {
    expect(liveResult(349_586)).toBe('SPLIT');
  });

  it('6-minute gap with moving before-segment does not split (traffic idle control)', () => {
    const candidate = findLargestQualifyingMidGapFromCoreTimeline({
      timeline: [
        { ts: new Date(t0.getTime()), speed: 25 },
        { ts: new Date(t0.getTime() + 360_000), speed: 20 },
      ],
      maxSameTripQualifiedStopMs: max,
    });
    expect(candidate).toBeNull();
  });

  it('6-minute gap without resumed motion does not split (no motion after pause)', () => {
    const candidate = findLargestQualifyingMidGapFromCoreTimeline({
      timeline: [
        { ts: new Date(t0.getTime()), speed: 0 },
        { ts: new Date(t0.getTime() + 360_000), speed: 0 },
      ],
      maxSameTripQualifiedStopMs: max,
    });
    expect(candidate).toBeNull();
  });
});

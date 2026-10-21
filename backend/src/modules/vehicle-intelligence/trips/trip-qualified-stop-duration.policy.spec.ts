import {
  CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS,
  classifyQualifiedStopDurationPolicy,
  isSameTripQualifiedStop,
  shouldMergePreviousTripQualifiedGap,
  shouldSplitQualifiedStop,
} from './trip-qualified-stop-duration.policy';

describe('trip-qualified-stop-duration.policy (Qualified Stop Contract V1)', () => {
  const max = CANONICAL_MAX_SAME_TRIP_QUALIFIED_STOP_MS;

  it.each([
    [0, 'SAME_TRIP'],
    [299_999, 'SAME_TRIP'],
    [300_000, 'SAME_TRIP'],
    [300_001, 'SPLIT'],
    [360_000, 'SPLIT'],
  ] as const)('pure policy duration=%i → %s', (durationMs, expected) => {
    expect(classifyQualifiedStopDurationPolicy(durationMs, max)).toBe(expected);
    expect(isSameTripQualifiedStop(durationMs, max)).toBe(expected === 'SAME_TRIP');
    expect(shouldSplitQualifiedStop(durationMs, max)).toBe(expected === 'SPLIT');
  });

  it('merge/reopen uses the same LTE comparator as live split', () => {
    expect(shouldMergePreviousTripQualifiedGap(299_999, max)).toBe(true);
    expect(shouldMergePreviousTripQualifiedGap(300_000, max)).toBe(true);
    expect(shouldMergePreviousTripQualifiedGap(300_001, max)).toBe(false);
  });

  it('KS FH 660E Tesla production controls', () => {
    expect(shouldSplitQualifiedStop(217_000, max)).toBe(false);
    expect(shouldSplitQualifiedStop(349_586, max)).toBe(true);
  });
});

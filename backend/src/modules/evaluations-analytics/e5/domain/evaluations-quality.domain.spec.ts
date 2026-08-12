import {
  resolveFreshnessState,
  buildSourceFreshness,
  completenessState,
  freshnessDimensionState,
  validityState,
  weakestDimension,
  rollupQualityStatus,
} from './evaluations-quality.domain';

const DAY = 24 * 60 * 60 * 1000;
const THRESHOLD = 3 * DAY;

describe('E5 freshness state', () => {
  const evaluatedAtMs = Date.parse('2026-02-15T00:00:00.000Z');
  const currentPeriodEnd = Date.parse('2026-03-01T00:00:00.000Z'); // future → current
  const historicalPeriodEnd = Date.parse('2026-02-01T00:00:00.000Z'); // past → historical

  it('is FRESH for a current period when the newest source is within threshold', () => {
    expect(
      resolveFreshnessState({
        newestSourceAtMs: evaluatedAtMs - DAY,
        evaluatedAtMs,
        periodEndExclusiveMs: currentPeriodEnd,
        isCurrentPeriod: true,
        thresholdMs: THRESHOLD,
      }),
    ).toBe('FRESH');
  });

  it('is STALE for a current period when the newest source is older than threshold', () => {
    expect(
      resolveFreshnessState({
        newestSourceAtMs: evaluatedAtMs - 10 * DAY,
        evaluatedAtMs,
        periodEndExclusiveMs: currentPeriodEnd,
        isCurrentPeriod: true,
        thresholdMs: THRESHOLD,
      }),
    ).toBe('STALE');
  });

  it('measures a historical period against the period end, not "now" (no current-state-as-historical)', () => {
    // Newest source is at the end of a historical period; evaluatedAt is much
    // later. Against "now" it would look STALE, but the correct reference is the
    // period end → FRESH.
    expect(
      resolveFreshnessState({
        newestSourceAtMs: historicalPeriodEnd - DAY,
        evaluatedAtMs,
        periodEndExclusiveMs: historicalPeriodEnd,
        isCurrentPeriod: false,
        thresholdMs: THRESHOLD,
      }),
    ).toBe('FRESH');
  });

  it('is UNKNOWN when there is no source timestamp', () => {
    expect(
      resolveFreshnessState({
        newestSourceAtMs: null,
        evaluatedAtMs,
        periodEndExclusiveMs: currentPeriodEnd,
        isCurrentPeriod: true,
        thresholdMs: THRESHOLD,
      }),
    ).toBe('UNKNOWN');
  });

  it('builds an E1 EvaluationsSourceFreshness with lastSuccessfulImportAt null', () => {
    const fresh = buildSourceFreshness({
      newestSourceAtMs: evaluatedAtMs - DAY,
      oldestSourceAtMs: evaluatedAtMs - 20 * DAY,
      evaluatedAt: new Date(evaluatedAtMs),
      periodEndExclusiveMs: currentPeriodEnd,
      isCurrentPeriod: true,
      thresholdMs: THRESHOLD,
    });
    expect(fresh.state).toBe('FRESH');
    expect(fresh.lastSuccessfulImportAt).toBeNull();
    expect(fresh.evaluatedAt).toBe(new Date(evaluatedAtMs).toISOString());
  });
});

describe('E5 completeness (preserves E4 limitations, no false full coverage)', () => {
  it('is COMPLETE only when ratio=1 and no missing sources', () => {
    expect(
      completenessState('AVAILABLE', {
        expectedRecords: 3,
        availableRecords: 3,
        excludedRecords: 0,
        ratio: 1,
        missingSources: [],
      }),
    ).toBe('COMPLETE');
  });

  it('is PARTIAL when there are missing sources even if ratio=1', () => {
    expect(
      completenessState('PARTIAL', {
        expectedRecords: 3,
        availableRecords: 3,
        excludedRecords: 0,
        ratio: 1,
        missingSources: ['VEHICLE_ELIGIBILITY_HISTORY'],
      }),
    ).toBe('PARTIAL');
  });

  it('is PARTIAL when coverage ratio < 1', () => {
    expect(
      completenessState('PARTIAL', {
        expectedRecords: 4,
        availableRecords: 2,
        excludedRecords: 2,
        ratio: 0.5,
        missingSources: [],
      }),
    ).toBe('PARTIAL');
  });

  it('is UNAVAILABLE for UNAVAILABLE/ERROR sections (never fabricated complete)', () => {
    expect(completenessState('UNAVAILABLE', null)).toBe('UNAVAILABLE');
    expect(completenessState('ERROR', null)).toBe('UNAVAILABLE');
  });
});

describe('E5 dimension helpers + aggregation', () => {
  it('maps freshness state to a dimension state', () => {
    expect(freshnessDimensionState('FRESH')).toBe('COMPLETE');
    expect(freshnessDimensionState('STALE')).toBe('PARTIAL');
    expect(freshnessDimensionState('UNKNOWN')).toBe('UNKNOWN');
    expect(freshnessDimensionState(null)).toBe('UNKNOWN');
  });

  it('validity is UNAVAILABLE only for ERROR', () => {
    expect(validityState('AVAILABLE')).toBe('COMPLETE');
    expect(validityState('PARTIAL')).toBe('COMPLETE');
    expect(validityState('ERROR')).toBe('UNAVAILABLE');
  });

  it('weakest dimension wins (conservative)', () => {
    expect(weakestDimension(['COMPLETE', 'PARTIAL', 'COMPLETE'])).toBe('PARTIAL');
    expect(weakestDimension(['COMPLETE', 'UNKNOWN'])).toBe('UNKNOWN');
    expect(weakestDimension(['PARTIAL', 'UNAVAILABLE'])).toBe('UNAVAILABLE');
    expect(weakestDimension(['COMPLETE', 'COMPLETE'])).toBe('COMPLETE');
  });

  it('rolls up status conservatively without upgrading', () => {
    expect(rollupQualityStatus(['AVAILABLE', 'AVAILABLE'])).toBe('AVAILABLE');
    expect(rollupQualityStatus(['AVAILABLE', 'UNAVAILABLE'])).toBe('PARTIAL');
    expect(rollupQualityStatus(['UNAVAILABLE', 'UNAVAILABLE'])).toBe('UNAVAILABLE');
    expect(rollupQualityStatus(['PARTIAL', 'AVAILABLE'])).toBe('AVAILABLE');
  });
});

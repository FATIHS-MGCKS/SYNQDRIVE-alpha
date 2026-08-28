import {
  assessCoverage,
  computeCoverage,
  isSuppressingVerdict,
  MAX_IGNORABLE_UNCOVERED_SPAN_SECONDS,
  MIN_REPAIR_SPAN_SECONDS,
  SUBSTANTIAL_COVERAGE_RATIO,
  subtractSpans,
  unionSpans,
  type CanonicalTripInterval,
} from './trip-coverage.util';

/**
 * PR A — containment-aware coverage regression matrix.
 *
 * Scenarios mirror the shapes measured in the 90-day production replay
 * (architecture/TRIP_DETECTION_HARDENING_DESIGN_2026-08-28.md). Each case
 * fixes a behaviour that binary overlap got wrong.
 */

const T0 = Date.parse('2026-08-01T08:00:00.000Z');
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

const trip = (
  id: string,
  startMin: number,
  endMin: number | null,
  tripStatus = 'COMPLETED',
): CanonicalTripInterval => ({
  id,
  startTime: at(startMin),
  endTime: endMin == null ? null : at(endMin),
  tripStatus,
});

describe('interval algebra', () => {
  it('unions touching and overlapping spans', () => {
    expect(unionSpans([{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 5, end: 7 }])).toEqual([
      { start: 0, end: 20 },
    ]);
  });

  it('subtracts covers from bounds', () => {
    expect(subtractSpans({ start: 0, end: 100 }, [{ start: 20, end: 30 }, { start: 60, end: 70 }])).toEqual([
      { start: 0, end: 20 },
      { start: 30, end: 60 },
      { start: 70, end: 100 },
    ]);
  });
});

describe('coverage metrics', () => {
  it('does not credit trip duration outside the proposal', () => {
    // A 10-minute proposal with a 60-minute trip that only overlaps its last
    // 2 minutes is 2 minutes covered, not 60.
    const metrics = computeCoverage(at(0), at(10), [trip('t1', -50, 2)]);

    expect(metrics.proposalDurationSeconds).toBe(600);
    expect(metrics.coveredSeconds).toBe(120);
    expect(metrics.coverageRatio).toBeCloseTo(0.2, 5);
    expect(metrics.missingSeconds).toBe(480);
    expect(metrics.suffixMissingSeconds).toBe(480);
  });

  it('separates prefix, interior and suffix missing time', () => {
    const metrics = computeCoverage(at(0), at(60), [trip('t1', 10, 20), trip('t2', 30, 40)]);

    expect(metrics.prefixMissingSeconds).toBe(600);
    expect(metrics.interiorMissingSeconds).toBe(600);
    expect(metrics.suffixMissingSeconds).toBe(1200);
    expect(metrics.longestUncoveredSpanSeconds).toBe(1200);
    expect(metrics.coveringTripCount).toBe(2);
  });
});

describe('coverage verdicts', () => {
  it('1. exact duplicate drive is FULLY_COVERED', () => {
    const result = assessCoverage(at(0), at(30), [trip('t1', 0, 30)]);

    expect(result.verdict).toBe('FULLY_COVERED');
    expect(result.metrics.coverageRatio).toBe(1);
    expect(isSuppressingVerdict(result.verdict)).toBe(true);
  });

  it('2. drive covered by two adjacent trips is FULLY_COVERED', () => {
    const result = assessCoverage(at(0), at(30), [trip('t1', 0, 15), trip('t2', 15, 30)]);

    expect(result.verdict).toBe('FULLY_COVERED');
    expect(result.repairableSpans).toHaveLength(0);
  });

  it('3. 98-minute drive containing two short inner trips is not a duplicate', () => {
    // The replay case: 29 minutes canonical inside a 98-minute drive.
    const result = assessCoverage(at(0), at(98), [trip('t1', 5, 19), trip('t2', 60, 75)]);

    expect(result.verdict).toBe('PARTIALLY_COVERED');
    expect(result.metrics.coverageRatio).toBeCloseTo(29 / 98, 3);
    expect(isSuppressingVerdict(result.verdict)).toBe(false);
    expect(result.repairableSpans).toHaveLength(3);
  });

  it('4. 107-minute drive with one short trip inside stays repairable', () => {
    const result = assessCoverage(at(0), at(107), [trip('t1', 50, 58)]);

    expect(result.verdict).toBe('PARTIALLY_COVERED');
    expect(result.metrics.longestUncoveredSpanSeconds).toBe(50 * 60);
  });

  it('5. prefix truncation is detected', () => {
    const result = assessCoverage(at(0), at(60), [trip('t1', 22, 60)]);

    expect(result.verdict).toBe('PARTIALLY_COVERED');
    expect(result.metrics.prefixMissingSeconds).toBe(22 * 60);
    expect(result.metrics.suffixMissingSeconds).toBe(0);
    expect(result.repairableSpans).toEqual([{ start: at(0), end: at(22) }]);
  });

  it('6. suffix truncation is detected', () => {
    const result = assessCoverage(at(0), at(60), [trip('t1', 0, 38)]);

    expect(result.verdict).toBe('PARTIALLY_COVERED');
    expect(result.metrics.suffixMissingSeconds).toBe(22 * 60);
    expect(result.repairableSpans).toEqual([{ start: at(38), end: at(60) }]);
  });

  it('7. interior gap is detected', () => {
    const result = assessCoverage(at(0), at(60), [trip('t1', 0, 20), trip('t2', 40, 60)]);

    expect(result.verdict).toBe('PARTIALLY_COVERED');
    expect(result.metrics.interiorMissingSeconds).toBe(20 * 60);
    expect(result.metrics.prefixMissingSeconds).toBe(0);
    expect(result.repairableSpans).toEqual([{ start: at(20), end: at(40) }]);
  });

  it('8. multiple gaps each become their own repairable span', () => {
    const result = assessCoverage(at(0), at(120), [
      trip('t1', 10, 20),
      trip('t2', 40, 50),
      trip('t3', 80, 90),
    ]);

    expect(result.repairableSpans).toEqual([
      { start: at(0), end: at(10) },
      { start: at(20), end: at(40) },
      { start: at(50), end: at(80) },
      { start: at(90), end: at(120) },
    ]);
  });

  it('9. an adjacent trip inside the tolerance window is not coverage', () => {
    // Trip ends 3 minutes before the drive starts: legacy overlap suppressed
    // this because it fell inside the ±5 minute tolerance.
    const result = assessCoverage(at(0), at(45), [trip('t1', -30, -3)]);

    expect(result.verdict).toBe('NOT_COVERED');
    expect(result.metrics.coveredSeconds).toBe(0);
    expect(isSuppressingVerdict(result.verdict)).toBe(false);
    expect(result.repairableSpans).toEqual([{ start: at(0), end: at(45) }]);
  });

  it('10. a trip starting far outside the tolerance contributes only its overlap', () => {
    // Two hours of trip, but only 43 minutes of it fall inside the proposal.
    const wellCovered = assessCoverage(at(0), at(45), [trip('t1', -120, 43)]);
    expect(wellCovered.metrics.coveredSeconds).toBe(43 * 60);
    expect(wellCovered.verdict).toBe('SUBSTANTIALLY_COVERED');

    // The same long trip stopping earlier leaves a 5-minute hole, which is a
    // gap rather than coverage noise, whatever the trip's own duration.
    const truncated = assessCoverage(at(0), at(45), [trip('t1', -120, 40)]);
    expect(truncated.metrics.coveredSeconds).toBe(40 * 60);
    expect(truncated.verdict).toBe('PARTIALLY_COVERED');
  });

  it('11. a CANCELLED trip never counts as coverage', () => {
    const result = assessCoverage(at(0), at(45), [trip('t1', 0, 45, 'CANCELLED')]);

    expect(result.verdict).toBe('NOT_COVERED');
    expect(result.metrics.coveredSeconds).toBe(0);
    expect(result.intersectingTripIds).toContain('t1');
  });

  it('12. an intersecting ONGOING trip is AMBIGUOUS, never a guess', () => {
    const result = assessCoverage(at(0), at(45), [trip('t1', 10, null, 'ONGOING')]);

    expect(result.verdict).toBe('AMBIGUOUS');
    expect(result.ambiguousReason).toBe('ONGOING_TRIP_INTERSECTS');
    expect(result.repairableSpans).toHaveLength(0);
    expect(isSuppressingVerdict(result.verdict)).toBe(true);
  });

  it('12b. a truncated canonical set is AMBIGUOUS rather than mis-measured', () => {
    const result = assessCoverage(at(0), at(45), [trip('t1', 0, 45)], {
      canonicalSetTruncated: true,
    });

    expect(result.verdict).toBe('AMBIGUOUS');
    expect(result.ambiguousReason).toBe('CANONICAL_SET_TRUNCATED');
  });

  it('15. an empty canonical set is NOT_COVERED', () => {
    const result = assessCoverage(at(0), at(45), []);

    expect(result.verdict).toBe('NOT_COVERED');
    expect(result.metrics.coverageRatio).toBe(0);
    expect(result.repairableSpans).toEqual([{ start: at(0), end: at(45) }]);
  });

  it('16. a single complete canonical match suppresses', () => {
    const result = assessCoverage(at(0), at(45), [trip('t1', -1, 46)]);

    expect(result.verdict).toBe('FULLY_COVERED');
    expect(result.metrics.coverageRatio).toBe(1);
  });
});

describe('suppression thresholds', () => {
  it('treats sub-minute missing time as noise', () => {
    const result = assessCoverage(at(0), at(60), [trip('t1', 0, 59.5)]);

    expect(result.metrics.missingSeconds).toBe(30);
    expect(result.verdict).toBe('FULLY_COVERED');
  });

  it(`suppresses at ratio >= ${SUBSTANTIAL_COVERAGE_RATIO} only when no span reaches ${MAX_IGNORABLE_UNCOVERED_SPAN_SECONDS}s`, () => {
    // 96% covered, worst uncovered span 2 minutes → coverage noise.
    const noisy = assessCoverage(at(0), at(50), [trip('t1', 0, 24), trip('t2', 26, 50)]);
    expect(noisy.metrics.coverageRatio).toBeCloseTo(0.96, 2);
    expect(noisy.verdict).toBe('SUBSTANTIALLY_COVERED');

    // Same ratio band, but the hole is 4 minutes — long enough that the live
    // path would call it a trip boundary, so it cannot be dismissed.
    const real = assessCoverage(at(0), at(100), [trip('t1', 0, 48), trip('t2', 52, 100)]);
    expect(real.metrics.coverageRatio).toBeCloseTo(0.96, 2);
    expect(real.verdict).toBe('PARTIALLY_COVERED');
  });

  it(`only proposes uncovered spans of at least ${MIN_REPAIR_SPAN_SECONDS}s`, () => {
    const result = assessCoverage(at(0), at(60), [
      trip('t1', 0, 20),
      trip('t2', 24, 40),
      trip('t3', 41, 60),
    ]);

    expect(result.verdict).toBe('PARTIALLY_COVERED');
    // 4-minute and 1-minute holes are recorded but not proposed as repairs.
    expect(result.metrics.uncoveredSpans).toHaveLength(2);
    expect(result.repairableSpans).toHaveLength(0);
  });

  it('a short trip fully inside a long drive can never suppress it', () => {
    for (const driveMinutes of [30, 60, 98, 107, 180]) {
      const result = assessCoverage(at(0), at(driveMinutes), [trip('t1', 5, 10)]);
      expect(isSuppressingVerdict(result.verdict)).toBe(false);
    }
  });

  it('is strictly more permissive than binary overlap: coverage never suppresses what overlap accepted', () => {
    // Binary overlap accepts only when no trip intersects the ±5min window, in
    // which case coverage is zero and the verdict is NOT_COVERED.
    const noIntersection = assessCoverage(at(0), at(45), [trip('t1', -600, -400)]);
    expect(noIntersection.verdict).toBe('NOT_COVERED');
    expect(isSuppressingVerdict(noIntersection.verdict)).toBe(false);
  });

  it('returns an entirely uncovered proposal whole, however short', () => {
    // RPM sentinel 5e46a6de is a 4min58s drive with no canonical coverage.
    // Binary overlap proposes it; applying the carved-fragment floor here would
    // make coverage the stricter of the two, which the rework forbids.
    const sentinel = assessCoverage(at(0), new Date(T0 + 298_000), []);

    expect(sentinel.metrics.proposalDurationSeconds).toBeLessThan(MIN_REPAIR_SPAN_SECONDS);
    expect(sentinel.verdict).toBe('NOT_COVERED');
    expect(sentinel.repairableSpans).toEqual([{ start: at(0), end: new Date(T0 + 298_000) }]);
  });

  it('applies the fragment floor only to spans carved out of real coverage', () => {
    // Identical 4-minute hole, two situations. Carved out of a covered
    // proposal it is a fragment; standing alone it is the whole drive.
    const carved = assessCoverage(at(0), at(60), [trip('t1', 0, 28), trip('t2', 32, 60)]);
    expect(carved.metrics.uncoveredSpans).toHaveLength(1);
    expect(carved.repairableSpans).toHaveLength(0);

    const standalone = assessCoverage(at(0), at(4), []);
    expect(standalone.repairableSpans).toEqual([{ start: at(0), end: at(4) }]);
  });
});

import {
  detectStrengths,
  detectWeaknesses,
  reconcileDetections,
  type E4DetectionSignals,
} from './evaluations-detection.domain';

function signals(overrides: Partial<E4DetectionSignals>): E4DetectionSignals {
  return {
    utilization: null,
    finance: null,
    bookings: null,
    ...overrides,
  };
}

describe('E4 strength detection', () => {
  it('emits HIGH_UTILIZATION when the org target is exceeded with sufficient evidence', () => {
    const strengths = detectStrengths(
      signals({ utilization: { ratio: 0.82, previousRatio: 0.7, eligibleVehicles: 5, coverageRatio: 1 } }),
    );
    expect(strengths.map((s) => s.ruleId)).toContain('HIGH_UTILIZATION');
    expect(strengths[0].evidenceKind).toBe('OBSERVATION');
  });

  it('emits REVENUE_GROWTH on a previous-period improvement', () => {
    const strengths = detectStrengths(
      signals({ finance: { marginPercent: 20, revenueMinor: 12000, previousRevenueMinor: 10000 } }),
    );
    expect(strengths.map((s) => s.ruleId)).toContain('REVENUE_GROWTH');
  });

  it('does not emit a strength when evidence is insufficient (too few vehicles / low coverage)', () => {
    expect(
      detectStrengths(signals({ utilization: { ratio: 0.95, previousRatio: null, eligibleVehicles: 1, coverageRatio: 1 } })),
    ).toEqual([]);
    expect(
      detectStrengths(signals({ utilization: { ratio: 0.95, previousRatio: null, eligibleVehicles: 5, coverageRatio: 0.5 } })),
    ).toEqual([]);
  });

  it('does not emit REVENUE_GROWTH without a valid comparator baseline', () => {
    expect(
      detectStrengths(signals({ finance: { marginPercent: 20, revenueMinor: 12000, previousRevenueMinor: 0 } })),
    ).toEqual([]);
  });

  it('is deterministically ordered by ruleId', () => {
    const strengths = detectStrengths(
      signals({
        utilization: { ratio: 0.9, previousRatio: 0.7, eligibleVehicles: 5, coverageRatio: 1 },
        finance: { marginPercent: 20, revenueMinor: 12000, previousRevenueMinor: 10000 },
        bookings: { cancelledPlusNoShow: 0, totalOutcomes: 50 },
      }),
    );
    const ids = strengths.map((s) => s.ruleId);
    expect(ids).toEqual([...ids].sort());
  });
});

describe('E4 weakness detection', () => {
  it('emits UNDERUTILIZATION with severity from the gap', () => {
    const weaknesses = detectWeaknesses(
      signals({ utilization: { ratio: 0.1, previousRatio: 0.4, eligibleVehicles: 5, coverageRatio: 1 } }),
    );
    expect(weaknesses[0].ruleId).toBe('UNDERUTILIZATION');
    expect(weaknesses[0].severity).toBe('CRITICAL');
  });

  it('emits DECLINING_REVENUE and LOW_MARGIN and orders by severity', () => {
    const weaknesses = detectWeaknesses(
      signals({ finance: { marginPercent: 2, revenueMinor: 8000, previousRevenueMinor: 10000 } }),
    );
    const ids = weaknesses.map((w) => w.ruleId);
    expect(ids).toContain('DECLINING_REVENUE');
    expect(ids).toContain('LOW_MARGIN');
  });

  it('never emits a weakness from missing/unavailable data', () => {
    expect(detectWeaknesses(signals({ utilization: null, finance: null, bookings: null }))).toEqual([]);
    // Zero revenue caused by an unavailable baseline must not become DECLINING_REVENUE.
    expect(
      detectWeaknesses(signals({ finance: { marginPercent: null, revenueMinor: 0, previousRevenueMinor: null } })),
    ).toEqual([]);
  });

  it('does not emit from a tiny booking sample', () => {
    expect(
      detectWeaknesses(signals({ bookings: { cancelledPlusNoShow: 2, totalOutcomes: 3 } })),
    ).toEqual([]);
  });
});

describe('E4 strength/weakness reconciliation', () => {
  it('finds no contradiction because thresholds are disjoint', () => {
    const strengths = detectStrengths(
      signals({ utilization: { ratio: 0.82, previousRatio: null, eligibleVehicles: 5, coverageRatio: 1 } }),
    );
    const weaknesses = detectWeaknesses(
      signals({ utilization: { ratio: 0.82, previousRatio: null, eligibleVehicles: 5, coverageRatio: 1 } }),
    );
    const reconciled = reconcileDetections(strengths, weaknesses);
    expect(reconciled.contradictionCount).toBe(0);
    expect(reconciled.duplicateCount).toBe(0);
  });

  it('suppresses duplicate ids deterministically', () => {
    const strengths = detectStrengths(
      signals({ utilization: { ratio: 0.82, previousRatio: null, eligibleVehicles: 5, coverageRatio: 1 } }),
    );
    const reconciled = reconcileDetections([...strengths, ...strengths], []);
    expect(reconciled.strengths).toHaveLength(strengths.length);
    expect(reconciled.duplicateCount).toBe(strengths.length);
  });
});

import {
  allocateTripDistancesToOdometerBudget,
  assessBrakeCoverageGap,
  computeGapConfidenceAdjustment,
  computeRemainingKmSpreadMultiplier,
  normalizeModelingSource,
} from './brake-coverage-gap.domain';

describe('assessBrakeCoverageGap', () => {
  it('reports full coverage when observed distance matches odometer', () => {
    const r = assessBrakeCoverageGap({
      distanceSinceAnchorKm: 1000,
      observedDistanceKm: 1000,
      observedTripCount: 12,
    });
    expect(r.coverageStatus).toBe('FULL');
    expect(r.modelingSource).toBe('OBSERVED');
    expect(r.underCoverageKm).toBe(0);
    expect(r.overCoverageKm).toBe(0);
    expect(r.coverageRatioRaw).toBe(1);
    expect(r.reconciliationRequired).toBe(false);
  });

  it('reports partial coverage at 70%', () => {
    const r = assessBrakeCoverageGap({
      distanceSinceAnchorKm: 1000,
      observedDistanceKm: 700,
      observedTripCount: 5,
    });
    expect(r.coverageStatus).toBe('PARTIAL');
    expect(r.modelingSource).toBe('MIXED_OBSERVED_NEUTRAL_GAP');
    expect(r.underCoverageKm).toBe(300);
    expect(r.coverageRatioRaw).toBeCloseTo(0.7);
    expect(r.gapShare).toBeCloseTo(0.3);
  });

  it('reports zero coverage when no trips but distance known', () => {
    const r = assessBrakeCoverageGap({
      distanceSinceAnchorKm: 500,
      observedDistanceKm: 0,
      observedTripCount: 0,
    });
    expect(r.coverageStatus).toBe('ZERO');
    expect(r.modelingSource).toBe('NEUTRAL_GAP_ONLY');
    expect(r.underCoverageKm).toBe(500);
    expect(r.coverageRatioRaw).toBe(0);
    expect(r.gapShare).toBe(1);
  });

  it('reports overcoverage without hiding excess km', () => {
    const r = assessBrakeCoverageGap({
      distanceSinceAnchorKm: 800,
      observedDistanceKm: 800,
      observedTripCount: 4,
      rawTripDistanceKm: 950,
    });
    expect(r.coverageStatus).toBe('OVER');
    expect(r.modelingSource).toBe('INCONSISTENT');
    expect(r.overCoverageKm).toBe(150);
    expect(r.underCoverageKm).toBe(0);
    expect(r.coverageRatioRaw).toBeCloseTo(950 / 800, 4);
    expect(r.reconciliationRequired).toBe(true);
  });

  it('returns NOT_ENOUGH_DATA when odometer distance is unknown', () => {
    const r = assessBrakeCoverageGap({
      distanceSinceAnchorKm: null,
      observedDistanceKm: 120,
      observedTripCount: 2,
    });
    expect(r.coverageStatus).toBe('UNKNOWN');
    expect(r.modelingSource).toBe('NOT_ENOUGH_DATA');
    expect(r.coverageRatioRaw).toBeNull();
  });
});

describe('allocateTripDistancesToOdometerBudget', () => {
  it('caps chronological trips to odometer budget on distance conflict', () => {
    const trips = [{ id: 'a', km: 500 }, { id: 'b', km: 400 }, { id: 'c', km: 300 }];
    const { allocations, observedDistanceKm, overCoverageKm } =
      allocateTripDistancesToOdometerBudget(trips, (t) => t.km, 800);
    expect(observedDistanceKm).toBe(800);
    expect(overCoverageKm).toBe(400);
    expect(allocations[0].allocatedKm).toBe(500);
    expect(allocations[1].allocatedKm).toBe(300);
    expect(allocations[2].allocatedKm).toBe(0);
  });
});

describe('confidence and remaining-km spread', () => {
  it('penalizes large neutral gaps and overcoverage', () => {
    const mixed = assessBrakeCoverageGap({
      distanceSinceAnchorKm: 1000,
      observedDistanceKm: 200,
      observedTripCount: 2,
    });
    const over = assessBrakeCoverageGap({
      distanceSinceAnchorKm: 800,
      observedDistanceKm: 1000,
      observedTripCount: 3,
    });
    expect(computeGapConfidenceAdjustment(mixed)).toBeLessThan(0);
    expect(computeGapConfidenceAdjustment(over)).toBeLessThan(0);
    expect(computeGapConfidenceAdjustment(over)).toBeLessThan(
      computeGapConfidenceAdjustment(
        assessBrakeCoverageGap({
          distanceSinceAnchorKm: 1000,
          observedDistanceKm: 1000,
          observedTripCount: 10,
        }),
      ),
    );
    expect(computeRemainingKmSpreadMultiplier(mixed.gapShare, mixed.modelingSource, mixed.coverageStatus)).toBeGreaterThan(1.5);
  });

  it('does not assign high spread for fully observed coverage', () => {
    const full = assessBrakeCoverageGap({
      distanceSinceAnchorKm: 2000,
      observedDistanceKm: 2000,
      observedTripCount: 10,
    });
    expect(computeRemainingKmSpreadMultiplier(full.gapShare, full.modelingSource, full.coverageStatus)).toBe(1);
  });
});

describe('normalizeModelingSource', () => {
  it('maps legacy rolling-gap sources to neutral gap semantics', () => {
    expect(normalizeModelingSource('trip_impacts_plus_rolling_gap')).toBe(
      'MIXED_OBSERVED_NEUTRAL_GAP',
    );
    expect(normalizeModelingSource('rolling_gap_only')).toBe('NEUTRAL_GAP_ONLY');
    expect(normalizeModelingSource('trip_impacts')).toBe('OBSERVED');
    expect(normalizeModelingSource('none')).toBe('NOT_ENOUGH_DATA');
  });
});

describe('EV/ICE neutral gap policy', () => {
  it('uses the same gap assessment regardless of powertrain-specific reku', () => {
    const ice = assessBrakeCoverageGap({
      distanceSinceAnchorKm: 1200,
      observedDistanceKm: 600,
      observedTripCount: 3,
    });
    const ev = assessBrakeCoverageGap({
      distanceSinceAnchorKm: 1200,
      observedDistanceKm: 600,
      observedTripCount: 3,
    });
    expect(ev).toEqual(ice);
  });
});

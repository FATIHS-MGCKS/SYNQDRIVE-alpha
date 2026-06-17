import {
  ewmaUpdate,
  isOutlier,
  stabilize,
  shouldPublish,
  determineLvMaturity,
  getLvCalibrationProgress,
  determineHvMaturity,
  combinedConfidence,
  mapSignalConfidence,
  daysBetween,
} from './soh-publication';

describe('soh-publication utilities', () => {
  // ── EWMA ──────────────────────────────────────────────────────

  describe('ewmaUpdate', () => {
    it('seeds with raw when no previous value exists', () => {
      expect(ewmaUpdate(null, 85, 0.25)).toBe(85);
    });

    it('applies exponential smoothing correctly', () => {
      const result = ewmaUpdate(80, 90, 0.25);
      expect(result).toBeCloseTo(82.5, 5);
    });

    it('returns previous when alpha is 0', () => {
      expect(ewmaUpdate(80, 90, 0)).toBe(80);
    });

    it('returns raw when alpha is 1', () => {
      expect(ewmaUpdate(80, 90, 1)).toBe(90);
    });
  });

  // ── Outlier Detection ──────────────────────────────────────────

  describe('isOutlier', () => {
    it('returns false when no stabilized value exists', () => {
      expect(isOutlier(85, null)).toBe(false);
    });

    it('returns false for small deviations', () => {
      expect(isOutlier(82, 80)).toBe(false);
    });

    it('returns true for deviations beyond threshold', () => {
      expect(isOutlier(86, 80)).toBe(true);
      expect(isOutlier(74, 80)).toBe(true);
    });

    it('respects custom threshold', () => {
      expect(isOutlier(83, 80, 2)).toBe(true);
      expect(isOutlier(82, 80, 3)).toBe(false);
    });
  });

  // ── Stabilize (EWMA + outlier guard) ───────────────────────────

  describe('stabilize', () => {
    it('returns raw value when no previous stabilized exists', () => {
      const result = stabilize(null, 85, 0.25);
      expect(result.stabilized).toBe(85);
      expect(result.wasOutlier).toBe(false);
    });

    it('applies normal alpha for non-outlier readings', () => {
      const result = stabilize(80, 82, 0.25);
      expect(result.wasOutlier).toBe(false);
      expect(result.stabilized).toBeCloseTo(80.5, 0);
    });

    it('applies damped alpha for outlier readings', () => {
      // Both calls detect outlier (|90-80|=10 > threshold 5)
      // normal uses alpha=0.25, damped forces alpha=0.05
      const normal = stabilize(80, 90, 0.25, 0.05);
      expect(normal.wasOutlier).toBe(true);
      // With damped alpha (0.05): 0.05*90 + 0.95*80 = 80.5, rounded to 80.5
      expect(normal.stabilized).toBeCloseTo(80.5, 1);
      // Verify the damped alpha is much less than normal alpha would produce
      // Normal alpha 0.25: 0.25*90 + 0.75*80 = 82.5
      // Damped alpha 0.05: 0.05*90 + 0.95*80 = 80.5
      // So outlier damping moved only 0.5pp instead of 2.5pp
      const hypotheticalNormal = 0.25 * 90 + 0.75 * 80;
      expect(Math.abs(normal.stabilized - 80)).toBeLessThan(Math.abs(hypotheticalNormal - 80));
    });
  });

  // ── Publication Hysteresis ──────────────────────────────────────

  describe('shouldPublish', () => {
    it('always publishes when no current value exists', () => {
      expect(shouldPublish(85, null)).toBe(true);
    });

    it('publishes when delta >= 2pp', () => {
      expect(shouldPublish(82, 80)).toBe(true);
      expect(shouldPublish(78, 80)).toBe(true);
    });

    it('does not publish for small changes', () => {
      expect(shouldPublish(80.5, 80)).toBe(false);
      expect(shouldPublish(81, 80)).toBe(false);
    });

    it('publishes on threshold crossing at 70%', () => {
      expect(shouldPublish(69, 71)).toBe(true);
      expect(shouldPublish(71, 69)).toBe(true);
    });

    it('publishes on threshold crossing at 50%', () => {
      expect(shouldPublish(49, 51)).toBe(true);
      expect(shouldPublish(51, 49)).toBe(true);
    });
  });

  // ── LV Maturity ─────────────────────────────────────────────────

  describe('determineLvMaturity', () => {
    it('returns INITIAL_CALIBRATION with fewer than 3 events', () => {
      expect(determineLvMaturity({ qualifiedEventCount: 2, daysSinceFirstMeasurement: 10, restObservationCount: 1, crankObservationCount: 1 })).toBe('INITIAL_CALIBRATION');
    });

    it('returns INITIAL_CALIBRATION with fewer than 5 days', () => {
      expect(determineLvMaturity({ qualifiedEventCount: 5, daysSinceFirstMeasurement: 3, restObservationCount: 2, crankObservationCount: 2 })).toBe('INITIAL_CALIBRATION');
    });

    it('returns INITIAL_CALIBRATION with missing rest data', () => {
      expect(determineLvMaturity({ qualifiedEventCount: 5, daysSinceFirstMeasurement: 10, restObservationCount: 0, crankObservationCount: 3 })).toBe('INITIAL_CALIBRATION');
    });

    it('returns STABILIZING with 3+ events, 5+ days, rest+crank', () => {
      expect(determineLvMaturity({ qualifiedEventCount: 3, daysSinceFirstMeasurement: 5, restObservationCount: 1, crankObservationCount: 1 })).toBe('STABILIZING');
    });

    it('returns STABLE with 5+ events, 7+ days, 2+ rest, 2+ crank', () => {
      expect(determineLvMaturity({ qualifiedEventCount: 5, daysSinceFirstMeasurement: 7, restObservationCount: 2, crankObservationCount: 2 })).toBe('STABLE');
    });

    it('returns STABILIZING (not STABLE) when crank < 2', () => {
      expect(determineLvMaturity({ qualifiedEventCount: 5, daysSinceFirstMeasurement: 10, restObservationCount: 3, crankObservationCount: 1 })).toBe('STABILIZING');
    });

    it('handles null days correctly', () => {
      expect(determineLvMaturity({ qualifiedEventCount: 10, daysSinceFirstMeasurement: null, restObservationCount: 5, crankObservationCount: 5 })).toBe('INITIAL_CALIBRATION');
    });
  });

  describe('getLvCalibrationProgress', () => {
    it('tracks the 5-day wait during early calibration', () => {
      const progress = getLvCalibrationProgress({
        qualifiedEventCount: 2,
        daysSinceFirstMeasurement: 3.2,
        restObservationCount: 1,
        crankObservationCount: 1,
      });
      expect(progress).toMatchObject({
        measurementPath: 'rest_and_crank',
        daysSinceFirstMeasurement: 3.2,
        minimumDaysForStabilizing: 5,
        qualifiedEventCount: 2,
        minimumQualifiedEventsForStabilizing: 3,
        restObservationCount: 1,
        minimumRestObservationsForStabilizing: 1,
        crankObservationCount: 1,
        minimumCrankObservationsForStabilizing: 1,
        blockers: ['days', 'qualified_events'],
      });
      expect(progress.daysRemainingForStabilizing).toBeCloseTo(1.8, 5);
    });

    it('requires extra rest observations on the rest-only fallback path', () => {
      expect(getLvCalibrationProgress({
        qualifiedEventCount: 3,
        daysSinceFirstMeasurement: 7,
        restObservationCount: 1,
        crankObservationCount: 0,
      })).toEqual({
        measurementPath: 'rest_only',
        daysSinceFirstMeasurement: 7,
        minimumDaysForStabilizing: 5,
        daysRemainingForStabilizing: 0,
        qualifiedEventCount: 3,
        minimumQualifiedEventsForStabilizing: 3,
        restObservationCount: 1,
        minimumRestObservationsForStabilizing: 2,
        crankObservationCount: 0,
        minimumCrankObservationsForStabilizing: 0,
        blockers: ['rest_observations'],
      });
    });
  });

  // ── HV Maturity ─────────────────────────────────────────────────

  describe('determineHvMaturity', () => {
    it('treats degradation_model as insufficient (no maturity progression)', () => {
      expect(determineHvMaturity({ validEstimateCount: 20, daysSinceFirstMeasurement: 30, method: 'degradation_model' })).toBe('INITIAL_CALIBRATION');
    });

    it('returns INITIAL_CALIBRATION for insufficient_data', () => {
      expect(determineHvMaturity({ validEstimateCount: 0, daysSinceFirstMeasurement: 0, method: 'insufficient_data' })).toBe('INITIAL_CALIBRATION');
    });

    it('returns INITIAL_CALIBRATION with too few estimates', () => {
      expect(determineHvMaturity({ validEstimateCount: 3, daysSinceFirstMeasurement: 10, method: 'capacity_measurement' })).toBe('INITIAL_CALIBRATION');
    });

    it('returns STABILIZING with 5+ estimates and 7+ days', () => {
      expect(determineHvMaturity({ validEstimateCount: 5, daysSinceFirstMeasurement: 7, method: 'capacity_measurement' })).toBe('STABILIZING');
    });

    it('returns STABLE with 10+ estimates and 14+ days', () => {
      expect(determineHvMaturity({ validEstimateCount: 10, daysSinceFirstMeasurement: 14, method: 'capacity_measurement' })).toBe('STABLE');
    });

    it('returns STABILIZING (not STABLE) with only 7 estimates', () => {
      expect(determineHvMaturity({ validEstimateCount: 7, daysSinceFirstMeasurement: 20, method: 'energy_throughput' })).toBe('STABILIZING');
    });
  });

  // ── Confidence ────────────────────────────────────────────────

  describe('combinedConfidence', () => {
    it('returns min of signal and maturity', () => {
      expect(combinedConfidence('high', 'STABLE')).toBe('high');
      expect(combinedConfidence('high', 'STABILIZING')).toBe('medium');
      expect(combinedConfidence('high', 'INITIAL_CALIBRATION')).toBe('low');
      expect(combinedConfidence('low', 'STABLE')).toBe('low');
      expect(combinedConfidence('medium', 'STABILIZING')).toBe('medium');
    });
  });

  describe('mapSignalConfidence', () => {
    it('maps known strings correctly', () => {
      expect(mapSignalConfidence('high')).toBe('high');
      expect(mapSignalConfidence('medium')).toBe('medium');
      expect(mapSignalConfidence('low')).toBe('low');
    });

    it('maps unknown/null to none', () => {
      expect(mapSignalConfidence(null)).toBe('none');
      expect(mapSignalConfidence('insufficient_data')).toBe('none');
    });
  });

  // ── Helpers ────────────────────────────────────────────────────

  describe('daysBetween', () => {
    it('returns null for null from date', () => {
      expect(daysBetween(null, new Date())).toBeNull();
    });

    it('calculates days correctly', () => {
      const from = new Date('2025-01-01');
      const to = new Date('2025-01-08');
      expect(daysBetween(from, to)).toBeCloseTo(7, 0);
    });
  });
});

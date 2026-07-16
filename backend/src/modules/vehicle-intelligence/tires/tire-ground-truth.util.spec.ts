import {
  GROUND_TRUTH_MEASUREMENT_SOURCES,
  hasValidGroundTruthMeasurement,
  isGroundTruthMeasurementSource,
  isSyntheticPredictedGroundTruthLeak,
  resolveAxleGroundTruthTreadMm,
  type TreadMeasurementGroundTruthInput,
} from './tire-ground-truth.util';

const SETUP_ID = 'setup-1';

function meas(
  overrides: Partial<TreadMeasurementGroundTruthInput> = {},
): TreadMeasurementGroundTruthInput {
  return {
    tireSetupId: SETUP_ID,
    source: 'manual',
    measuredAt: new Date('2026-06-01T10:00:00Z'),
    frontLeftMm: 7.2,
    frontRightMm: 7.1,
    rearLeftMm: 7.0,
    rearRightMm: 6.9,
    ...overrides,
  };
}

describe('tire-ground-truth.util', () => {
  describe('isGroundTruthMeasurementSource', () => {
    it('accepts audit ground-truth sources', () => {
      for (const source of GROUND_TRUTH_MEASUREMENT_SOURCES) {
        expect(isGroundTruthMeasurementSource(source)).toBe(true);
      }
    });

    it('rejects AI-only or unknown sources', () => {
      expect(isGroundTruthMeasurementSource('ai_estimate')).toBe(false);
      expect(isGroundTruthMeasurementSource('')).toBe(false);
      expect(isGroundTruthMeasurementSource(null)).toBe(false);
    });
  });

  describe('hasValidGroundTruthMeasurement', () => {
    it('returns false when no measurement exists', () => {
      expect(
        hasValidGroundTruthMeasurement({
          measurement: null,
          tireSetupId: SETUP_ID,
          axle: 'front',
        }),
      ).toBe(false);
    });

    it('returns false for partial front axle (only FL measured)', () => {
      expect(
        hasValidGroundTruthMeasurement({
          measurement: meas({ frontRightMm: null }),
          tireSetupId: SETUP_ID,
          axle: 'front',
        }),
      ).toBe(false);
    });

    it('returns true for complete four-wheel measurement on both axles', () => {
      const m = meas();
      expect(
        hasValidGroundTruthMeasurement({
          measurement: m,
          tireSetupId: SETUP_ID,
          axle: 'front',
        }),
      ).toBe(true);
      expect(
        hasValidGroundTruthMeasurement({
          measurement: m,
          tireSetupId: SETUP_ID,
          axle: 'rear',
        }),
      ).toBe(true);
    });

    it('returns false when measurement belongs to another setup', () => {
      expect(
        hasValidGroundTruthMeasurement({
          measurement: meas({ tireSetupId: 'other-setup' }),
          tireSetupId: SETUP_ID,
          axle: 'front',
        }),
      ).toBe(false);
    });

    it('returns false when measurement is after as-of boundary', () => {
      expect(
        hasValidGroundTruthMeasurement({
          measurement: meas({ measuredAt: new Date('2026-07-01T12:00:00Z') }),
          tireSetupId: SETUP_ID,
          axle: 'front',
          asOf: new Date('2026-07-01T10:00:00Z'),
        }),
      ).toBe(false);
    });

    it('allows measurement exactly at as-of instant', () => {
      const at = new Date('2026-07-01T10:00:00Z');
      expect(
        hasValidGroundTruthMeasurement({
          measurement: meas({ measuredAt: at }),
          tireSetupId: SETUP_ID,
          axle: 'front',
          asOf: at,
        }),
      ).toBe(true);
    });

    it('returns false for rear axle when only front wheels measured', () => {
      expect(
        hasValidGroundTruthMeasurement({
          measurement: meas({
            rearLeftMm: null,
            rearRightMm: null,
          }),
          tireSetupId: SETUP_ID,
          axle: 'rear',
        }),
      ).toBe(false);
    });
  });

  describe('resolveAxleGroundTruthTreadMm', () => {
    it('averages both wheels on axle', () => {
      expect(resolveAxleGroundTruthTreadMm(meas(), 'front')).toBeCloseTo(7.15, 2);
      expect(resolveAxleGroundTruthTreadMm(meas(), 'rear')).toBeCloseTo(6.95, 2);
    });

    it('returns null for partial axle — no copy to unmeasured wheels', () => {
      expect(
        resolveAxleGroundTruthTreadMm(meas({ frontRightMm: null }), 'front'),
      ).toBeNull();
    });
  });

  describe('isSyntheticPredictedGroundTruthLeak', () => {
    it('detects zero-residual synthetic rows', () => {
      expect(isSyntheticPredictedGroundTruthLeak(6.5, 6.5)).toBe(true);
      expect(isSyntheticPredictedGroundTruthLeak(6.5004, 6.5)).toBe(true);
    });

    it('allows genuine measurement residual', () => {
      expect(isSyntheticPredictedGroundTruthLeak(6.2, 6.5)).toBe(false);
    });
  });
});

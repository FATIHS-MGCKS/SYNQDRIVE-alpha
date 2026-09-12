import { detectRawFuelRises } from './raw-fuel-rise-detector';
import { validatePlateauWindow } from './raw-fuel-rise-state-machine';
import {
  buildDetectionContext,
  linearRiseSamples,
  sampleAt,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';

describe('raw-fuel-rise-detector F3.1 hardening', () => {
  const context = buildDetectionContext();

  describe('plateau final median invariant', () => {
    it('PRE_PLATEAU_FINAL_MEDIAN_INVARIANT — rejects 10.0, 10.9, 10.9 at ±0.5 L', () => {
      const { valid } = validatePlateauWindow([10.0, 10.9, 10.9], 0.5);
      expect(valid).toBe(false);
    });

    it('POST_PLATEAU_FINAL_MEDIAN_INVARIANT — rejects adversarial post window', () => {
      const { valid } = validatePlateauWindow([29.0, 29.9, 29.9], 0.5);
      expect(valid).toBe(false);
    });

    it('accepts true plateau 10.0, 10.2, 10.1 at ±0.5 L', () => {
      const { valid, median: center } = validatePlateauWindow([10.0, 10.2, 10.1], 0.5);
      expect(valid).toBe(true);
      expect(center).toBeCloseTo(10.1, 5);
    });
  });

  describe('persistent single-step provider rises', () => {
    it('PERSISTENT_SINGLE_STEP_REFUEL — 10,10,10 → 30 → 30,30,30', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 30),
        sampleAt('2026-09-06T08:18:00.000Z', 30),
        sampleAt('2026-09-06T08:20:00.000Z', 30),
        sampleAt('2026-09-06T08:22:00.000Z', 30),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].deltaAbsoluteLiters).toBe(20);
    });

    it('SINGLE_SPIKE_REJECTED — single 30 spike back to 10', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 30),
        sampleAt('2026-09-06T08:18:00.000Z', 10),
        sampleAt('2026-09-06T08:20:00.000Z', 10),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(
        result.candidates.every((c) => c.lifecycleState !== 'READY_FOR_PERSIST'),
      ).toBe(true);
    });

    it('SINGLE_STEP_NO_POST_FAIL_CLOSED — 10 → 30 without stable post', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 30),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].lifecycleState).not.toBe('READY_FOR_PERSIST');
      expect(['OBSERVED', 'SETTLING', 'INSUFFICIENT']).toContain(
        result.candidates[0].lifecycleState,
      );
    });

    it('single-step with >6m evidence gap held fail-closed', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:20:00.000Z', 30),
        sampleAt('2026-09-06T08:54:00.000Z', 30),
        sampleAt('2026-09-06T08:58:00.000Z', 30),
      ];
      const result = detectRawFuelRises({ context, samples });
      if (result.candidates.length > 0) {
        expect(result.candidates[0].lifecycleState).not.toBe('READY_FOR_PERSIST');
      }
    });
  });

  describe('stepped-refuel coalescence', () => {
    it('STEPPED_SINGLE_REFUEL_CANDIDATE_COUNT — 10 → 16 plateau → 30', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 16),
        sampleAt('2026-09-06T08:18:00.000Z', 16),
        sampleAt('2026-09-06T08:20:00.000Z', 16),
        sampleAt('2026-09-06T08:22:00.000Z', 30),
        sampleAt('2026-09-06T08:24:00.000Z', 30),
        sampleAt('2026-09-06T08:26:00.000Z', 30),
        sampleAt('2026-09-06T08:28:00.000Z', 30),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].preFuelAbsoluteLiters).toBe(10);
      expect(result.candidates[0].postFuelAbsoluteLiters).toBe(30);
    });

    it('TRUE_TWO_REFUEL_CANDIDATE_COUNT — separated stable refuels', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ...stablePlateauSamples('2026-09-06T10:00:00.000Z', 20, 3, 300),
        ...linearRiseSamples('2026-09-06T10:16:00.000Z', [25, 32, 38, 40], 120),
        ...stablePlateauSamples('2026-09-06T10:28:00.000Z', 40, 4, 120),
      ];
      const result = detectRawFuelRises({
        context: buildDetectionContext({
          scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
          scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
        }),
        samples,
      });
      expect(result.candidates).toHaveLength(2);
    });

    it('PROVISIONAL_POST_CONTINUATION_COALESCENCE — intermediate plateau absorbed', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 16),
        sampleAt('2026-09-06T08:18:00.000Z', 16),
        sampleAt('2026-09-06T08:20:00.000Z', 16),
        sampleAt('2026-09-06T08:22:00.000Z', 30),
        sampleAt('2026-09-06T08:24:00.000Z', 30),
        sampleAt('2026-09-06T08:26:00.000Z', 30),
        sampleAt('2026-09-06T08:28:00.000Z', 30),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].deltaAbsoluteLiters).toBe(20);
    });
  });

  describe('local post plateau authority', () => {
    it('DISTANT_CONSUMPTION_NOT_POST_PLATEAU — rise without immediate post, later consumption', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 20, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 28),
        sampleAt('2026-09-06T08:18:00.000Z', 35),
        sampleAt('2026-09-06T08:20:00.000Z', 40),
        sampleAt('2026-09-06T12:00:00.000Z', 34),
        sampleAt('2026-09-06T12:05:00.000Z', 34),
        sampleAt('2026-09-06T12:10:00.000Z', 34),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].lifecycleState).not.toBe('READY_FOR_PERSIST');
      if (result.candidates[0].postFuelAbsoluteLiters != null) {
        expect(result.candidates[0].postFuelAbsoluteLiters).not.toBe(34);
      }
    });
  });

  describe('wobble fail-closed', () => {
    it('REPEATED_STRONG_WOBBLE_FAIL_CLOSED — sawtooth cannot reach READY', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 20),
        sampleAt('2026-09-06T08:18:00.000Z', 12),
        sampleAt('2026-09-06T08:20:00.000Z', 22),
        sampleAt('2026-09-06T08:22:00.000Z', 13),
        sampleAt('2026-09-06T08:24:00.000Z', 30),
        sampleAt('2026-09-06T08:26:00.000Z', 30),
        sampleAt('2026-09-06T08:28:00.000Z', 30),
        sampleAt('2026-09-06T08:30:00.000Z', 30),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(
        result.candidates.every((c) => c.lifecycleState !== 'READY_FOR_PERSIST'),
      ).toBe(true);
    });
  });

  describe('diagnostic metric epistemics', () => {
    it('RAW_RISE_WITHOUT_NATIVE_SEGMENT_METRIC_EPISTEMICALLY_VALID — null not fabricated', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(result.diagnostics.metricsContract.rawRiseWithoutNativeSegmentTotal).toBeNull();
    });
  });
});

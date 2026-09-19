import { detectRawFuelRises } from './raw-fuel-rise-detector';
import {
  buildDetectorPhysicsContext,
  linearRiseSamples,
  sampleAt,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';
import {
  isValidRawRefuelCandidateLifecycleTransition,
  resolveNextLifecycleState,
} from '../raw-refuel-candidate/raw-refuel-candidate-lifecycle';
import { RawRefuelCandidateLifecycleTransitionError } from '../raw-refuel-candidate/raw-refuel-candidate.errors';

/**
 * Generalized episode shape from F10.6.5 (stable pre, sparse bridge, stepped rise, delayed post).
 * No vehicle-specific identifiers — physics only.
 */
function buildSparseBridgeRefuelEpisodeSamples(includeDelayedPost: boolean) {
  const pre = [
    sampleAt('2026-09-19T15:40:26.000Z', 5),
    sampleAt('2026-09-19T15:42:26.000Z', 5),
    sampleAt('2026-09-19T15:44:26.000Z', 5),
    sampleAt('2026-09-19T15:46:26.000Z', 5),
    sampleAt('2026-09-19T15:48:26.000Z', 5),
  ];
  const rise = [
    sampleAt('2026-09-19T16:11:24.000Z', 16),
    sampleAt('2026-09-19T16:13:26.000Z', 17),
    sampleAt('2026-09-19T16:15:27.000Z', 18),
  ];
  const post = includeDelayedPost
    ? [
        sampleAt('2026-09-19T16:53:59.000Z', 18),
        sampleAt('2026-09-19T16:56:15.000Z', 18),
        sampleAt('2026-09-19T16:58:31.000Z', 18),
      ]
    : [];
  return [...pre, ...rise, ...post];
}

describe('raw-fuel-rise-liveness F10.6.6-A', () => {
  const sparseBridgeContext = buildDetectorPhysicsContext({
    scanWindowStart: new Date('2026-09-19T15:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-19T18:00:00.000Z'),
  });
  const defaultContext = buildDetectorPhysicsContext();

  describe('real episode fixture (generalized sparse-bridge refuel)', () => {
    it('with delayed post plateau reaches READY_FOR_PERSIST despite bridge gap on global path', () => {
      const samples = buildSparseBridgeRefuelEpisodeSamples(true);
      const result = detectRawFuelRises({ context: sparseBridgeContext, samples });
      expect(result.candidates).toHaveLength(1);
      const candidate = result.candidates[0];
      expect(candidate.lifecycleState).toBe('READY_FOR_PERSIST');
      expect(candidate.preFuelAbsoluteLiters).toBeCloseTo(5, 1);
      expect(candidate.postFuelAbsoluteLiters).toBeCloseTo(18, 1);
      expect(candidate.deltaAbsoluteLiters).toBeCloseTo(13, 0);
      expect(candidate.maxSampleGapSeconds).toBeGreaterThan(360);
      expect(candidate.rejectionReason).toBeNull();
    });

    it('without post is not permanently blocked by bridge-only SAMPLE_GAP_TOO_LARGE', () => {
      const samples = buildSparseBridgeRefuelEpisodeSamples(false);
      const result = detectRawFuelRises({ context: sparseBridgeContext, samples });
      expect(result.candidates).toHaveLength(1);
      const candidate = result.candidates[0];
      expect(candidate.lifecycleState).not.toBe('REJECTED');
      expect(candidate.rejectionReason).not.toBe('SAMPLE_GAP_TOO_LARGE');
      expect(['OBSERVED', 'INSUFFICIENT', 'SETTLING']).toContain(candidate.lifecycleState);
    });
  });

  describe('adversarial gap and plateau cases', () => {
    it('1 — long PRE_TO_RISE bridge with strong PRE/RISE/POST still READY', () => {
      const samples = buildSparseBridgeRefuelEpisodeSamples(true);
      const result = detectRawFuelRises({ context: sparseBridgeContext, samples });
      expect(result.candidates[0]?.lifecycleState).toBe('READY_FOR_PERSIST');
    });

    it('2 — excessive gap INSIDE rise → REJECTED terminal', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 20),
        sampleAt('2026-09-06T08:24:00.000Z', 26),
        sampleAt('2026-09-06T08:32:00.000Z', 30),
        ...stablePlateauSamples('2026-09-06T08:34:00.000Z', 30, 3, 120),
      ];
      const result = detectRawFuelRises({ context: defaultContext, samples });
      expect(result.candidates.every((c) => c.lifecycleState !== 'READY_FOR_PERSIST')).toBe(
        true,
      );
      expect(result.rejectedOrHeld.some((r) => r.reason === 'SAMPLE_GAP_TOO_LARGE')).toBe(
        true,
      );
    });

    it('3 — excessive gap INSIDE post plateau → not READY', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [18, 24, 28, 30], 120),
        sampleAt('2026-09-06T08:28:00.000Z', 30),
        sampleAt('2026-09-06T08:40:00.000Z', 30),
        sampleAt('2026-09-06T08:52:00.000Z', 30),
      ];
      const result = detectRawFuelRises({ context: defaultContext, samples });
      expect(result.candidates[0]?.lifecycleState).not.toBe('READY_FOR_PERSIST');
    });

    it('4 — insufficient pre plateau does not produce READY', () => {
      const samples = [
        sampleAt('2026-09-06T08:00:00.000Z', 10),
        sampleAt('2026-09-06T08:02:00.000Z', 10),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [18, 24, 30], 120),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 3, 120),
      ];
      const result = detectRawFuelRises({ context: defaultContext, samples });
      expect(
        result.candidates.every((c) => c.lifecycleState !== 'READY_FOR_PERSIST'),
      ).toBe(true);
    });

    it('5 — post plateau below minimum samples', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [18, 24, 28, 30], 120),
        sampleAt('2026-09-06T08:28:00.000Z', 30),
        sampleAt('2026-09-06T08:30:00.000Z', 30),
      ];
      const result = detectRawFuelRises({ context: defaultContext, samples });
      const c = result.candidates[0];
      expect(c?.lifecycleState).not.toBe('READY_FOR_PERSIST');
      expect(['SETTLING', 'OBSERVED', 'INSUFFICIENT']).toContain(c?.lifecycleState);
    });

    it('6 — post plateau below minimum persistence duration', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [18, 24, 28, 30], 120),
        sampleAt('2026-09-06T08:28:00.000Z', 30),
        sampleAt('2026-09-06T08:29:00.000Z', 30),
        sampleAt('2026-09-06T08:29:30.000Z', 30),
      ];
      const result = detectRawFuelRises({ context: defaultContext, samples });
      expect(['SETTLING', 'OBSERVED', 'INSUFFICIENT']).toContain(
        result.candidates[0]?.lifecycleState,
      );
    });

    it('7 — noisy post plateau fails READY', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [18, 24, 28, 30], 120),
        sampleAt('2026-09-06T08:28:00.000Z', 30),
        sampleAt('2026-09-06T08:30:00.000Z', 29),
        sampleAt('2026-09-06T08:32:00.000Z', 31),
      ];
      const result = detectRawFuelRises({ context: defaultContext, samples });
      expect(result.candidates[0]?.lifecycleState).not.toBe('READY_FOR_PERSIST');
    });
  });

  describe('lifecycle evidence refinement', () => {
    it('8 — INSUFFICIENT → SETTLING supported', () => {
      expect(isValidRawRefuelCandidateLifecycleTransition('INSUFFICIENT', 'SETTLING')).toBe(
        true,
      );
      expect(resolveNextLifecycleState('INSUFFICIENT', 'SETTLING')).toBe('SETTLING');
    });

    it('9 — SETTLING → READY_FOR_PERSIST supported', () => {
      expect(resolveNextLifecycleState('SETTLING', 'READY_FOR_PERSIST')).toBe(
        'READY_FOR_PERSIST',
      );
    });

    it('10 — terminal REJECTED cannot reactivate', () => {
      expect(() => resolveNextLifecycleState('REJECTED', 'SETTLING')).toThrow(
        RawRefuelCandidateLifecycleTransitionError,
      );
    });

    it('11 — terminal PROMOTED cannot reactivate', () => {
      expect(() => resolveNextLifecycleState('PROMOTED', 'READY_FOR_PERSIST')).toThrow(
        RawRefuelCandidateLifecycleTransitionError,
      );
    });

    it('12 — terminal CONVERGED_NATIVE cannot reactivate', () => {
      expect(() => resolveNextLifecycleState('CONVERGED_NATIVE', 'OBSERVED')).toThrow(
        RawRefuelCandidateLifecycleTransitionError,
      );
    });
  });

  describe('detector idempotency and terminal outcomes', () => {
    it('13 — repeated detection on same samples is stable', () => {
      const samples = buildSparseBridgeRefuelEpisodeSamples(true);
      const first = detectRawFuelRises({ context: sparseBridgeContext, samples });
      const second = detectRawFuelRises({ context: sparseBridgeContext, samples });
      expect(first.candidates[0]?.lifecycleState).toBe(second.candidates[0]?.lifecycleState);
      expect(first.candidates[0]?.deltaAbsoluteLiters).toBe(
        second.candidates[0]?.deltaAbsoluteLiters,
      );
    });

    it('14 — same physical rise yields single candidate', () => {
      const samples = buildSparseBridgeRefuelEpisodeSamples(true);
      const result = detectRawFuelRises({ context: sparseBridgeContext, samples });
      expect(result.candidates).toHaveLength(1);
    });

    it('15 — unrecoverable rise-internal gap reaches auditable REJECTED', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 20),
        sampleAt('2026-09-06T08:24:00.000Z', 26),
        sampleAt('2026-09-06T08:32:00.000Z', 30),
      ];
      const result = detectRawFuelRises({ context: defaultContext, samples });
      expect(result.candidates).toHaveLength(0);
      expect(result.rejectedOrHeld).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            lifecycleState: 'REJECTED',
            reason: 'SAMPLE_GAP_TOO_LARGE',
          }),
        ]),
      );
    });
  });
});

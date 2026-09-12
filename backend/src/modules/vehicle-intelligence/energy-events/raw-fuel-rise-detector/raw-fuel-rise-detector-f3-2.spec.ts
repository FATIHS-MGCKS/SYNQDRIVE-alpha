import { detectRawFuelRises } from './raw-fuel-rise-detector';
import { NON_FINITE_SAMPLE_POLICY } from './raw-fuel-rise-normalizer';
import {
  buildDetectionContext,
  linearRiseSamples,
  sampleAt,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';

describe('raw-fuel-rise-detector F3.2 final semantic closure', () => {
  const context = buildDetectionContext({
    scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
    scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
  });

  describe('physical refuel finality and continuation grace', () => {
    it('STEPPED_CONTINUATION_WITHIN_GRACE — 10 → 16 → 30 inside grace', () => {
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

    it('FINALIZED_POST_CREATES_EVENT_BOUNDARY — two refuels 2h apart', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ...stablePlateauSamples('2026-09-06T10:00:00.000Z', 20, 3, 300),
        ...linearRiseSamples('2026-09-06T10:16:00.000Z', [25, 32, 38, 40], 120),
        ...stablePlateauSamples('2026-09-06T10:28:00.000Z', 40, 4, 120),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(2);
    });

    it('TWO_REFUELS_WITHIN_45M — 10→30 finalized then 30→45 within riseMax window', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        sampleAt('2026-09-06T08:16:00.000Z', 30),
        sampleAt('2026-09-06T08:18:00.000Z', 30),
        sampleAt('2026-09-06T08:20:00.000Z', 30),
        sampleAt('2026-09-06T08:22:00.000Z', 30),
        ...stablePlateauSamples('2026-09-06T08:35:00.000Z', 30, 3, 120),
        sampleAt('2026-09-06T08:42:00.000Z', 45),
        sampleAt('2026-09-06T08:44:00.000Z', 45),
        sampleAt('2026-09-06T08:46:00.000Z', 45),
        sampleAt('2026-09-06T08:48:00.000Z', 45),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].preFuelAbsoluteLiters).toBe(10);
      expect(result.candidates[0].postFuelAbsoluteLiters).toBe(30);
      expect(result.candidates[1].preFuelAbsoluteLiters).toBe(30);
      expect(result.candidates[1].postFuelAbsoluteLiters).toBe(45);
    });

    it('CONTINUATION_GRACE_BOUNDARY — inside grace coalesces, outside grace splits', () => {
      const insideGrace = detectRawFuelRises({
        context,
        samples: [
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          sampleAt('2026-09-06T08:16:00.000Z', 16),
          sampleAt('2026-09-06T08:22:00.000Z', 30),
          sampleAt('2026-09-06T08:24:00.000Z', 30),
          sampleAt('2026-09-06T08:26:00.000Z', 30),
          sampleAt('2026-09-06T08:28:00.000Z', 30),
        ],
      });
      expect(insideGrace.candidates).toHaveLength(1);

      const outsideGrace = detectRawFuelRises({
        context,
        samples: [
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
          sampleAt('2026-09-06T08:16:00.000Z', 16),
          sampleAt('2026-09-06T08:18:00.000Z', 16),
          sampleAt('2026-09-06T08:20:00.000Z', 16),
          sampleAt('2026-09-06T08:22:00.000Z', 16),
          sampleAt('2026-09-06T08:28:00.000Z', 16),
          sampleAt('2026-09-06T08:30:00.000Z', 16),
          sampleAt('2026-09-06T08:32:00.000Z', 16),
          sampleAt('2026-09-06T08:34:00.000Z', 30),
          sampleAt('2026-09-06T08:36:00.000Z', 30),
          sampleAt('2026-09-06T08:38:00.000Z', 30),
          sampleAt('2026-09-06T08:40:00.000Z', 30),
        ],
      });
      expect(outsideGrace.candidates).toHaveLength(2);
    });

    it('POST_CONSUMPTION_SECOND_REFUEL — 10→30 then consumption then 25→40', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
        ...stablePlateauSamples('2026-09-06T09:00:00.000Z', 28, 1, 60),
        sampleAt('2026-09-06T09:05:00.000Z', 26),
        sampleAt('2026-09-06T09:10:00.000Z', 25),
        sampleAt('2026-09-06T09:12:00.000Z', 25),
        sampleAt('2026-09-06T09:14:00.000Z', 25),
        ...linearRiseSamples('2026-09-06T09:20:00.000Z', [30, 35, 38, 40], 120),
        ...stablePlateauSamples('2026-09-06T09:32:00.000Z', 40, 4, 120),
      ];
      const result = detectRawFuelRises({ context, samples });
      expect(result.candidates).toHaveLength(2);
      expect(result.candidates[0].preFuelAbsoluteLiters).toBe(10);
      expect(result.candidates[0].postFuelAbsoluteLiters).toBe(30);
      expect(result.candidates[1].preFuelAbsoluteLiters).toBe(25);
      expect(result.candidates[1].postFuelAbsoluteLiters).toBe(40);
      expect(
        result.candidates.some(
          (c) => c.preFuelAbsoluteLiters === 10 && c.postFuelAbsoluteLiters === 40,
        ),
      ).toBe(false);
    });
  });

  describe('primary channel fallback', () => {
    const relativeRefuelSamples = [
      sampleAt('2026-09-06T08:00:00.000Z', null, 20),
      sampleAt('2026-09-06T08:05:00.000Z', null, 20),
      sampleAt('2026-09-06T08:10:00.000Z', null, 20),
      sampleAt('2026-09-06T08:16:00.000Z', null, 26),
      sampleAt('2026-09-06T08:18:00.000Z', null, 30),
      sampleAt('2026-09-06T08:20:00.000Z', null, 33),
      sampleAt('2026-09-06T08:22:00.000Z', null, 36),
      sampleAt('2026-09-06T08:24:00.000Z', null, 36),
      sampleAt('2026-09-06T08:26:00.000Z', null, 36),
      sampleAt('2026-09-06T08:28:00.000Z', null, 36),
    ];

    it('TRUSTED_ABSOLUTE_SPARSE_RELATIVE_FALLBACK', () => {
      const result = detectRawFuelRises({
        context: buildDetectionContext({
          absoluteSignalTrust: 'TRUSTED',
          relativeSignalAvailable: true,
        }),
        samples: relativeRefuelSamples,
      });
      expect(result.diagnostics.primaryChannel).toBe('RELATIVE_PERCENT');
      expect(result.candidates.length).toBeGreaterThanOrEqual(1);
    });

    it('TRUSTED_ABSOLUTE_SUFFICIENT_REMAINS_PRIMARY', () => {
      const samples = [
        ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300).map((s) => ({
          ...s,
          relativePercent: 20,
        })),
        ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120).map((s) => ({
          ...s,
          relativePercent: 36,
        })),
        ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120).map((s) => ({
          ...s,
          relativePercent: 36,
        })),
      ];
      const result = detectRawFuelRises({
        context: buildDetectionContext({
          absoluteSignalTrust: 'TRUSTED',
          relativeSignalAvailable: true,
        }),
        samples,
      });
      expect(result.diagnostics.primaryChannel).toBe('ABSOLUTE_LITERS');
      expect(result.candidates).toHaveLength(1);
    });

    it('BOTH_CHANNELS_INSUFFICIENT_FAIL_CLOSED', () => {
      const result = detectRawFuelRises({
        context: buildDetectionContext({
          absoluteSignalTrust: 'TRUSTED',
          relativeSignalAvailable: true,
        }),
        samples: [
          sampleAt('2026-09-06T08:00:00.000Z', 10, 20),
          sampleAt('2026-09-06T08:05:00.000Z', 11, 21),
        ],
      });
      expect(result.candidates).toHaveLength(0);
      expect(result.rejectedOrHeld[0]?.reason).toBe('insufficient_channel_samples');
    });

    it('DUAL_CHANNEL_SINGLE_PHYSICAL_CANDIDATE', () => {
      const result = detectRawFuelRises({
        context: buildDetectionContext({
          absoluteSignalTrust: 'TRUSTED',
          relativeSignalAvailable: true,
        }),
        samples: [
          ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300).map((s) => ({
            ...s,
            relativePercent: 20,
          })),
          ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120).map((s) => ({
            ...s,
            relativePercent: 36,
          })),
          ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120).map((s) => ({
            ...s,
            relativePercent: 36,
          })),
        ],
      });
      expect(result.candidates).toHaveLength(1);
    });

    it('absolute UNKNOWN uses relative when sufficient', () => {
      const result = detectRawFuelRises({
        context: buildDetectionContext({
          absoluteSignalTrust: 'UNKNOWN',
          relativeSignalAvailable: true,
        }),
        samples: relativeRefuelSamples,
      });
      expect(result.diagnostics.primaryChannel).toBe('RELATIVE_PERCENT');
    });

    it('absolute UNTRUSTED uses relative when sufficient', () => {
      const result = detectRawFuelRises({
        context: buildDetectionContext({
          absoluteSignalTrust: 'UNTRUSTED',
          relativeSignalAvailable: true,
        }),
        samples: relativeRefuelSamples,
      });
      expect(result.diagnostics.primaryChannel).toBe('RELATIVE_PERCENT');
    });
  });

  describe('non-finite sample policy', () => {
    it('NON_FINITE_SAMPLE_POLICY_DEFINED', () => {
      expect(NON_FINITE_SAMPLE_POLICY).toBe(
        'INVALID_CHANNEL_SAMPLE_EXCLUDED_WITH_EXPLICIT_DIAGNOSTIC',
      );
    });

    it('NON_FINITE_SAMPLE_TESTS — NaN/Infinity excluded per channel', () => {
      const baseContext = buildDetectionContext({ relativeSignalAvailable: true });

      expect(
        detectRawFuelRises({
          context: baseContext,
          samples: [sampleAt('2026-09-06T08:00:00.000Z', Number.NaN)],
        }).candidates,
      ).toHaveLength(0);

      expect(
        detectRawFuelRises({
          context: baseContext,
          samples: [sampleAt('2026-09-06T08:00:00.000Z', Number.POSITIVE_INFINITY)],
        }).candidates,
      ).toHaveLength(0);

      expect(
        detectRawFuelRises({
          context: baseContext,
          samples: [sampleAt('2026-09-06T08:00:00.000Z', Number.NEGATIVE_INFINITY)],
        }).candidates,
      ).toHaveLength(0);

      const relativeOnlyFromNonFiniteAbsolute = detectRawFuelRises({
        context: buildDetectionContext({
          absoluteSignalTrust: 'TRUSTED',
          relativeSignalAvailable: true,
        }),
        samples: [
          sampleAt('2026-09-06T08:00:00.000Z', Number.NaN, 20),
          sampleAt('2026-09-06T08:05:00.000Z', Number.POSITIVE_INFINITY, 20),
          sampleAt('2026-09-06T08:10:00.000Z', null, 20),
          sampleAt('2026-09-06T08:16:00.000Z', null, 26),
          sampleAt('2026-09-06T08:18:00.000Z', null, 30),
          sampleAt('2026-09-06T08:20:00.000Z', null, 33),
          sampleAt('2026-09-06T08:22:00.000Z', null, 36),
          sampleAt('2026-09-06T08:24:00.000Z', null, 36),
          sampleAt('2026-09-06T08:26:00.000Z', null, 36),
          sampleAt('2026-09-06T08:28:00.000Z', null, 36),
        ],
      });
      expect(relativeOnlyFromNonFiniteAbsolute.diagnostics.primaryChannel).toBe(
        'RELATIVE_PERCENT',
      );

      expect(
        detectRawFuelRises({
          context: buildDetectionContext({
            absoluteSignalTrust: 'UNKNOWN',
            relativeSignalAvailable: true,
          }),
          samples: [sampleAt('2026-09-06T08:00:00.000Z', null, Number.NaN)],
        }).candidates,
      ).toHaveLength(0);
    });
  });
});

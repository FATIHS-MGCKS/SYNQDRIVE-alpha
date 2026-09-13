import { detectRawFuelRises } from './raw-fuel-rise-detector';
import {
  buildDetectionContext,
  buildDetectorPhysicsContext,
  linearRiseSamples,
  sampleAt,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';

describe('raw-fuel-rise-detector negative matrix', () => {
  const context = buildDetectorPhysicsContext();

  it('1 — single-sample spike then baseline', () => {
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 20),
      sampleAt('2026-09-06T08:18:00.000Z', 10),
    ];
    expect(detectRawFuelRises({ context, samples }).candidates).toHaveLength(0);
  });

  it('2 — +3 L rise below material threshold', () => {
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 13),
      sampleAt('2026-09-06T08:18:00.000Z', 13),
      sampleAt('2026-09-06T08:20:00.000Z', 13),
    ];
    expect(detectRawFuelRises({ context, samples }).candidates).toHaveLength(0);
  });

  it('3 — normal consumption only', () => {
    const samples = linearRiseSamples(
      '2026-09-06T08:00:00.000Z',
      [40, 38, 36, 34, 32, 30],
      600,
    );
    expect(detectRawFuelRises({ context, samples }).candidates).toHaveLength(0);
  });

  it('4 — slosh without stable post plateau', () => {
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 18),
      sampleAt('2026-09-06T08:18:00.000Z', 12),
      sampleAt('2026-09-06T08:20:00.000Z', 19),
      sampleAt('2026-09-06T08:22:00.000Z', 11),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates.every((c) => c.lifecycleState !== 'READY_FOR_PERSIST')).toBe(
      true,
    );
  });

  it('5 — no pre plateau', () => {
    const samples = linearRiseSamples('2026-09-06T08:00:00.000Z', [10, 20, 30, 30], 600);
    expect(detectRawFuelRises({ context, samples }).candidates).toHaveLength(0);
  });

  it('6 — no post plateau yet', () => {
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 16),
      sampleAt('2026-09-06T08:18:00.000Z', 22),
      sampleAt('2026-09-06T08:20:00.000Z', 30),
    ];
    const result = detectRawFuelRises({ context, samples });
    if (result.candidates.length > 0) {
      expect(result.candidates[0].lifecycleState).not.toBe('READY_FOR_PERSIST');
    }
  });

  it('7 — sample gap above threshold yields hold not READY', () => {
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:20:00.000Z', 20),
      sampleAt('2026-09-06T08:50:00.000Z', 30),
      sampleAt('2026-09-06T08:54:00.000Z', 30),
      sampleAt('2026-09-06T08:58:00.000Z', 30),
    ];
    const result = detectRawFuelRises({ context, samples });
    if (result.candidates.length > 0) {
      expect(result.candidates[0].lifecycleState).not.toBe('READY_FOR_PERSIST');
    }
  });

  it('8 — gradual drift without local transition', () => {
    const samples = linearRiseSamples(
      '2026-09-06T08:00:00.000Z',
      [10, 11, 12, 13, 14, 15, 16],
      600,
    );
    expect(detectRawFuelRises({ context, samples }).candidates).toHaveLength(0);
  });

  it('9 — exact duplicates deduped (invariance owns assertion)', () => {
    const base = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 20),
    ];
    const result = detectRawFuelRises({
      context,
      samples: [...base, ...base],
    });
    expect(result.candidates.length).toBeLessThanOrEqual(1);
  });

  it('10 — conflicting duplicate timestamp', () => {
    const samples = [
      sampleAt('2026-09-06T08:00:00.000Z', 10),
      sampleAt('2026-09-06T08:00:00.000Z', 11),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates).toHaveLength(0);
    expect(result.rejectedOrHeld[0]?.reason).toBe('conflicting_duplicate_timestamp');
  });

  it('11 — out-of-order input normalized (invariance owns full proof)', () => {
    const samples = [
      sampleAt('2026-09-06T08:20:00.000Z', 30),
      sampleAt('2026-09-06T08:00:00.000Z', 10),
      sampleAt('2026-09-06T08:05:00.000Z', 10),
      sampleAt('2026-09-06T08:10:00.000Z', 10),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates.length).toBeLessThanOrEqual(1);
  });

  it('12 — NaN absolute fuel', () => {
    const samples = [sampleAt('2026-09-06T08:00:00.000Z', Number.NaN)];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates).toHaveLength(0);
  });

  it('13 — negative absolute fuel', () => {
    const samples = [sampleAt('2026-09-06T08:00:00.000Z', -1)];
    const result = detectRawFuelRises({ context, samples });
    expect(result.rejectedOrHeld[0]?.reason).toBe('invalid_sample');
  });

  it('14 — relative percent outside valid range', () => {
    const samples = [sampleAt('2026-09-06T08:00:00.000Z', null, 150)];
    const result = detectRawFuelRises({
      context: buildDetectionContext({
        absoluteSignalTrust: 'UNKNOWN',
        relativeSignalAvailable: true,
      }),
      samples,
    });
    expect(result.rejectedOrHeld[0]?.reason).toBe('invalid_sample');
  });

  it('15 — absolute detection INADMISSIBLE blocks absolute channel', () => {
    const samples = stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300);
    const result = detectRawFuelRises({
      context: buildDetectionContext({
        absoluteSignalTrust: 'UNKNOWN',
        absoluteDetectionAdmissibility: 'INADMISSIBLE',
        relativeSignalAvailable: false,
      }),
      samples,
    });
    expect(result.candidates).toHaveLength(0);
    expect(result.rejectedOrHeld[0]?.reason).toBe('no_trusted_channel');
  });

  it('16 — absolute detection INADMISSIBLE with UNTRUSTED promotion trust', () => {
    const result = detectRawFuelRises({
      context: buildDetectionContext({
        absoluteSignalTrust: 'UNTRUSTED',
        absoluteDetectionAdmissibility: 'INADMISSIBLE',
      }),
      samples: stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    });
    expect(result.rejectedOrHeld[0]?.reason).toBe('no_trusted_channel');
  });

  it('17 — mixed signal availability uses absolute primary', () => {
    const samples = [
      { timestamp: new Date('2026-09-06T08:00:00.000Z'), absoluteLiters: 10, relativePercent: 20 },
      { timestamp: new Date('2026-09-06T08:05:00.000Z'), absoluteLiters: 10, relativePercent: null },
      { timestamp: new Date('2026-09-06T08:10:00.000Z'), absoluteLiters: 10, relativePercent: null },
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.diagnostics.primaryChannel).toBe('ABSOLUTE_LITERS');
  });

  it('18 — rise at exact scan-window boundary', () => {
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T12:00:00.000Z', 30),
      sampleAt('2026-09-06T12:02:00.000Z', 30),
      sampleAt('2026-09-06T12:04:00.000Z', 30),
    ];
    const result = detectRawFuelRises({
      context: buildDetectionContext({
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      }),
      samples,
    });
    expect(result.candidates.length).toBeLessThanOrEqual(1);
  });

  it('19 — post plateau outside scan window excluded', () => {
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
      sampleAt('2026-09-06T12:30:00.000Z', 30),
      sampleAt('2026-09-06T12:32:00.000Z', 30),
      sampleAt('2026-09-06T12:34:00.000Z', 30),
    ];
    const result = detectRawFuelRises({
      context: buildDetectionContext({
        scanWindowEnd: new Date('2026-09-06T09:00:00.000Z'),
      }),
      samples,
    });
    if (result.candidates.length > 0) {
      expect(result.candidates[0].lifecycleState).not.toBe('READY_FOR_PERSIST');
    }
  });

  it('20 — ambiguous overlapping rises fail closed to non-READY', () => {
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 20),
      sampleAt('2026-09-06T08:18:00.000Z', 12),
      sampleAt('2026-09-06T08:20:00.000Z', 22),
      sampleAt('2026-09-06T08:22:00.000Z', 13),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates.every((c) => c.lifecycleState !== 'READY_FOR_PERSIST')).toBe(
      true,
    );
  });

  it('21 — persistent one-step update (negative: spike rejected)', () => {
    const samples = [
      ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
      sampleAt('2026-09-06T08:16:00.000Z', 30),
      sampleAt('2026-09-06T08:18:00.000Z', 10),
    ];
    const result = detectRawFuelRises({ context, samples });
    expect(result.candidates.every((c) => c.lifecycleState !== 'READY_FOR_PERSIST')).toBe(
      true,
    );
  });
});

/** Case 22 (non-fuel / EV capability gate) deferred to F4 — no F3 detector authority. */

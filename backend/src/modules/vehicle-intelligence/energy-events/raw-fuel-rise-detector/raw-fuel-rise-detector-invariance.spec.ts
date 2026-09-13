import { detectRawFuelRises } from './raw-fuel-rise-detector';
import {
  buildDetectionContext,
  buildDetectorPhysicsContext,
  linearRiseSamples,
  stablePlateauSamples,
} from './testing/raw-fuel-rise-detector-test.util';

function buildRefuelSeries(): ReturnType<typeof stablePlateauSamples> {
  return [
    ...stablePlateauSamples('2026-09-06T08:00:00.000Z', 10, 3, 300),
    ...linearRiseSamples('2026-09-06T08:16:00.000Z', [15, 22, 28, 30], 120),
    ...stablePlateauSamples('2026-09-06T08:28:00.000Z', 30, 4, 120),
  ];
}

describe('raw-fuel-rise-detector invariance', () => {
  it('window invariance — narrow vs wide scan window', () => {
    const samples = buildRefuelSeries();
    const narrow = detectRawFuelRises({
      context: buildDetectorPhysicsContext({
        scanWindowStart: new Date('2026-09-06T08:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T09:00:00.000Z'),
      }),
      samples,
    });
    const wide = detectRawFuelRises({
      context: buildDetectorPhysicsContext({
        scanWindowStart: new Date('2026-09-06T07:00:00.000Z'),
        scanWindowEnd: new Date('2026-09-06T12:00:00.000Z'),
      }),
      samples,
    });
    expect(narrow.candidates).toHaveLength(1);
    expect(wide.candidates).toHaveLength(1);
    expect(narrow.candidates[0].preFuelAbsoluteLiters).toBe(
      wide.candidates[0].preFuelAbsoluteLiters,
    );
    expect(narrow.candidates[0].postFuelAbsoluteLiters).toBe(
      wide.candidates[0].postFuelAbsoluteLiters,
    );
  });

  it('input order invariance', () => {
    const samples = buildRefuelSeries();
    const chronological = detectRawFuelRises({
      context: buildDetectorPhysicsContext(),
      samples,
    });
    const reversed = detectRawFuelRises({
      context: buildDetectorPhysicsContext(),
      samples: [...samples].reverse(),
    });
    const shuffled = detectRawFuelRises({
      context: buildDetectorPhysicsContext(),
      samples: [...samples].sort(() => 0.5 - Math.random()),
    });
    expect(chronological.candidates[0].deltaAbsoluteLiters).toBe(
      reversed.candidates[0].deltaAbsoluteLiters,
    );
    expect(chronological.candidates[0].deltaAbsoluteLiters).toBe(
      shuffled.candidates[0].deltaAbsoluteLiters,
    );
  });

  it('exact duplicate invariance', () => {
    const samples = buildRefuelSeries();
    const base = detectRawFuelRises({ context: buildDetectorPhysicsContext(), samples });
    const duplicated = detectRawFuelRises({
      context: buildDetectorPhysicsContext(),
      samples: [...samples, ...samples],
    });
    expect(base.candidates).toHaveLength(1);
    expect(duplicated.candidates).toHaveLength(1);
  });

  it('mixed channel regression — no mixed numeric vector', () => {
    const samples = [
      { timestamp: new Date('2026-09-06T08:00:00.000Z'), absoluteLiters: 10, relativePercent: 20 },
      { timestamp: new Date('2026-09-06T08:01:00.000Z'), absoluteLiters: 12, relativePercent: null },
      { timestamp: new Date('2026-09-06T08:02:00.000Z'), absoluteLiters: 20, relativePercent: 40 },
    ];
    const result = detectRawFuelRises({ context: buildDetectorPhysicsContext(), samples });
    expect(result.diagnostics.primaryChannel).toBe('ABSOLUTE_LITERS');
    expect(result.candidates.length).toBeLessThanOrEqual(1);
  });
});

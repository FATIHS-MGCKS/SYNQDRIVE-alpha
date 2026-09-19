import {
  evaluateRawFuelRiseSemanticGaps,
  isStrictSampleGapWithinLimit,
} from './raw-fuel-rise-gap-semantics';

const MAX_GAP_MS = 6 * 60 * 1000;

function ts(iso: string): { timestamp: Date } {
  return { timestamp: new Date(iso) };
}

describe('raw-fuel-rise-gap-semantics', () => {
  it('tolerates long PRE_TO_RISE bridge when strict regions are continuous', () => {
    const evaluation = evaluateRawFuelRiseSemanticGaps({
      preSamples: [
        ts('2026-09-19T15:40:26.000Z'),
        ts('2026-09-19T15:44:26.000Z'),
        ts('2026-09-19T15:48:26.000Z'),
      ],
      risePoints: [
        ts('2026-09-19T16:11:24.000Z'),
        ts('2026-09-19T16:13:26.000Z'),
        ts('2026-09-19T16:15:27.000Z'),
      ],
      postSamples: [
        ts('2026-09-19T16:53:59.000Z'),
        ts('2026-09-19T16:56:15.000Z'),
        ts('2026-09-19T16:58:31.000Z'),
      ],
      maxSampleGapMs: MAX_GAP_MS,
    });

    expect(evaluation.preToRiseBridgeGapSeconds).toBeGreaterThan(900);
    expect(evaluation.failedStrictRegion).toBeNull();
    expect(isStrictSampleGapWithinLimit(evaluation, MAX_GAP_MS)).toBe(true);
    expect(evaluation.globalMaxGapSeconds).toBeGreaterThan(900);
  });

  it('fails closed on excessive gap inside rise', () => {
    const evaluation = evaluateRawFuelRiseSemanticGaps({
      preSamples: [
        ts('2026-09-19T15:40:00.000Z'),
        ts('2026-09-19T15:42:00.000Z'),
        ts('2026-09-19T15:44:00.000Z'),
      ],
      risePoints: [
        ts('2026-09-19T15:46:00.000Z'),
        ts('2026-09-19T16:00:00.000Z'),
        ts('2026-09-19T16:02:00.000Z'),
      ],
      postSamples: [],
      maxSampleGapMs: MAX_GAP_MS,
    });

    expect(evaluation.failedStrictRegion).toBe('RISE_INTERNAL');
    expect(isStrictSampleGapWithinLimit(evaluation, MAX_GAP_MS)).toBe(false);
  });
});

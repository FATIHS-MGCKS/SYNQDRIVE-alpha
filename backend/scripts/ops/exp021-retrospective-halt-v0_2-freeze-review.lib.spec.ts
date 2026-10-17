import { evaluateVideoAxesABC } from './exp021-retrospective-halt-v0_2-freeze-review.lib';

describe('evaluateVideoAxesABC axis B', () => {
  it('returns NO when any known positive tacho exists even with unknown seconds (GAP_EVT_008)', () => {
    const axes = evaluateVideoAxesABC({
      totalLabeledSeconds: 54,
      tacho0: 46,
      tacho1to3: 0,
      tacho3to5: 0,
      tachoGt5: 1,
      unknown: 7,
    });
    expect(axes.B_entireWindowContinuousTachoZero).toBe('NO');
    expect(axes.A_tachoZeroSectionInPredictedWindow).toBe('YES');
  });

  it('returns CANNOT_PROVE when only unknowns remain after tacho-0 labels', () => {
    const axes = evaluateVideoAxesABC({
      totalLabeledSeconds: 10,
      tacho0: 8,
      tacho1to3: 0,
      tacho3to5: 0,
      tachoGt5: 0,
      unknown: 2,
    });
    expect(axes.B_entireWindowContinuousTachoZero).toBe('CANNOT_PROVE');
  });

  it('returns YES when all labeled seconds are tacho 0', () => {
    const axes = evaluateVideoAxesABC({
      totalLabeledSeconds: 12,
      tacho0: 12,
      tacho1to3: 0,
      tacho3to5: 0,
      tachoGt5: 0,
      unknown: 0,
    });
    expect(axes.B_entireWindowContinuousTachoZero).toBe('YES');
  });
});

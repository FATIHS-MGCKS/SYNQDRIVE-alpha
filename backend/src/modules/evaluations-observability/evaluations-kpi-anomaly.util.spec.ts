import { classifyInsightCountJump } from './evaluations-kpi-anomaly.util';

describe('classifyInsightCountJump', () => {
  it('returns none when counts are equal', () => {
    expect(classifyInsightCountJump(5, 5)).toBe('none');
  });

  it('flags severe jump from zero baseline', () => {
    expect(classifyInsightCountJump(0, 20)).toBe('severe');
    expect(classifyInsightCountJump(0, 8)).toBe('moderate');
    expect(classifyInsightCountJump(0, 3)).toBe('none');
  });

  it('flags moderate and severe relative jumps', () => {
    expect(classifyInsightCountJump(4, 8)).toBe('moderate');
    expect(classifyInsightCountJump(5, 15)).toBe('severe');
    expect(classifyInsightCountJump(10, 12)).toBe('none');
  });
});

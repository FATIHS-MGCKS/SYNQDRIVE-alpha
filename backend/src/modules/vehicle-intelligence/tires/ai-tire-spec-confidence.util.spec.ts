import { normalizeTireSpecConfidenceScore } from './ai-tire-spec-confidence.util';

describe('normalizeTireSpecConfidenceScore', () => {
  it('maps legacy fractional scores to 0–100', () => {
    expect(normalizeTireSpecConfidenceScore(0.95)).toBe(95);
  });

  it('treats 1 as one percent, not one hundred', () => {
    expect(normalizeTireSpecConfidenceScore(1)).toBe(1);
  });

  it('accepts native 0–100 scores', () => {
    expect(normalizeTireSpecConfidenceScore(95)).toBe(95);
  });

  it('rejects out-of-range values', () => {
    expect(normalizeTireSpecConfidenceScore(150)).toBeNull();
    expect(normalizeTireSpecConfidenceScore(-1)).toBeNull();
  });
});

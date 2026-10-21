import { computeNumericStats, percentileLinear } from './f5-descriptive-statistics';

describe('f5-descriptive-statistics', () => {
  it('returns null stats for empty input', () => {
    const s = computeNumericStats([]);
    expect(s.count).toBe(0);
    expect(s.median).toBeNull();
  });

  it('computes linear interpolation median for two points', () => {
    expect(percentileLinear([1, 3], 0.5)).toBe(2);
  });

  it('handles single row deterministically', () => {
    const s = computeNumericStats([42]);
    expect(s.min).toBe(42);
    expect(s.max).toBe(42);
    expect(s.median).toBe(42);
  });

  it('counts nulls separately', () => {
    const s = computeNumericStats([1, null, undefined, 3]);
    expect(s.nullCount).toBe(2);
    expect(s.count).toBe(2);
  });

  it('ignores non-finite values', () => {
    const s = computeNumericStats([1, Number.NaN, Number.POSITIVE_INFINITY]);
    expect(s.count).toBe(1);
  });
});

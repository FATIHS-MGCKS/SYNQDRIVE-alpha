import { computeDefaultEligibleObservationPercent } from './f5-d4-metrics';

describe('f5-d4-metrics', () => {
  it('F. uses default observation denominator only (not session slices)', () => {
    const eligible = 48;
    const defaultTotal = 48;
    const provisionalSessions = 12;
    const excludedSessions = 5;
    expect(provisionalSessions + excludedSessions).toBeGreaterThan(0);
    expect(computeDefaultEligibleObservationPercent(eligible, defaultTotal)).toBe(100);
    expect(
      computeDefaultEligibleObservationPercent(eligible, eligible + provisionalSessions + excludedSessions),
    ).not.toBe(100);
  });

  it('returns null when default observation total is zero', () => {
    expect(computeDefaultEligibleObservationPercent(0, 0)).toBeNull();
  });
});

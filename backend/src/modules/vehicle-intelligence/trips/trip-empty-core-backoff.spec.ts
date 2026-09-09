import { computeEmptyCoreBackoffMs } from './trip-empty-core-backoff';

describe('computeEmptyCoreBackoffMs', () => {
  it('returns base interval with zero deferrals', () => {
    expect(
      computeEmptyCoreBackoffMs({
        baseIntervalMs: 30_000,
        consecutiveDeferrals: 0,
        backoffBaseMs: 30_000,
        backoffMaxMs: 600_000,
        jitterRatio: 0,
      }),
    ).toBe(30_000);
  });

  it('exponential growth capped at max', () => {
    expect(
      computeEmptyCoreBackoffMs({
        baseIntervalMs: 30_000,
        consecutiveDeferrals: 5,
        backoffBaseMs: 30_000,
        backoffMaxMs: 600_000,
        jitterRatio: 0,
      }),
    ).toBe(480_000);
  });

  it('applies deterministic jitter for tests', () => {
    const delay = computeEmptyCoreBackoffMs({
      baseIntervalMs: 30_000,
      consecutiveDeferrals: 0,
      backoffBaseMs: 30_000,
      backoffMaxMs: 600_000,
      jitterRatio: 0.15,
      jitterSeed: 0.5,
    });
    expect(delay).toBe(30_000);
  });
});

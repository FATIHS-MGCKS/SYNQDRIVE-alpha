import { isInCanaryPercentBucket, stableCanaryHashPercent } from './dimo-provider-canary-hash.util';

describe('dimo-provider-canary-hash.util (S4)', () => {
  it('returns stable bucket for same vehicle across calls', () => {
    const a = stableCanaryHashPercent('vehicle-abc-123');
    const b = stableCanaryHashPercent('vehicle-abc-123');
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(100);
  });

  it('returns different buckets for different vehicles (usually)', () => {
    const a = stableCanaryHashPercent('vehicle-a');
    const b = stableCanaryHashPercent('vehicle-b');
    expect(a).not.toBe(b);
  });

  it('0% canary selects nobody', () => {
    expect(isInCanaryPercentBucket('vehicle-x', 0)).toBe(false);
  });

  it('100% canary selects everybody', () => {
    expect(isInCanaryPercentBucket('vehicle-x', 100)).toBe(true);
  });

  it('percent boundary is deterministic', () => {
    const vehicles = Array.from({ length: 200 }, (_, i) => `veh-${i}`);
    const selected5 = vehicles.filter((v) => isInCanaryPercentBucket(v, 5));
    const selected5Again = vehicles.filter((v) => isInCanaryPercentBucket(v, 5));
    expect(selected5).toEqual(selected5Again);
    expect(selected5.length).toBeGreaterThan(0);
    expect(selected5.length).toBeLessThan(vehicles.length);
  });
});

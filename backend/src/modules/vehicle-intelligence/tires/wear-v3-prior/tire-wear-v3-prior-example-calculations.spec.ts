import {
  priorWearRateIntervalMmPerKm,
  projectTreadMm,
  rateSigmaFromTwoPoints,
} from './tire-wear-v3-prior.math';

/**
 * Verifiable example calculations aligned with Fable P3A review (β=0, prior-only).
 */
describe('tire-wear-v3-prior example calculations', () => {
  it('constant 50 km SUMMER prior: tread drop interval at r∈[0.111,0.143] mm/1000km', () => {
    const life = { lo: 35000, hi: 45000 };
    const rate = priorWearRateIntervalMmPerKm(8.0, 3.0, life);
    const deltaKm = 50;
    const lossLo = rate.lo * deltaKm;
    const lossHi = rate.hi * deltaKm;
    expect(lossLo * 1000).toBeCloseTo(5.56, 1);
    expect(lossHi * 1000).toBeCloseTo(7.14, 1);
  });

  it('Fable T7 calibration spacing: σ_r at 6800 km with 0.85 mm loss and σ_m=0.4', () => {
    const sigmaR = rateSigmaFromTwoPoints(0.85, 6800, 0.4);
    expect(sigmaR).not.toBeNull();
    const rate = 0.85 / 6800;
    const rel = (sigmaR! / rate) * 100;
    expect(rel).toBeGreaterThan(60);
    expect(rel).toBeLessThan(85);
  });

  it('projects from latest measurement anchor, not initial only', () => {
    const tread = projectTreadMm({
      anchorTreadMm: 7.3,
      anchorOdometerKm: 6000,
      currentOdometerKm: 8000,
      rateMmPerKm: { lo: 0.000117, hi: 0.000117 },
    });
    expect(tread.lo).toBeCloseTo(7.07, 2);
    expect(tread.hi).toBeCloseTo(7.07, 2);
  });
});

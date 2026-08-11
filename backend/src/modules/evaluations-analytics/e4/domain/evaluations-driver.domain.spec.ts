import {
  computeDriverInfluence,
  E4_DEFAULT_DRIVER_CONFIG,
  type E4DriverObservationInput,
} from './evaluations-driver.domain';

function obs(driverRef: string, dimension: string, count: number): E4DriverObservationInput {
  return { driverRef, dimension, count };
}

describe('E4 driver influence domain', () => {
  it('emits association factors (never causal) for an adequate sample', () => {
    const result = computeDriverInfluence([
      obs('cust-a', 'CANCELLATIONS', 6),
      obs('cust-b', 'CANCELLATIONS', 4),
    ]);
    expect(result.dimensionsAnalyzed).toEqual(['CANCELLATIONS']);
    expect(result.factors[0].driverRef).toBe('cust-a');
    expect(result.factors[0].relationship).toBe('ASSOCIATED_WITH');
    expect(result.factors[0].associationShare).toBeCloseTo(0.6, 5);
  });

  it('skips a dimension when the total sample is insufficient', () => {
    const result = computeDriverInfluence([obs('cust-a', 'DAMAGE_EVENTS', 2)]);
    expect(result.dimensionsAnalyzed).toEqual([]);
    expect(result.dimensionsSkippedInsufficient).toEqual(['DAMAGE_EVENTS']);
    expect(result.factors).toEqual([]);
  });

  it('excludes a driver below the minimum per-driver sample size', () => {
    const result = computeDriverInfluence([
      obs('cust-a', 'CANCELLATIONS', 5),
      obs('cust-b', 'CANCELLATIONS', 1),
    ]);
    expect(result.factors.map((f) => f.driverRef)).toEqual(['cust-a']);
  });

  it('is deterministic under equal shares (tie-break by driverRef)', () => {
    const result = computeDriverInfluence(
      [obs('cust-b', 'CANCELLATIONS', 4), obs('cust-a', 'CANCELLATIONS', 4)],
      { ...E4_DEFAULT_DRIVER_CONFIG, minSampleSize: 3, minDimensionTotal: 5 },
    );
    expect(result.factors.map((f) => f.driverRef)).toEqual(['cust-a', 'cust-b']);
  });

  it('aggregates repeated rows for the same driver before gating', () => {
    const result = computeDriverInfluence([
      obs('cust-a', 'CANCELLATIONS', 2),
      obs('cust-a', 'CANCELLATIONS', 2),
      obs('cust-b', 'CANCELLATIONS', 4),
    ]);
    expect(result.factors.map((f) => [f.driverRef, f.sampleSize])).toEqual([
      ['cust-a', 4],
      ['cust-b', 4],
    ]);
  });
});

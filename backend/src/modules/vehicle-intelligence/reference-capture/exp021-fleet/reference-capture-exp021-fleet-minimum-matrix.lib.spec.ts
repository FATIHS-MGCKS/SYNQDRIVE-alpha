import { evaluateMinimumMatrix } from './reference-capture-exp021-fleet-minimum-matrix.lib';

describe('reference-capture-exp021-fleet-minimum-matrix.lib', () => {
  it('does not authorize cadence recommendation when matrix is met', () => {
    const result = evaluateMinimumMatrix({
      config: {
        minimumMatrix: {
          minValidCompleteRunsPerVehicle: 1,
          min9060Runs: 1,
          min6090Runs: 1,
          minDistinctVehicles: 1,
        },
      },
      completedRuns: [
        { vehicleId: 'v1', phaseOrderMs: [90_000, 60_000], state: 'COMPLETED' },
        { vehicleId: 'v1', phaseOrderMs: [60_000, 90_000], state: 'COMPLETED' },
      ],
    });
    expect(result.matrixMet).toBe(true);
    expect(result.sufficientForCadenceRecommendation).toBe(false);
    expect(result.productionCadenceChangeAuthorized).toBe(false);
  });
});

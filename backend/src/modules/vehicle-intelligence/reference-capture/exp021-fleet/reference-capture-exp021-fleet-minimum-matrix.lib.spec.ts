import {
  countsTowardPrimaryMinimumMatrix,
  evaluateMinimumMatrix,
  EXP021_STUDY_RUN_CLASSIFICATION,
  validateMinimumMatrixConfig,
  Exp021InvalidMinimumMatrixConfigError,
} from './reference-capture-exp021-fleet-minimum-matrix.lib';

describe('reference-capture-exp021-fleet-minimum-matrix.lib', () => {
  const completeValidRun = {
    vehicleId: 'v1',
    phaseOrderMs: [90_000, 60_000],
    state: 'COMPLETED',
    runClassification: EXP021_STUDY_RUN_CLASSIFICATION.COMPLETE_VALID,
    scientificEligibility: 'ELIGIBLE',
  };

  it('COMPLETE_VALID counts toward primary minimum matrix', () => {
    expect(countsTowardPrimaryMinimumMatrix(completeValidRun)).toBe(true);
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
        completeValidRun,
        { ...completeValidRun, phaseOrderMs: [60_000, 90_000] },
      ],
    });
    expect(result.matrixMet).toBe(true);
    expect(result.details.global9060Runs).toBe(1);
    expect(result.details.global6090Runs).toBe(1);
  });

  it('PARTIAL_VALID does not count toward primary minimum matrix', () => {
    const partialRun = {
      ...completeValidRun,
      state: 'PARTIAL',
      runClassification: EXP021_STUDY_RUN_CLASSIFICATION.PARTIAL_VALID,
    };
    expect(countsTowardPrimaryMinimumMatrix(partialRun)).toBe(false);
    const result = evaluateMinimumMatrix({
      config: {
        minimumMatrix: {
          minValidCompleteRunsPerVehicle: 1,
          min9060Runs: 1,
          min6090Runs: 1,
          minDistinctVehicles: 1,
        },
      },
      completedRuns: [partialRun],
    });
    expect(result.matrixMet).toBe(false);
    expect(result.details.global9060Runs).toBe(0);
    expect(result.details.global6090Runs).toBe(0);
    expect(result.details.distinctVehicles).toBe(0);
  });

  it('COMPLETED + INVALID classification does not count toward primary minimum matrix', () => {
    const invalidRun = {
      ...completeValidRun,
      runClassification: EXP021_STUDY_RUN_CLASSIFICATION.INVALID,
    };
    expect(countsTowardPrimaryMinimumMatrix(invalidRun)).toBe(false);
    const result = evaluateMinimumMatrix({
      config: {
        minimumMatrix: {
          minValidCompleteRunsPerVehicle: 1,
          min9060Runs: 1,
          min6090Runs: 0,
          minDistinctVehicles: 1,
        },
      },
      completedRuns: [invalidRun],
    });
    expect(result.matrixMet).toBe(false);
    expect(result.details.validCompleteRunsPerVehicle).toEqual({});
  });

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
        completeValidRun,
        {
          ...completeValidRun,
          phaseOrderMs: [60_000, 90_000],
        },
      ],
    });
    expect(result.matrixMet).toBe(true);
    expect(result.sufficientForCadenceRecommendation).toBe(false);
    expect(result.productionCadenceChangeAuthorized).toBe(false);
  });

  it('fails closed on invalid minimum-matrix config', () => {
    expect(() =>
      validateMinimumMatrixConfig({
        minimumMatrix: {
          minValidCompleteRunsPerVehicle: -1,
          min9060Runs: 1,
          min6090Runs: 1,
          minDistinctVehicles: 1,
        },
      }),
    ).toThrow(Exp021InvalidMinimumMatrixConfigError);

    const result = evaluateMinimumMatrix({
      config: {
        minimumMatrix: {
          minValidCompleteRunsPerVehicle: 0,
          min9060Runs: 1,
          min6090Runs: 1,
          minDistinctVehicles: 1,
        },
      },
      completedRuns: [completeValidRun, { ...completeValidRun, phaseOrderMs: [60_000, 90_000] }],
    });
    expect(result.configValid).toBe(false);
    expect(result.matrixMet).toBe(false);
  });
});

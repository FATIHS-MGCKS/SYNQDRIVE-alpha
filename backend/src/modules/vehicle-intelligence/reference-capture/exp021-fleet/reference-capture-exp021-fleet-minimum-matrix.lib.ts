import type { Exp021FleetMinimumMatrixConfig, Exp021FleetStudyConfig } from './reference-capture-exp021-fleet.types';
import { EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG } from './reference-capture-exp021-fleet.types';
import { phaseOrderKey } from './reference-capture-exp021-fleet-order-allocator.lib';

export const EXP021_STUDY_RUN_CLASSIFICATION = {
  COMPLETE_VALID: 'COMPLETE_VALID',
  PARTIAL_VALID: 'PARTIAL_VALID',
  INVALID: 'INVALID',
  ABORTED: 'ABORTED',
  SKIPPED: 'SKIPPED',
} as const;

export type Exp021StudyRunClassification =
  (typeof EXP021_STUDY_RUN_CLASSIFICATION)[keyof typeof EXP021_STUDY_RUN_CLASSIFICATION];

export type Exp021MinimumMatrixRunInput = {
  vehicleId: string;
  phaseOrderMs: number[];
  state: string;
  runClassification: string | null;
  scientificEligibility: string | null;
};

export type Exp021MinimumMatrixEvaluation = {
  matrixMet: boolean;
  configValid: boolean;
  sufficientForCadenceRecommendation: false;
  productionCadenceChangeAuthorized: false;
  details: {
    validCompleteRunsPerVehicle: Record<string, number>;
    global9060Runs: number;
    global6090Runs: number;
    distinctVehicles: number;
  };
};

export class Exp021InvalidMinimumMatrixConfigError extends Error {
  readonly code = 'EXP021_INVALID_MINIMUM_MATRIX_CONFIG';

  constructor(message: string) {
    super(message);
    this.name = 'Exp021InvalidMinimumMatrixConfigError';
  }
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value) && value > 0;
}

export function validateMinimumMatrixConfig(
  config: Exp021FleetStudyConfig | null | undefined,
): Exp021FleetMinimumMatrixConfig {
  const raw = config?.minimumMatrix;
  if (!raw) return EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG;

  const fields: Array<[keyof Exp021FleetMinimumMatrixConfig, unknown]> = [
    ['minValidCompleteRunsPerVehicle', raw.minValidCompleteRunsPerVehicle],
    ['min9060Runs', raw.min9060Runs],
    ['min6090Runs', raw.min6090Runs],
    ['minDistinctVehicles', raw.minDistinctVehicles],
  ];

  for (const [name, value] of fields) {
    if (value === undefined) continue;
    if (!isPositiveInteger(value)) {
      throw new Exp021InvalidMinimumMatrixConfigError(
        `Invalid minimumMatrix.${name}: must be a finite positive integer`,
      );
    }
  }

  return {
    minValidCompleteRunsPerVehicle: isPositiveInteger(raw.minValidCompleteRunsPerVehicle)
      ? raw.minValidCompleteRunsPerVehicle
      : EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG.minValidCompleteRunsPerVehicle,
    min9060Runs: isPositiveInteger(raw.min9060Runs)
      ? raw.min9060Runs
      : EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG.min9060Runs,
    min6090Runs: isPositiveInteger(raw.min6090Runs)
      ? raw.min6090Runs
      : EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG.min6090Runs,
    minDistinctVehicles: isPositiveInteger(raw.minDistinctVehicles)
      ? raw.minDistinctVehicles
      : EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG.minDistinctVehicles,
  };
}

export function countsTowardPrimaryMinimumMatrix(run: Exp021MinimumMatrixRunInput): boolean {
  if (run.state !== 'COMPLETED') return false;
  if (run.runClassification !== EXP021_STUDY_RUN_CLASSIFICATION.COMPLETE_VALID) return false;
  if (run.scientificEligibility?.toUpperCase() === 'INELIGIBLE') return false;
  return true;
}

export function evaluateMinimumMatrix(args: {
  config: Exp021FleetStudyConfig | null | undefined;
  completedRuns: Exp021MinimumMatrixRunInput[];
}): Exp021MinimumMatrixEvaluation {
  let thresholds: Exp021FleetMinimumMatrixConfig;
  let configValid = true;
  try {
    thresholds = validateMinimumMatrixConfig(args.config);
  } catch {
    configValid = false;
    thresholds = EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG;
  }

  const key9060 = phaseOrderKey([90_000, 60_000]);
  const key6090 = phaseOrderKey([60_000, 90_000]);

  const validCompleteRunsPerVehicle: Record<string, number> = {};
  let global9060Runs = 0;
  let global6090Runs = 0;
  const vehicles = new Set<string>();

  for (const run of args.completedRuns) {
    if (!countsTowardPrimaryMinimumMatrix(run)) continue;
    vehicles.add(run.vehicleId);
    validCompleteRunsPerVehicle[run.vehicleId] = (validCompleteRunsPerVehicle[run.vehicleId] ?? 0) + 1;
    const orderKey = phaseOrderKey(run.phaseOrderMs);
    if (orderKey === key9060) global9060Runs += 1;
    if (orderKey === key6090) global6090Runs += 1;
  }

  const perVehicleOk = Object.values(validCompleteRunsPerVehicle).every(
    (count) => count >= thresholds.minValidCompleteRunsPerVehicle,
  );
  const matrixMet =
    configValid &&
    perVehicleOk &&
    vehicles.size >= thresholds.minDistinctVehicles &&
    global9060Runs >= thresholds.min9060Runs &&
    global6090Runs >= thresholds.min6090Runs;

  return {
    matrixMet,
    configValid,
    sufficientForCadenceRecommendation: false,
    productionCadenceChangeAuthorized: false,
    details: {
      validCompleteRunsPerVehicle,
      global9060Runs,
      global6090Runs,
      distinctVehicles: vehicles.size,
    },
  };
}

import type { Exp021FleetMinimumMatrixConfig, Exp021FleetStudyConfig } from './reference-capture-exp021-fleet.types';
import { EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG } from './reference-capture-exp021-fleet.types';
import { phaseOrderKey } from './reference-capture-exp021-fleet-order-allocator.lib';

export type Exp021MinimumMatrixEvaluation = {
  matrixMet: boolean;
  sufficientForCadenceRecommendation: false;
  productionCadenceChangeAuthorized: false;
  details: {
    validCompleteRunsPerVehicle: Record<string, number>;
    global9060Runs: number;
    global6090Runs: number;
    distinctVehicles: number;
  };
};

export function resolveMinimumMatrixConfig(
  config: Exp021FleetStudyConfig | null | undefined,
): Exp021FleetMinimumMatrixConfig {
  return { ...EXP021_DEFAULT_MINIMUM_MATRIX_CONFIG, ...(config?.minimumMatrix ?? {}) };
}

export function evaluateMinimumMatrix(args: {
  config: Exp021FleetStudyConfig | null | undefined;
  completedRuns: Array<{ vehicleId: string; phaseOrderMs: number[]; state: string }>;
}): Exp021MinimumMatrixEvaluation {
  const thresholds = resolveMinimumMatrixConfig(args.config);
  const key9060 = phaseOrderKey([90_000, 60_000]);
  const key6090 = phaseOrderKey([60_000, 90_000]);

  const validCompleteRunsPerVehicle: Record<string, number> = {};
  let global9060Runs = 0;
  let global6090Runs = 0;
  const vehicles = new Set<string>();

  for (const run of args.completedRuns) {
    if (run.state !== 'COMPLETED' && run.state !== 'PARTIAL') continue;
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
    perVehicleOk &&
    vehicles.size >= thresholds.minDistinctVehicles &&
    global9060Runs >= thresholds.min9060Runs &&
    global6090Runs >= thresholds.min6090Runs;

  return {
    matrixMet,
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

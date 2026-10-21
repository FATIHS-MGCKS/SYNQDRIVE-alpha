import { readWorkerConcurrency } from '@config/worker-concurrency.util';
import { FLEET_SCENARIOS } from './p12-final5-workload-model';
import {
  buildWorkloadModelRow,
  consumerCapacityJobsPerMinute,
  requiredConcurrency,
} from './p12-final5-workload-model';

/**
 * Maximum CONNECTED fleet size certified for current single-PM2 production
 * with conservative env tuning. Not a provider quota — load-stability envelope only.
 */
export const CURRENT_PROD_CERTIFIED_FLEET_ENVELOPE_N = 100;

/** Fleet sizes used for current-production release planning (S1 normal mix). */
export const CURRENT_PROD_FLEET_SIZES = [10, 25, 50, 100, 250] as const;

export type CurrentProdFleetSize = (typeof CURRENT_PROD_FLEET_SIZES)[number];

export interface CurrentProdFleetLoadRow {
  fleetSize: number;
  snapshotEnqueuePerMinute: number;
  capacityAtConcurrency5P50_8s: number;
  capacityAtConcurrency5P95_15s: number;
  capacityAtConcurrency5Slow30s: number;
  backlogGrowthPerMinuteAtConcurrency5P50_8s: number;
  fastReconciliationCallsPerHour: number;
  totalDimoRequestsPerMinute: number;
  /** Minimum concurrency for steady-state at P50 8s (SAFE_FOR_CURRENT_LOAD). */
  minConcurrencyP50_8s: number;
  /** +20% headroom at P50 8s. */
  minConcurrencyP50_8sHeadroom20: number;
  /** Whether default WORKER_SNAPSHOT_CONCURRENCY=5 keeps up at P50 8s. */
  stableAtDefaultConcurrency5: boolean;
}

export interface FleetEnvelopeEvaluation {
  connectedVehicleCount: number;
  withinCertifiedEnvelope: boolean;
  snapshotConcurrency: number;
  recommendedSnapshotConcurrency: number;
  stableAtCurrentConcurrency: boolean;
  warnings: string[];
}

export function buildCurrentProdFleetLoadRow(
  fleetSize: number,
): CurrentProdFleetLoadRow {
  const model = buildWorkloadModelRow({
    fleetSize,
    scenario: FLEET_SCENARIOS.S1,
  });
  const capacityP50 = consumerCapacityJobsPerMinute(5, 8);
  const capacityP95 = consumerCapacityJobsPerMinute(5, 15);
  const capacitySlow = consumerCapacityJobsPerMinute(5, 30);
  const backlogGrowth = model.snapshotEnqueuePerMinute - capacityP50;

  return {
    fleetSize,
    snapshotEnqueuePerMinute: model.snapshotEnqueuePerMinute,
    capacityAtConcurrency5P50_8s: capacityP50,
    capacityAtConcurrency5P95_15s: capacityP95,
    capacityAtConcurrency5Slow30s: capacitySlow,
    backlogGrowthPerMinuteAtConcurrency5P50_8s: backlogGrowth,
    fastReconciliationCallsPerHour: model.fastReconciliationCallsPerHour,
    totalDimoRequestsPerMinute: model.totalDimoRequestsPerMinute,
    minConcurrencyP50_8s: model.requiredSnapshotConcurrency.p50_8s,
    minConcurrencyP50_8sHeadroom20:
      model.requiredSnapshotConcurrencyHeadroom20.p50_8s,
    stableAtDefaultConcurrency5: backlogGrowth <= 0,
  };
}

export function buildCurrentProdFleetLoadTable(): CurrentProdFleetLoadRow[] {
  return CURRENT_PROD_FLEET_SIZES.map(buildCurrentProdFleetLoadRow);
}

/**
 * Conservative recommendation for current production.
 * SAFE_FOR_CURRENT_LOAD — not CERTIFIED_PROVIDER_SAFE (provider ceiling unknown).
 */
export function recommendSnapshotConcurrencyForFleet(
  fleetSize: number,
  headroomMultiplier = 1.2,
): number {
  const row = buildCurrentProdFleetLoadRow(fleetSize);
  const base = requiredConcurrency(row.snapshotEnqueuePerMinute, 8, 1);
  return Math.ceil(base * headroomMultiplier);
}

export function evaluateFleetEnvelope(args: {
  connectedVehicleCount: number;
  snapshotConcurrency?: number;
}): FleetEnvelopeEvaluation {
  const snapshotConcurrency =
    args.snapshotConcurrency ??
    readWorkerConcurrency('WORKER_SNAPSHOT_CONCURRENCY', 5);
  const row = buildCurrentProdFleetLoadRow(args.connectedVehicleCount);
  const capacity = consumerCapacityJobsPerMinute(snapshotConcurrency, 8);
  const stableAtCurrentConcurrency =
    row.snapshotEnqueuePerMinute <= capacity;
  const recommendedSnapshotConcurrency = recommendSnapshotConcurrencyForFleet(
    args.connectedVehicleCount,
  );

  const warnings: string[] = [];
  if (args.connectedVehicleCount > CURRENT_PROD_CERTIFIED_FLEET_ENVELOPE_N) {
    warnings.push(
      `CONNECTED fleet ${args.connectedVehicleCount} exceeds certified envelope N=${CURRENT_PROD_CERTIFIED_FLEET_ENVELOPE_N}`,
    );
  }
  if (!stableAtCurrentConcurrency) {
    warnings.push(
      `Snapshot enqueue ${row.snapshotEnqueuePerMinute.toFixed(1)}/min exceeds capacity ${capacity.toFixed(1)}/min at concurrency=${snapshotConcurrency}`,
    );
  }
  if (snapshotConcurrency < recommendedSnapshotConcurrency) {
    warnings.push(
      `WORKER_SNAPSHOT_CONCURRENCY=${snapshotConcurrency} below recommended ${recommendedSnapshotConcurrency} for fleet N=${args.connectedVehicleCount}`,
    );
  }

  return {
    connectedVehicleCount: args.connectedVehicleCount,
    withinCertifiedEnvelope:
      args.connectedVehicleCount <= CURRENT_PROD_CERTIFIED_FLEET_ENVELOPE_N,
    snapshotConcurrency,
    recommendedSnapshotConcurrency,
    stableAtCurrentConcurrency,
    warnings,
  };
}

/** Expected PM2 restart observation gap before resume-backfill (from scheduler). */
export const DEPLOY_RESTART_SUSPEND_THRESHOLD_MS = 3 * 60_000;

export const DEPLOY_TRANSITION_MODEL = {
  pm2Mode: 'fork',
  pm2AppName: 'synqdrive',
  rollingDeploy: false,
  bootCheckExitsBeforeListen: true,
  canTwoSchedulersOverlapDuringNormalDeploy: false,
  expectedSchedulerGapSeconds: '12–60',
  resumeBackfillThresholdMs: DEPLOY_RESTART_SUSPEND_THRESHOLD_MS,
} as const;

import type { FleetTierDistribution } from './simulate-snapshot-polling-load';
import { simulateSnapshotPollingLoad } from './simulate-snapshot-polling-load';
import { DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG } from './snapshot-polling-tier.config';
import { SnapshotPollingTier } from './snapshot-polling-tier.types';
import { estimateFastReconciliationCohortSize } from './fast-reconciliation-cohort';

export type FleetScenarioId = 'S1' | 'S2' | 'S3';

export interface FleetScenario {
  id: FleetScenarioId;
  label: string;
  distribution: FleetTierDistribution;
}

export const FLEET_SCENARIOS: Record<FleetScenarioId, FleetScenario> = {
  S1: {
    id: 'S1',
    label: 'normal (5/15/60/20)',
    distribution: {
      [SnapshotPollingTier.ACTIVE_DRIVING]: 0.05,
      [SnapshotPollingTier.RECENTLY_ACTIVE]: 0.15,
      [SnapshotPollingTier.RESTING_STANDBY]: 0.6,
      [SnapshotPollingTier.LONG_IDLE]: 0.2,
    },
  },
  S2: {
    id: 'S2',
    label: 'busy (20/30/40/10)',
    distribution: {
      [SnapshotPollingTier.ACTIVE_DRIVING]: 0.2,
      [SnapshotPollingTier.RECENTLY_ACTIVE]: 0.3,
      [SnapshotPollingTier.RESTING_STANDBY]: 0.4,
      [SnapshotPollingTier.LONG_IDLE]: 0.1,
    },
  },
  S3: {
    id: 'S3',
    label: 'extreme (50/30/20/0)',
    distribution: {
      [SnapshotPollingTier.ACTIVE_DRIVING]: 0.5,
      [SnapshotPollingTier.RECENTLY_ACTIVE]: 0.3,
      [SnapshotPollingTier.RESTING_STANDBY]: 0.2,
      [SnapshotPollingTier.LONG_IDLE]: 0,
    },
  },
};

export const FLEET_SIZES = [100, 250, 500, 1000] as const;

export const SERVICE_TIME_SECONDS = {
  p50_2s: 2,
  p50_4s: 4,
  p50_8s: 8,
  p95_15s: 15,
  provider_slow_30s: 30,
} as const;

export type ServiceTimeKey = keyof typeof SERVICE_TIME_SECONDS;

export interface WorkloadModelRow {
  fleetSize: number;
  scenario: FleetScenarioId;
  snapshotEnqueuePerMinute: number;
  snapshotProviderCallsPerMinute: number;
  activeTickCallsPerMinute: number;
  fastReconciliationCallsPerHour: number;
  warmReconciliationCallsPerHour: number;
  energyCallsPerHour: number;
  totalDimoRequestsPerMinute: number;
  snapshotBacklogGrowthPerMinuteAtConcurrency5: number;
  requiredSnapshotConcurrency: Record<ServiceTimeKey, number>;
  requiredSnapshotConcurrencyHeadroom20: Record<ServiceTimeKey, number>;
  requiredSnapshotConcurrencyHeadroom50: Record<ServiceTimeKey, number>;
}

/** DIMO GraphQL calls per ACTIVE_TICK job (parallel within one worker slot). */
export const ACTIVE_TICK_DIMO_CALLS_PER_JOB = 3;

/** Worst-case DIMO calls per fast reconciliation vehicle (segments + energy). */
export const RECONCILE_DIMO_CALLS_PER_VEHICLE = 5;

/** Fast tier runs 4 times per hour. */
export const FAST_RECONCILIATION_RUNS_PER_HOUR = 4;

/** Warm tier runs every 4 hours. */
export const WARM_RECONCILIATION_RUNS_PER_HOUR = 0.25;

/** Energy is step 5 of reconcileWindow — counted separately for observability. */
export const ENERGY_CALLS_PER_RECONCILE_VEHICLE = 2;

function buildTierCounts(
  fleetSize: number,
  fractions: FleetScenario['distribution'],
): FleetTierDistribution {
  const active = Math.round(fleetSize * fractions[SnapshotPollingTier.ACTIVE_DRIVING]);
  const recent = Math.round(fleetSize * fractions[SnapshotPollingTier.RECENTLY_ACTIVE]);
  const standby = Math.round(fleetSize * fractions[SnapshotPollingTier.RESTING_STANDBY]);
  let longIdle = fleetSize - active - recent - standby;
  if (longIdle < 0) longIdle = 0;
  return {
    [SnapshotPollingTier.ACTIVE_DRIVING]: active,
    [SnapshotPollingTier.RECENTLY_ACTIVE]: recent,
    [SnapshotPollingTier.RESTING_STANDBY]: standby,
    [SnapshotPollingTier.LONG_IDLE]: longIdle,
  };
}

export function requiredConcurrency(
  jobsPerMinute: number,
  avgJobSeconds: number,
  headroomMultiplier = 1,
): number {
  const arrivalPerSecond = jobsPerMinute / 60;
  return Math.ceil(arrivalPerSecond * avgJobSeconds * headroomMultiplier);
}

export function consumerCapacityJobsPerMinute(
  concurrency: number,
  avgJobSeconds: number,
): number {
  return (concurrency * 60) / avgJobSeconds;
}

/**
 * Deterministic P1.2 workload model for production-scale gate audits.
 * Assumes steady-state tier polling and worst-case ACTIVE_DRIVING → ACTIVE_TICK mapping.
 */
export function buildWorkloadModelRow(args: {
  fleetSize: number;
  scenario: FleetScenario;
  snapshotConcurrencyDefault?: number;
}): WorkloadModelRow {
  const distribution = buildTierCounts(args.fleetSize, args.scenario.distribution);
  const snapshot = simulateSnapshotPollingLoad({
    fleetSize: args.fleetSize,
    distribution,
    config: DEFAULT_SNAPSHOT_POLLING_TIER_CONFIG,
  });

  const activeDrivingCount = distribution[SnapshotPollingTier.ACTIVE_DRIVING];
  // ACTIVE_TICK every 30s per active trip × 3 parallel GQL calls.
  const activeTickCallsPerMinute =
    activeDrivingCount * 2 * ACTIVE_TICK_DIMO_CALLS_PER_JOB;

  const fastCohort = estimateFastReconciliationCohortSize({
    fleetSize: args.fleetSize,
    activeTripFraction: args.scenario.distribution[SnapshotPollingTier.ACTIVE_DRIVING],
    recentActivityFraction:
      args.scenario.distribution[SnapshotPollingTier.RECENTLY_ACTIVE],
  });

  const fastReconciliationCallsPerHour =
    fastCohort *
    RECONCILE_DIMO_CALLS_PER_VEHICLE *
    FAST_RECONCILIATION_RUNS_PER_HOUR;

  const warmReconciliationCallsPerHour =
    args.fleetSize *
    RECONCILE_DIMO_CALLS_PER_VEHICLE *
    WARM_RECONCILIATION_RUNS_PER_HOUR;

  const energyCallsPerHour =
    (fastCohort * FAST_RECONCILIATION_RUNS_PER_HOUR +
      args.fleetSize * WARM_RECONCILIATION_RUNS_PER_HOUR) *
    ENERGY_CALLS_PER_RECONCILE_VEHICLE;

  const reconcileCallsPerMinute =
    (fastReconciliationCallsPerHour + warmReconciliationCallsPerHour) / 60;

  const snapshotProviderCallsPerMinute = snapshot.enqueuesPerMinute;
  const totalDimoRequestsPerMinute =
    snapshotProviderCallsPerMinute +
    activeTickCallsPerMinute +
    reconcileCallsPerMinute;

  const defaultConcurrency = args.snapshotConcurrencyDefault ?? 5;
  const capacityAtDefault = consumerCapacityJobsPerMinute(defaultConcurrency, 8);
  const snapshotBacklogGrowthPerMinuteAtConcurrency5 =
    snapshot.enqueuesPerMinute - capacityAtDefault;

  const requiredSnapshotConcurrency = {} as WorkloadModelRow['requiredSnapshotConcurrency'];
  const requiredSnapshotConcurrencyHeadroom20 =
    {} as WorkloadModelRow['requiredSnapshotConcurrencyHeadroom20'];
  const requiredSnapshotConcurrencyHeadroom50 =
    {} as WorkloadModelRow['requiredSnapshotConcurrencyHeadroom50'];

  for (const [key, seconds] of Object.entries(SERVICE_TIME_SECONDS) as Array<
    [ServiceTimeKey, number]
  >) {
    requiredSnapshotConcurrency[key] = requiredConcurrency(
      snapshot.enqueuesPerMinute,
      seconds,
    );
    requiredSnapshotConcurrencyHeadroom20[key] = requiredConcurrency(
      snapshot.enqueuesPerMinute,
      seconds,
      1.2,
    );
    requiredSnapshotConcurrencyHeadroom50[key] = requiredConcurrency(
      snapshot.enqueuesPerMinute,
      seconds,
      1.5,
    );
  }

  return {
    fleetSize: args.fleetSize,
    scenario: args.scenario.id,
    snapshotEnqueuePerMinute: snapshot.enqueuesPerMinute,
    snapshotProviderCallsPerMinute,
    activeTickCallsPerMinute,
    fastReconciliationCallsPerHour,
    warmReconciliationCallsPerHour,
    energyCallsPerHour,
    totalDimoRequestsPerMinute,
    snapshotBacklogGrowthPerMinuteAtConcurrency5,
    requiredSnapshotConcurrency,
    requiredSnapshotConcurrencyHeadroom20,
    requiredSnapshotConcurrencyHeadroom50,
  };
}

export function buildWorkloadMatrix(): WorkloadModelRow[] {
  const rows: WorkloadModelRow[] = [];
  for (const fleetSize of FLEET_SIZES) {
    for (const scenario of Object.values(FLEET_SCENARIOS)) {
      rows.push(buildWorkloadModelRow({ fleetSize, scenario }));
    }
  }
  return rows;
}

/** Process-local upper bound on concurrent DIMO HTTP calls (single PM2 instance). */
export function maxProcessLocalDimoConcurrency(args: {
  snapshotConcurrency: number;
  tripTrackingConcurrency: number;
  reconcileOverlap?: number;
}): number {
  const reconcileOverlap = args.reconcileOverlap ?? 1;
  return (
    args.snapshotConcurrency +
    args.tripTrackingConcurrency * ACTIVE_TICK_DIMO_CALLS_PER_JOB +
    reconcileOverlap
  );
}

import { TripDetectionState, type Prisma } from '@prisma/client';

/** FSM states that imply ongoing or imminent trip activity. */
export const ACTIVE_TRIP_DETECTION_STATES: TripDetectionState[] = [
  TripDetectionState.POSSIBLE_START,
  TripDetectionState.ACTIVE_TRIP,
  TripDetectionState.IDLE_WITHIN_TRIP,
  TripDetectionState.POSSIBLE_END,
];

export interface FastReconciliationCohortConfig {
  /** Wall-clock recency window for fast repair eligibility. */
  recencyMs: number;
  /** 0 = unlimited vehicles per fast-repair tick. */
  maxVehiclesPerRun: number;
}

export const DEFAULT_FAST_RECONCILIATION_COHORT_CONFIG: FastReconciliationCohortConfig =
  {
    recencyMs: 60 * 60_000,
    maxVehiclesPerRun: 0,
  };

export function loadFastReconciliationCohortConfig(
  env: NodeJS.ProcessEnv = process.env,
): FastReconciliationCohortConfig {
  const recencyMs = parsePositiveInt(env.WORKER_FAST_RECONCILIATION_RECENCY_MS, 60 * 60_000);
  const maxVehiclesPerRun = parseNonNegativeInt(
    env.WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN,
    0,
  );
  return { recencyMs, maxVehiclesPerRun };
}

/**
 * Fast reconciliation targets genuinely recent operational activity.
 *
 * `providerFetchedAt` is intentionally excluded: P1.2 LONG_IDLE polls every
 * 30min and would keep essentially the entire CONNECTED scheduler cohort
 * eligible on every 15min fast pass.
 */
export function buildFastReconciliationWhere(
  recencyThreshold: Date,
): Prisma.VehicleLatestStateWhereInput {
  return {
    OR: [
      { lastSeenAt: { gte: recencyThreshold } },
      {
        vehicle: {
          tripDetectionState: {
            OR: [
              { lastActivityAt: { gte: recencyThreshold } },
              { state: { in: ACTIVE_TRIP_DETECTION_STATES } },
            ],
          },
        },
      },
    ],
  };
}

export function applyFastReconciliationVehicleCap(
  vehicleIds: string[],
  maxVehiclesPerRun: number,
): string[] {
  if (maxVehiclesPerRun <= 0 || vehicleIds.length <= maxVehiclesPerRun) {
    return vehicleIds;
  }
  return vehicleIds.slice(0, maxVehiclesPerRun);
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = parseInt(raw ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

/**
 * Deterministic cohort-size model for audit simulations.
 * Does not query the database — models expected eligibility from fleet mix.
 */
export function estimateFastReconciliationCohortSize(args: {
  fleetSize: number;
  activeTripFraction?: number;
  recentActivityFraction?: number;
}): number {
  const activeTripFraction = args.activeTripFraction ?? 0.05;
  const recentActivityFraction = args.recentActivityFraction ?? 0.15;
  const activeTrips = Math.round(args.fleetSize * activeTripFraction);
  const recentActivity = Math.round(args.fleetSize * recentActivityFraction);
  // Union upper bound (ignores overlap — conservative for load estimates).
  return Math.min(args.fleetSize, activeTrips + recentActivity);
}

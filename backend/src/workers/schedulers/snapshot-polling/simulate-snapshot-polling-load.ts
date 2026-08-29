import type { SnapshotPollingTierConfig } from './snapshot-polling-tier.config';
import { SnapshotPollingTier } from './snapshot-polling-tier.types';

export interface FleetTierDistribution {
  [SnapshotPollingTier.ACTIVE_DRIVING]: number;
  [SnapshotPollingTier.RECENTLY_ACTIVE]: number;
  [SnapshotPollingTier.RESTING_STANDBY]: number;
  [SnapshotPollingTier.LONG_IDLE]: number;
}

export interface SnapshotPollingSimulationResult {
  fleetSize: number;
  schedulerTickMs: number;
  ticksPerMinute: number;
  tierCounts: FleetTierDistribution;
  enqueuesPerTick: number;
  enqueuesPerMinute: number;
  legacyEnqueuesPerMinute: number;
  reductionFactor: number;
}

/**
 * Deterministic scheduler simulation for mixed-fleet load modeling.
 *
 * Assumes each vehicle was polled at the start of the simulation window so
 * tier intervals govern the first due time. This models steady-state enqueue
 * rate after warm-up — conservative for load estimates.
 */
export function simulateSnapshotPollingLoad(args: {
  fleetSize: number;
  distribution: FleetTierDistribution;
  config: SnapshotPollingTierConfig;
  schedulerTickMs?: number;
}): SnapshotPollingSimulationResult {
  const schedulerTickMs = args.schedulerTickMs ?? 30_000;
  const ticksPerMinute = 60_000 / schedulerTickMs;

  const tierCounts: FleetTierDistribution = { ...args.distribution };
  const totalDistributed = Object.values(tierCounts).reduce((a, b) => a + b, 0);
  if (totalDistributed !== args.fleetSize) {
    throw new Error(
      `distribution sum ${totalDistributed} !== fleetSize ${args.fleetSize}`,
    );
  }

  let enqueuesPerTick = 0;
  for (const [tier, count] of Object.entries(tierCounts) as Array<
    [keyof FleetTierDistribution, number]
  >) {
    const intervalMs = args.config.intervalMsByTier[tier];
    const duePerTick = count * (schedulerTickMs / intervalMs);
    enqueuesPerTick += duePerTick;
  }

  const enqueuesPerMinute = enqueuesPerTick * ticksPerMinute;
  const legacyEnqueuesPerMinute = args.fleetSize * ticksPerMinute;

  return {
    fleetSize: args.fleetSize,
    schedulerTickMs,
    ticksPerMinute,
    tierCounts,
    enqueuesPerTick,
    enqueuesPerMinute,
    legacyEnqueuesPerMinute,
    reductionFactor: legacyEnqueuesPerMinute / Math.max(enqueuesPerMinute, 1),
  };
}

/** Audit-model mixed fleet: 5% / 15% / 60% / 20%. */
export function buildAuditMixedFleetDistribution(
  fleetSize: number,
): FleetTierDistribution {
  const active = Math.round(fleetSize * 0.05);
  const recent = Math.round(fleetSize * 0.15);
  const standby = Math.round(fleetSize * 0.6);
  let longIdle = fleetSize - active - recent - standby;
  if (longIdle < 0) {
    longIdle = 0;
  }

  return {
    [SnapshotPollingTier.ACTIVE_DRIVING]: active,
    [SnapshotPollingTier.RECENTLY_ACTIVE]: recent,
    [SnapshotPollingTier.RESTING_STANDBY]: standby,
    [SnapshotPollingTier.LONG_IDLE]: longIdle,
  };
}

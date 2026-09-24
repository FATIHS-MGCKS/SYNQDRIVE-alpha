import { createHash } from 'crypto';
import { getBatteryV2ReconciliationIntervalMs } from '@config/battery-health-v2.config';
import type { HvErdReconcileEligibilityCategory } from './hv-erd-reconcile-eligibility.policy';

/** Fixed partition count — every partition is visited exactly once every this many period ticks. */
export const HV_RECHARGE_PERIODIC_PARTITION_COUNT = 12;

/** @deprecated E4.1 — pre-truncation scan multiplier; retained for audit references only. */
export const HV_RECHARGE_PERIODIC_FAIRNESS_SLICES = HV_RECHARGE_PERIODIC_PARTITION_COUNT;
/** @deprecated E4.1 — pre-truncation scan multiplier; retained for audit references only. */
export const HV_RECHARGE_PERIODIC_MAX_SCAN_MULTIPLIER = 12;

export interface HvRechargePeriodicTargetCandidate {
  vehicleId: string;
  organizationId: string;
  category: HvErdReconcileEligibilityCategory;
}

export interface HvRechargePeriodicFairnessFrame {
  periodIndex: number;
  activePartition: number;
  subRotation: number;
  partitionCount: number;
  batchSize: number;
  intervalMs: number;
}

const CATEGORY_PRIORITY: Record<HvErdReconcileEligibilityCategory, number> = {
  ongoing_hv_charge_session: 0,
  native_recharge_capability: 1,
  telemetry_fallback_capability: 2,
};

export function computeHvRechargePeriodicPeriodIndex(
  evaluatedAt: Date,
  intervalMs: number = getBatteryV2ReconciliationIntervalMs(),
): number {
  return Math.floor(evaluatedAt.getTime() / intervalMs);
}

export function computeHvRechargePeriodicFairnessFrame(input: {
  evaluatedAt: Date;
  batchSize: number;
  intervalMs?: number;
  partitionCount?: number;
}): HvRechargePeriodicFairnessFrame {
  const intervalMs = input.intervalMs ?? getBatteryV2ReconciliationIntervalMs();
  const partitionCount = input.partitionCount ?? HV_RECHARGE_PERIODIC_PARTITION_COUNT;
  const periodIndex = computeHvRechargePeriodicPeriodIndex(input.evaluatedAt, intervalMs);
  const activePartition = periodIndex % partitionCount;
  const subRotation = Math.floor(periodIndex / partitionCount);
  return {
    periodIndex,
    activePartition,
    subRotation,
    partitionCount,
    batchSize: input.batchSize,
    intervalMs,
  };
}

/**
 * Deterministic vehicle → partition assignment (matches PostgreSQL md5 prefix mod).
 * Not derived from period bucket hash — survives process restart.
 */
export function stableVehiclePartition(vehicleId: string, partitionCount: number): number {
  const hex = createHash('md5').update(vehicleId, 'utf8').digest('hex').slice(0, 8);
  return (parseInt(hex, 16) >>> 0) % partitionCount;
}

/**
 * Worst-case wait bound (period ticks) for any eligible vehicle in a fleet of `eligibleCount`.
 * Derived from: partition rotation (P ticks) × within-partition batch rotation ceil(n/B).
 */
export function computeHvRechargePeriodicMaxWaitBoundTicks(input: {
  eligibleCount: number;
  batchSize: number;
  partitionCount?: number;
}): number {
  const partitionCount = input.partitionCount ?? HV_RECHARGE_PERIODIC_PARTITION_COUNT;
  const batchSize = Math.max(1, input.batchSize);
  const eligibleCount = Math.max(0, input.eligibleCount);
  if (eligibleCount === 0) return 0;
  // Worst case: all eligible vehicles share one partition → P ticks per full batch sweep.
  return partitionCount * Math.ceil(eligibleCount / batchSize);
}

export function selectHvRechargePeriodicTargets(
  eligible: HvRechargePeriodicTargetCandidate[],
  frame: HvRechargePeriodicFairnessFrame,
): HvRechargePeriodicTargetCandidate[] {
  if (frame.batchSize <= 0 || eligible.length === 0) return [];

  const deduped = new Map<string, HvRechargePeriodicTargetCandidate>();
  for (const row of eligible) {
    const existing = deduped.get(row.vehicleId);
    if (
      !existing ||
      CATEGORY_PRIORITY[row.category] < CATEGORY_PRIORITY[existing.category]
    ) {
      deduped.set(row.vehicleId, row);
    }
  }

  const inPartition = [...deduped.values()].filter(
    (row) =>
      stableVehiclePartition(row.vehicleId, frame.partitionCount) === frame.activePartition,
  );

  inPartition.sort((a, b) => {
    const p = CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category];
    if (p !== 0) return p;
    return a.vehicleId.localeCompare(b.vehicleId);
  });

  if (inPartition.length === 0) return [];

  const n = inPartition.length;
  const start = (frame.subRotation * frame.batchSize) % n;
  const out: HvRechargePeriodicTargetCandidate[] = [];
  for (let i = 0; i < Math.min(frame.batchSize, n); i += 1) {
    out.push(inPartition[(start + i) % n]);
  }
  return out;
}

/** @deprecated E4.1 — hash(periodBucket) slice fairness; use partition rotation instead. */
export function selectFairPeriodicReconcileTargets(
  candidates: HvRechargePeriodicTargetCandidate[],
  batchSize: number,
  periodBucket: string,
): HvRechargePeriodicTargetCandidate[] {
  const partitionCount = HV_RECHARGE_PERIODIC_PARTITION_COUNT;
  const periodIndex = Number.parseInt(periodBucket, 10);
  const safeIndex = Number.isFinite(periodIndex) ? periodIndex : 0;
  const frame: HvRechargePeriodicFairnessFrame = {
    periodIndex: safeIndex,
    activePartition: safeIndex % partitionCount,
    subRotation: Math.floor(safeIndex / partitionCount),
    partitionCount,
    batchSize,
    intervalMs: getBatteryV2ReconciliationIntervalMs(),
  };
  return selectHvRechargePeriodicTargets(candidates, frame);
}

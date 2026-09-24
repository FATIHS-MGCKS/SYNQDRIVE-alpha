import { createHash } from 'crypto';
import type { HvErdReconcileEligibilityCategory } from './hv-erd-reconcile-eligibility.policy';

export const HV_RECHARGE_PERIODIC_FAIRNESS_SLICES = 12;
export const HV_RECHARGE_PERIODIC_MAX_SCAN_MULTIPLIER = 12;

export interface HvRechargePeriodicTargetCandidate {
  vehicleId: string;
  organizationId: string;
  category: HvErdReconcileEligibilityCategory;
}

function stableSlice(value: string, slices: number): number {
  const digest = createHash('sha256').update(value).digest();
  const n = digest.readUInt32BE(0);
  return n % slices;
}

/**
 * Deterministic rotating slice selection — bounded scan with no in-memory cursor.
 * Over `slices` consecutive period buckets, every candidate in the scan window is eligible for selection.
 */
export function selectFairPeriodicReconcileTargets(
  candidates: HvRechargePeriodicTargetCandidate[],
  batchSize: number,
  periodBucket: string,
  slices: number = HV_RECHARGE_PERIODIC_FAIRNESS_SLICES,
): HvRechargePeriodicTargetCandidate[] {
  if (batchSize <= 0 || candidates.length === 0) return [];

  const activeSlice = stableSlice(periodBucket, slices);
  const priority: Record<HvErdReconcileEligibilityCategory, number> = {
    ongoing_hv_charge_session: 0,
    native_recharge_capability: 1,
    telemetry_fallback_capability: 2,
  };

  const deduped = new Map<string, HvRechargePeriodicTargetCandidate>();
  for (const row of candidates) {
    const existing = deduped.get(row.vehicleId);
    if (!existing || priority[row.category] < priority[existing.category]) {
      deduped.set(row.vehicleId, row);
    }
  }

  const sorted = [...deduped.values()].sort((a, b) => {
    const p = priority[a.category] - priority[b.category];
    if (p !== 0) return p;
    return a.vehicleId.localeCompare(b.vehicleId);
  });

  const inSlice = sorted.filter(
    (row) => stableSlice(row.vehicleId, slices) === activeSlice,
  );

  if (inSlice.length > 0) {
    const inSliceSorted = [...inSlice].sort((a, b) =>
      a.vehicleId.localeCompare(b.vehicleId),
    );
    const start = stableSlice(`${periodBucket}:${activeSlice}`, inSliceSorted.length);
    return takeRotatingWindow(inSliceSorted, batchSize, start);
  }

  return takeRotatingWindow(
    sorted,
    batchSize,
    stableSlice(periodBucket, sorted.length),
  );
}

function takeRotatingWindow<T>(
  sorted: T[],
  batchSize: number,
  startIndex: number,
): T[] {
  if (sorted.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < Math.min(batchSize, sorted.length); i += 1) {
    out.push(sorted[(startIndex + i) % sorted.length]);
  }
  return out;
}

export function maxPeriodicCandidateScanSize(batchSize: number): number {
  return Math.max(batchSize, batchSize * HV_RECHARGE_PERIODIC_MAX_SCAN_MULTIPLIER);
}

import { createHash } from 'node:crypto';
import { REPAIR_TYPES } from './reconciliation.types';

/**
 * Canonical durable identity for one semantic INTRA_TRIP_GAP_SPLIT repair.
 *
 * Stable across scheduler tiers, BullMQ retries, process restarts, and replica
 * changes. Identity is the vehicle plus the absolute gap boundary timestamps
 * (first segment end / second segment start) — not the mutable trip row id,
 * which changes after the first split mutates the parent.
 */
export function buildIntraTripGapSplitRepairAuditId(
  vehicleId: string,
  gapFirstEndAt: Date,
  gapSecondStartAt: Date,
): string {
  const digest = createHash('sha256')
    .update(
      [
        vehicleId,
        REPAIR_TYPES.INTRA_TRIP_GAP_SPLIT,
        gapFirstEndAt.toISOString(),
        gapSecondStartAt.toISOString(),
      ].join('|'),
    )
    .digest('hex');
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join('-');
}

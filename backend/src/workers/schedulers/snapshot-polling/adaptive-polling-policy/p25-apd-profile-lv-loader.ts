import type { Prisma } from '@prisma/client';

/**
 * Decision-time visibility for profile LV corpus (pre-poll @ poll start).
 *
 * Bounds:
 * - `providerTimestamp <= decisionAt` — causal provider source time at decision.
 * - `observedAt <= decisionAt` — knowability (same axis as historical LV visibility).
 *
 * `createdAt` is intentionally excluded: a row may be inserted after decision time while
 * still representing an earlier observed event; excluding late inserts that fail the
 * observedAt bound prevents retrospective DB backfill from contaminating the live decision.
 * Offline replay that materializes rows before each decision should filter on observedAt,
 * not createdAt.
 *
 * PS1 strict-rest session filtering is not applied here (documented semantic gap).
 */
export function buildP25ApdProfileLvLoaderWhere(
  vehicleId: string,
  decisionAtMs: number,
): Prisma.BatteryMeasurementWhereInput {
  const decisionAt = new Date(decisionAtMs);
  return {
    vehicleId,
    type: 'LIVE_VOLTAGE',
    quality: 'VALID',
    providerTimestamp: { not: null, lte: decisionAt },
    observedAt: { lte: decisionAt },
  };
}

import type { Prisma } from '@prisma/client';

/**
 * Decision-time visibility for profile LV corpus (pre-poll @ poll start).
 * Aligns provider source time and ingestion visibility with historical LV contract;
 * does not apply PS1 strict-rest session filtering (semantic gap documented).
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

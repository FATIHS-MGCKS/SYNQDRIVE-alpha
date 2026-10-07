import type { PrismaClient } from '@prisma/client';

export type ApdHistoricalLvVisibilityClient = Pick<PrismaClient, 'batteryMeasurement'>;

/**
 * Latest LIVE_VOLTAGE provider source time knowable at poll completion.
 * Visibility/knowability: battery_measurements.observedAt <= pollCompletedAtMs.
 * Source time authority for policy: providerTimestamp (never observedAt).
 */
export async function findLatestHistoricallyVisibleLiveVoltageProviderTimestampMs(
  prisma: ApdHistoricalLvVisibilityClient,
  vehicleId: string,
  pollCompletedAtMs: number,
): Promise<number | null> {
  const row = await prisma.batteryMeasurement.findFirst({
    where: {
      vehicleId,
      type: 'LIVE_VOLTAGE',
      quality: 'VALID',
      providerTimestamp: { not: null },
      observedAt: { lte: new Date(pollCompletedAtMs) },
    },
    orderBy: { providerTimestamp: 'desc' },
    select: { providerTimestamp: true },
  });
  return row?.providerTimestamp?.getTime() ?? null;
}

/** Certification marker: RC DB LV fallback is bounded by poll completion visibility. */
export const P25_APD_RC_LV_FALLBACK_QUERY_BOUNDED_BY_POLL_COMPLETION = true;

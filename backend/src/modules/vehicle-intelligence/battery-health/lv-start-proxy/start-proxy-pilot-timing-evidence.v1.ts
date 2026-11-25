import type { PrismaService } from '@shared/database/prisma.service';

import type { P4cForwardTimingEvidenceV1 } from './start-proxy-pilot-raw-archive.v1';

function toIso(value: Date | null | undefined): string | null {
  if (!value || Number.isNaN(value.getTime())) return null;
  return value.toISOString();
}

/**
 * Best-effort timing anchors from already-persisted DB state (no provider calls).
 */
export async function loadStartProxyPilotTimingEvidenceV1(
  prisma: PrismaService,
  input: {
    vehicleId: string;
    tripId: string;
    tripStartedAt: Date;
    processingStartedAt: Date;
    queryStartedAt: Date | null;
  },
): Promise<P4cForwardTimingEvidenceV1> {
  const [latestState, trip] = await Promise.all([
    prisma.vehicleLatestState.findUnique({
      where: { vehicleId: input.vehicleId },
      select: {
        lvBatteryVoltage: true,
        providerFetchedAt: true,
        sourceTimestamp: true,
        isIgnitionOn: true,
      },
    }),
    prisma.vehicleTrip.findFirst({
      where: { id: input.tripId, vehicleId: input.vehicleId },
      select: { startTime: true, dimoSegmentId: true },
    }),
  ]);

  let dimoSegmentStartUtc: string | null = null;
  const segmentId = trip?.dimoSegmentId ?? '';
  const match = segmentId.match(/-(\d{13})$/);
  if (match) {
    const ms = Number.parseInt(match[1], 10);
    if (Number.isFinite(ms)) {
      dimoSegmentStartUtc = new Date(ms).toISOString();
    }
  }

  const lvSnapshotTs =
    latestState?.lvBatteryVoltage != null ? latestState.sourceTimestamp : null;

  return {
    tripFsmStartUtc: toIso(trip?.startTime ?? input.tripStartedAt),
    dimoSegmentStartUtc,
    lvSnapshotProviderTimestampUtc: toIso(lvSnapshotTs),
    ignitionProviderTimestampUtc:
      latestState?.isIgnitionOn != null ? toIso(latestState.sourceTimestamp) : null,
    snapshotProviderFetchedAtUtc: toIso(latestState?.providerFetchedAt ?? null),
    startProxyQueryStartedAtUtc: input.queryStartedAt
      ? input.queryStartedAt.toISOString()
      : null,
    processingStartedAtUtc: input.processingStartedAt.toISOString(),
    processingCompletedAtUtc: null,
  };
}

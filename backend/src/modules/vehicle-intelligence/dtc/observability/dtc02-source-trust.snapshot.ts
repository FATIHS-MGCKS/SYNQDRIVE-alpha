import type { PrismaService } from '@shared/database/prisma.service';

const STALE_MS = 6 * 60 * 60_000;

export type Dtc02SourceTrustSnapshot = {
  outboxPending: number;
  outboxUnprocessedErrors: number;
  headVlsDivergenceVehicles: number;
  fleetFreshness: Array<{ lifecycle: string; freshness: string; count: number }>;
};

/**
 * Read-only fleet aggregates for DTC-02 source-trust gauges.
 * Invoked on existing scheduler fan-out ticks only (no provider calls).
 */
export async function collectDtc02SourceTrustSnapshot(
  prisma: PrismaService,
): Promise<Dtc02SourceTrustSnapshot> {
  const [outboxPending, outboxUnprocessedErrors, divergenceRows, fleetRows] =
    await Promise.all([
      prisma.vehicleDtcSnapshotOutbox.count({ where: { processedAt: null } }),
      prisma.vehicleDtcSnapshotOutbox.count({
        where: { processedAt: null, lastError: { not: null } },
      }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM vehicle_dtc_source_heads h
        JOIN vehicle_latest_states vls ON vls.vehicle_id = h.vehicle_id
        WHERE h.last_poll_fetch_at IS NOT NULL
          AND vls.last_dtc_poll_at IS NOT NULL
          AND h.last_poll_fetch_at <> vls.last_dtc_poll_at
      `,
      prisma.vehicle.findMany({
        where: { dimoVehicleId: { not: null } },
        select: {
          registryLifecycle: true,
          latestState: {
            select: {
              lastDtcSuccessfulCheckAt: true,
              lastDtcPollAt: true,
            },
          },
        },
      }),
    ]);

  const freshnessMap = new Map<string, number>();
  const now = Date.now();
  for (const row of fleetRows) {
    const lifecycle = row.registryLifecycle ?? 'UNKNOWN';
    const lastOk = row.latestState?.lastDtcSuccessfulCheckAt;
    const lastPoll = row.latestState?.lastDtcPollAt;
    let freshness: string;
    if (!lastPoll) {
      freshness = 'never_checked';
    } else if (!lastOk || now - lastOk.getTime() > STALE_MS) {
      freshness = 'stale';
    } else {
      freshness = 'fresh';
    }
    const key = `${lifecycle}|${freshness}`;
    freshnessMap.set(key, (freshnessMap.get(key) ?? 0) + 1);
  }

  const fleetFreshness = [...freshnessMap.entries()].map(([key, count]) => {
    const [lifecycle, freshness] = key.split('|');
    return { lifecycle, freshness, count };
  });

  return {
    outboxPending,
    outboxUnprocessedErrors,
    headVlsDivergenceVehicles: Number(divergenceRows[0]?.count ?? 0),
    fleetFreshness,
  };
}

#!/usr/bin/env node
/**
 * Read-only pre–Phase-A reference window for Tesla DIMO experiment (KS FH 660E).
 * Usage (VPS):
 *   SYNQDRIVE_BACKEND_ENV=/opt/synqdrive/shared/backend.env \
 *   node scripts/ops/tesla-premium-phase-a-pre-t0-readonly.cjs
 */
const fs = require('fs');
const { PrismaClient, DimoPollJobType } = require('@prisma/client');

const VEHICLE_ID = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const WINDOW_DAYS = 14;

function loadEnv() {
  const envPath = process.env.SYNQDRIVE_BACKEND_ENV ?? '/opt/synqdrive/shared/backend.env';
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  loadEnv();
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000);
  const prisma = new PrismaClient();
  try {
    const vehicle = await prisma.vehicle.findUnique({
      where: { id: VEHICLE_ID },
      select: { vehicleName: true, licensePlate: true, make: true, model: true, year: true },
    });
    const polls = await prisma.dimoPollLog.groupBy({
      by: ['status'],
      where: {
        vehicleId: VEHICLE_ID,
        jobType: DimoPollJobType.SNAPSHOT,
        startedAt: { gte: since },
      },
      _count: { _all: true },
    });
    const vls = await prisma.vehicleLatestState.findFirst({
      where: { vehicleId: VEHICLE_ID },
      select: { sourceTimestamp: true, providerFetchedAt: true, lastSeenAt: true, updatedAt: true },
    });
    const hvRowCount = await prisma.hvBatteryHealthSnapshot.count({
      where: { vehicleId: VEHICLE_ID, recordedAt: { gte: since } },
    });
    const hvSnapshots = await prisma.hvBatteryHealthSnapshot.findMany({
      where: { vehicleId: VEHICLE_ID, recordedAt: { gte: since } },
      select: { recordedAt: true },
    });
    const hvDistinctRecordedAt = new Set(hvSnapshots.map((r) => r.recordedAt.toISOString())).size;
    const vlsUpdateCount = await prisma.vehicleLatestState.count({
      where: { vehicleId: VEHICLE_ID, updatedAt: { gte: since } },
    });

    const pollMap = Object.fromEntries(polls.map((p) => [p.status, p._count._all]));
    const success = pollMap.SUCCESS ?? 0;
    const failure = (pollMap.FAILURE ?? 0) + (pollMap.FAILED ?? 0);

    console.log(
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          windowStart: since.toISOString(),
          vehicle,
          preT0PollCount: success + failure,
          preT0SuccessfulPollCount: success,
          preT0FailedPollCount: failure,
          preT0VlsRowTouchCount14d: vlsUpdateCount,
          hvSnapshotDistinctRecordedAt14d: hvDistinctRecordedAt,
          hvSnapshotRowCount14d: hvRowCount,
          currentVls: vls,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

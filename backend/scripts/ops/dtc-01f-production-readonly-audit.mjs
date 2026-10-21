#!/usr/bin/env node
/**
 * DTC-01F read-only production inventory. No mutations. Stdout JSON only.
 * Requires DATABASE_URL in environment.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const dtcMigrations = await prisma.$queryRawUnsafe(
    `SELECT migration_name, finished_at IS NOT NULL AS applied
     FROM _prisma_migrations
     WHERE migration_name LIKE '%vehicle_dtc%'
     ORDER BY migration_name`,
  );

  const tableCheck = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN ('vehicle_dtc_source_heads', 'vehicle_dtc_snapshot_outbox')`,
  );

  const outboxPending = await prisma.vehicleDtcSnapshotOutbox.count({
    where: { processedAt: null },
  });
  const outboxPendingWithError = await prisma.vehicleDtcSnapshotOutbox.count({
    where: { processedAt: null, lastError: { not: null } },
  });
  const outboxTotal = await prisma.vehicleDtcSnapshotOutbox.count();

  const sourceHeads = await prisma.vehicleDtcSourceHead.count();

  const activeP0675 = await prisma.vehicleDtcEvent.count({
    where: { dtcCode: 'P0675', isActive: true },
  });

  const activeDtcEvents = await prisma.vehicleDtcEvent.count({
    where: { isActive: true },
  });

  const vehiclesDimoLinked = await prisma.vehicle.count({
    where: { dimoVehicleId: { not: null } },
  });
  const vehiclesOffboardedDimo = await prisma.vehicle.count({
    where: {
      dimoVehicleId: { not: null },
      registryLifecycle: { in: ['OFFBOARDED', 'ARCHIVED'] },
    },
  });
  const activeDimoLinks = await prisma.vehicleDataSourceLink.count({
    where: { provider: 'DIMO', isActive: true },
  });

  const p0675Rows = await prisma.vehicleDtcEvent.findMany({
    where: { dtcCode: 'P0675', isActive: true },
    select: {
      vehicleId: true,
      firstSeenAt: true,
      lastSeenAt: true,
      occurrenceCount: true,
      severity: true,
    },
    take: 20,
  });

  const vlsDtcSample = await prisma.vehicleLatestState.findMany({
    where: { obdDtcList: { not: null } },
    select: {
      vehicleId: true,
      obdDtcList: true,
      lastDtcPollAt: true,
      sourceTimestamp: true,
      dtcPollStatus: true,
    },
    take: 15,
    orderBy: { lastDtcPollAt: 'desc' },
  });

  console.log(
    JSON.stringify(
      {
        auditedAt: new Date().toISOString(),
        dtcMigrations,
        dtcTables: tableCheck,
        outbox: {
          total: outboxTotal,
          pending: outboxPending,
          pendingWithError: outboxPendingWithError,
        },
        sourceHeads,
        activeDtcEvents,
        activeP0675,
        p0675ActiveSample: p0675Rows,
        fleet: {
          vehiclesDimoLinked,
          vehiclesOffboardedDimo,
          activeDimoSourceLinks: activeDimoLinks,
        },
        vlsDtcEvidenceSample: vlsDtcSample,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(JSON.stringify({ error: e.message }));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

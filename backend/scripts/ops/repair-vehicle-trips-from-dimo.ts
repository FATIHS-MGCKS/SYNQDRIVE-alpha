/**
 * Replace fragmentary REPAIRED trips in a window with DIMO changePoint segments.
 *
 * Default: dry-run (lists trips to remove + DIMO segments to apply).
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-trips-from-dimo.ts \
 *     --vehicle-id=<UUID> --from=2026-07-18T22:00:00.000Z --to=2026-07-19T21:59:59.999Z
 *
 * Apply (destructive — removes REPAIRED trips in window, then reconciles from DIMO):
 *   npx ts-node -r tsconfig-paths/register scripts/ops/repair-vehicle-trips-from-dimo.ts \
 *     --vehicle-id=<UUID> --from=... --to=... --apply
 */
import { NestFactory } from '@nestjs/core';
import { TripSource } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { DimoSegmentsService } from '../../src/modules/dimo/dimo-segments.service';
import { TripReconciliationService } from '../../src/modules/vehicle-intelligence/trips/reconciliation/trip-reconciliation.service';

function parseArg(prefix: string): string | undefined {
  const arg = process.argv.find((a) => a.startsWith(`${prefix}=`));
  return arg?.split('=').slice(1).join('=').trim() || undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const vehicleId = parseArg('--vehicle-id');
  const fromIso = parseArg('--from');
  const toIso = parseArg('--to');
  const apply = hasFlag('--apply');

  if (!vehicleId || !fromIso || !toIso) {
    console.error(
      'Usage: repair-vehicle-trips-from-dimo.ts --vehicle-id=<UUID> --from=<iso> --to=<iso> [--apply]',
    );
    process.exit(1);
  }

  const from = new Date(fromIso);
  const to = new Date(toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    console.error('Invalid --from or --to ISO timestamp');
    process.exit(1);
  }

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const segments = app.get(DimoSegmentsService);
    const reconciliation = app.get(TripReconciliationService);

    const vehicle = await prisma.vehicle.findUnique({
      where: { id: vehicleId },
      select: {
        id: true,
        licensePlate: true,
        vehicleName: true,
        dimoVehicle: { select: { tokenId: true } },
      },
    });
    if (!vehicle?.dimoVehicle?.tokenId) {
      throw new Error(`Vehicle ${vehicleId} has no DIMO token`);
    }

    const existing = await prisma.vehicleTrip.findMany({
      where: {
        vehicleId,
        startTime: { gte: from, lte: to },
      },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        distanceKm: true,
        tripSource: true,
        startDetectionMode: true,
      },
    });

    const dimoRows = await segments.fetchTripSegments(
      vehicle.dimoVehicle.tokenId,
      from,
      to,
    );

    console.log(
      JSON.stringify(
        {
          mode: apply ? 'apply' : 'dry-run',
          vehicle: {
            id: vehicle.id,
            plate: vehicle.licensePlate,
            name: vehicle.vehicleName,
            tokenId: vehicle.dimoVehicle.tokenId,
          },
          window: { from: from.toISOString(), to: to.toISOString() },
          existingTrips: existing.map((t) => ({
            id: t.id,
            start: t.startTime.toISOString(),
            end: t.endTime?.toISOString() ?? null,
            km: t.distanceKm,
            source: t.tripSource,
            mode: t.startDetectionMode,
          })),
          dimoSegments: dimoRows.map((s) => ({
            segmentId: s.segmentId,
            start: s.startTime,
            end: s.endTime,
            km: s.distanceKm,
            mechanism: s.mechanism,
            ongoing: s.isOngoing,
          })),
        },
        null,
        2,
      ),
    );

    if (!apply) {
      console.log('\nDry-run only — pass --apply to delete REPAIRED trips and reconcile from DIMO.');
      return;
    }

    const removed = await prisma.vehicleTrip.deleteMany({
      where: {
        vehicleId,
        tripSource: TripSource.REPAIRED,
        startTime: { gte: from, lte: to },
      },
    });

    const result = await reconciliation.triggerManualReconciliation(vehicleId, {
      from,
      to,
      useDimoSegmentFallback: true,
    });

    const after = await prisma.vehicleTrip.findMany({
      where: { vehicleId, startTime: { gte: from, lte: to } },
      orderBy: { startTime: 'asc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        distanceKm: true,
        tripSource: true,
        startDetectionMode: true,
        dimoSegmentId: true,
      },
    });

    console.log(
      JSON.stringify(
        {
          removedRepairedTrips: removed.count,
          reconciliation: result,
          tripsAfter: after.map((t) => ({
            id: t.id,
            start: t.startTime.toISOString(),
            end: t.endTime?.toISOString() ?? null,
            km: t.distanceKm,
            source: t.tripSource,
            mode: t.startDetectionMode,
            dimoSegmentId: t.dimoSegmentId,
          })),
          summary: {
            count: after.length,
            totalKm: after.reduce((s, t) => s + (t.distanceKm ?? 0), 0),
          },
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

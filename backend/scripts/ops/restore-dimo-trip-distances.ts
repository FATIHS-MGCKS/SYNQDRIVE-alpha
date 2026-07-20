/**
 * Restore distanceKm on DIMO-repaired trips from rawDetectionMeta.dimoSegment.
 *
 * Route enrichment (TripsService.enrichTrip) previously overwrote DIMO odometer
 * deltas with map-matched geometry, which undercounts when GPS/route points are sparse.
 *
 * Usage:
 *   cd backend
 *   npx ts-node -r tsconfig-paths/register scripts/ops/restore-dimo-trip-distances.ts \
 *     --vehicle-id=<UUID> --from=2026-07-18T22:00:00.000Z --to=2026-07-19T21:59:59.999Z
 *
 * Apply:
 *   ... --apply
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '@shared/database/prisma.service';
import { resolveDimoCanonicalDistanceKm } from '../../src/modules/vehicle-intelligence/trips/trip-distance.helpers';

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
      'Usage: restore-dimo-trip-distances.ts --vehicle-id=<UUID> --from=<iso> --to=<iso> [--apply]',
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

    const trips = await prisma.vehicleTrip.findMany({
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
        dimoSegmentId: true,
        startDetectionMode: true,
        rawDetectionMeta: true,
      },
    });

    const corrections = trips
      .map((trip) => {
        const canonicalKm = resolveDimoCanonicalDistanceKm(trip);
        if (canonicalKm == null) return null;
        const currentKm = trip.distanceKm ?? 0;
        if (Math.abs(currentKm - canonicalKm) < 0.05) return null;
        return {
          id: trip.id,
          start: trip.startTime.toISOString(),
          end: trip.endTime?.toISOString() ?? null,
          currentKm,
          canonicalKm,
          deltaKm: Math.round((canonicalKm - currentKm) * 10) / 10,
          dimoSegmentId: trip.dimoSegmentId,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);

    const summary = {
      mode: apply ? 'apply' : 'dry-run',
      vehicleId,
      window: { from: from.toISOString(), to: to.toISOString() },
      tripCount: trips.length,
      correctionCount: corrections.length,
      currentTotalKm: trips.reduce((s, t) => s + (t.distanceKm ?? 0), 0),
      correctedTotalKm: trips.reduce((s, t) => {
        const canonical = resolveDimoCanonicalDistanceKm(t);
        return s + (canonical ?? t.distanceKm ?? 0);
      }, 0),
      corrections,
    };

    console.log(JSON.stringify(summary, null, 2));

    if (!apply) {
      console.log('\nDry-run only — pass --apply to update distanceKm.');
      return;
    }

    for (const correction of corrections) {
      await prisma.vehicleTrip.update({
        where: { id: correction.id },
        data: { distanceKm: correction.canonicalKm },
      });
    }

    console.log(`\nUpdated ${corrections.length} trip(s).`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

/**
 * Backfill trip_analysis_status and drivingImpactStatus for historical COMPLETED trips.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-trip-analysis-status.ts --dry-run
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-trip-analysis-status.ts --apply --limit 500
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/shared/database/prisma.service';
import { inferTripAnalysisStatusFromLegacy } from '../src/modules/vehicle-intelligence/trips/trip-analysis-status';
import * as fs from 'fs';
import * as path from 'path';

{
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
    }
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const dryRun = !apply || process.argv.includes('--dry-run');
  const limitArg = process.argv.includes('--limit')
    ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
    : 1000;
  const orgArg = process.argv.includes('--org')
    ? process.argv[process.argv.indexOf('--org') + 1]
    : undefined;

  const appModule = await AppModule.forRootAsync();
  const app = await NestFactory.createApplicationContext(appModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const prisma = app.get(PrismaService);
    const trips = await prisma.vehicleTrip.findMany({
      where: {
        tripStatus: 'COMPLETED',
        tripAnalysisStatus: null,
        ...(orgArg
          ? { vehicle: { organizationId: orgArg } }
          : {}),
      },
      select: {
        id: true,
        behaviorEnrichmentStatus: true,
        tripStatus: true,
        drivingImpactStatus: true,
        tripAnalysisStatus: true,
      },
      take: limitArg,
      orderBy: { endTime: 'desc' },
    });

    let statusUpdates = 0;
    let impactUpdates = 0;

    for (const trip of trips) {
      const inferred = inferTripAnalysisStatusFromLegacy(trip);
      if (!inferred) continue;

      const impact = await prisma.tripDrivingImpact.findUnique({
        where: { tripId: trip.id },
        select: { id: true },
      });

      const needsStatus = trip.tripAnalysisStatus == null;
      const needsImpactSync =
        impact != null &&
        (trip.drivingImpactStatus == null || trip.drivingImpactStatus === 'PENDING');

      if (!needsStatus && !needsImpactSync) continue;

      if (dryRun) {
        console.log(
          `[dry-run] trip=${trip.id} status→${inferred}` +
            (needsImpactSync ? ' impact→READY' : ''),
        );
      } else {
        await prisma.vehicleTrip.update({
          where: { id: trip.id },
          data: {
            ...(needsStatus ? { tripAnalysisStatus: inferred } : {}),
            ...(needsImpactSync
              ? { drivingImpactStatus: 'READY', drivingImpactComputedAt: new Date() }
              : {}),
          },
        });
      }

      if (needsStatus) statusUpdates += 1;
      if (needsImpactSync) impactUpdates += 1;
    }

    console.log(
      JSON.stringify(
        {
          mode: dryRun ? 'dry-run' : 'apply',
          scanned: trips.length,
          statusUpdates,
          impactStatusSyncs: impactUpdates,
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
  console.error('[backfill-trip-analysis-status] Failed:', err);
  process.exit(1);
});

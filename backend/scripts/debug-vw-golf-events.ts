/**
 * Diagnostic: find VW Golf (WOB X 6511) in DB and print its DIMO tokenId +
 * local trip / DrivingEvent state so we can then probe the DIMO Telemetry API
 * via MCP for the actual event-name vocabulary.
 *
 * Usage (from backend/):
 *   npx ts-node -r tsconfig-paths/register scripts/debug-vw-golf-events.ts
 */
import { PrismaClient } from '@prisma/client';
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
  const prisma = new PrismaClient();
  try {
    const vehicle = await prisma.vehicle.findFirst({
      where: {
        OR: [
          { licensePlate: { contains: 'WOB', mode: 'insensitive' } },
          { licensePlate: { contains: '6511', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        licensePlate: true,
        make: true,
        model: true,
        year: true,
        hardwareType: true,
        organizationId: true,
        tankCapacityLiters: true,
        fuelType: true,
        dimoVehicle: {
          select: { id: true, tokenId: true, vin: true, externalId: true, make: true, model: true, year: true },
        },
      },
    });
    if (!vehicle) {
      console.error('[debug-golf] No matching vehicle found');
      return;
    }
    console.log(`[debug-golf] Vehicle:`);
    console.log(JSON.stringify(vehicle, null, 2));

    if (!vehicle.dimoVehicle?.tokenId) {
      console.error('[debug-golf] No DIMO tokenId — halting');
      return;
    }
    console.log(`\n[debug-golf] TOKEN ID = ${vehicle.dimoVehicle.tokenId}`);

    const trips = await prisma.vehicleTrip.findMany({
      where: {
        vehicleId: vehicle.id,
        startTime: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) },
      },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        distanceKm: true,
        behaviorEnrichmentStatus: true,
        behaviorEnrichmentError: true,
        behaviorEnrichmentAttempts: true,
        behaviorEnrichedAt: true,
        hardBrakingCount: true,
        hardAccelerationCount: true,
        harshBrakeCount: true,
        harshAccelCount: true,
        harshCornerCount: true,
        corneringEvents: true,
        abuseEvents: true,
        speedingEvents: true,
        fuelUsedLiters: true,
        avgConsumptionLPer100Km: true,
        fuelConfidence: true,
      },
      orderBy: { startTime: 'desc' },
      take: 20,
    });
    console.log(`\n[debug-golf] Last ${trips.length} trips (≤3 days):`);
    for (const t of trips) {
      console.log(
        `  [${t.id.slice(0, 8)}] ${t.startTime.toISOString()} → ${t.endTime?.toISOString() ?? 'ongoing'} ` +
          `(${t.distanceKm?.toFixed(1) ?? '—'} km)\n` +
          `      enrichStatus=${t.behaviorEnrichmentStatus} attempts=${t.behaviorEnrichmentAttempts} enrichedAt=${t.behaviorEnrichedAt?.toISOString() ?? '—'}\n` +
          `      brake(hard/harsh)=${t.hardBrakingCount}/${t.harshBrakeCount} accel(hard/harsh)=${t.hardAccelerationCount}/${t.harshAccelCount} ` +
          `corner=${t.harshCornerCount}/${t.corneringEvents} abuse=${t.abuseEvents} speeding=${t.speedingEvents}\n` +
          `      fuelUsed=${t.fuelUsedLiters} L/100=${t.avgConsumptionLPer100Km} conf=${t.fuelConfidence}\n` +
          `      err=${t.behaviorEnrichmentError ?? ''}`,
      );
    }

    const drivingEventsCount = await prisma.drivingEvent.count({
      where: {
        vehicleId: vehicle.id,
        recordedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });
    console.log(`\n[debug-golf] DrivingEvent rows (last 7d) = ${drivingEventsCount}`);

    const behaviorEventsCount = await prisma.tripBehaviorEvent.count({
      where: {
        vehicleId: vehicle.id,
        startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    });
    console.log(`[debug-golf] TripBehaviorEvent rows (last 7d) = ${behaviorEventsCount}`);

    const latest = await prisma.vehicleLatestState.findUnique({
      where: { vehicleId: vehicle.id },
      select: {
        fuelLevelRelative: true,
        fuelLevelAbsolute: true,
        odometerKm: true,
        lastSeenAt: true,
      },
    });
    console.log(`\n[debug-golf] VehicleLatestState:`);
    console.log(JSON.stringify(latest, null, 2));

    const detState = await prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId: vehicle.id },
      select: {
        state: true,
        activeTripId: true,
        startFuelLevel: true,
        startOdometerKm: true,
        lastActivityAt: true,
      },
    });
    console.log(`\n[debug-golf] VehicleTripDetectionState:`);
    console.log(JSON.stringify(detState, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[debug-golf] Failed:', err);
  process.exit(1);
});

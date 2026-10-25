/**
 * Read-only production audit: DIRECT exclusion breakdown + Tiguan replay parity.
 */
import { PrismaClient } from '@prisma/client';
import { DiV0MotionCoreShadowTripMapReadService } from '../../src/modules/vehicle-intelligence/driving-intelligence/motion-core-shadow-worker/di-v0-motion-core-shadow-trip-map-read.service';
import { analyzeDirectExclusionBreakdown } from '../../src/modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow-temporal-coverage';
import { mapDs4TripMapToTireShadowInput } from '../../src/modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow-input.mapper';
import { computeTemporalCoverage } from '../../src/modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow-temporal-coverage';
import { TIRE_DS4_SHADOW_ADAPTER_VERSION } from '../../src/modules/vehicle-intelligence/tires/ds4-shadow/tire-ds4-shadow-adapter.version';

const TRIPS = [
  'b26f9ddd-9b40-48c8-93cb-a598a2063211',
  'def454a0-1e7d-4080-859a-3ef2b46472f8',
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const tripMapRead = new DiV0MotionCoreShadowTripMapReadService(prisma as never);
  try {
    const report: unknown[] = [];
    for (const tripId of TRIPS) {
      const ledger = await prisma.tireTripUsageLedger.findFirst({
        where: { tripId, invalidatedAt: null },
      });
      if (!ledger) continue;
      const read = await tripMapRead.readForTrip(
        ledger.organizationId,
        ledger.vehicleId,
        ledger.tripId,
      );
      const tripCtx = {
        tripDistanceKm: ledger.distanceKm,
        tripStartedAt: ledger.tripStartedAt,
        tripEndedAt: ledger.tripEndedAt,
      };
      const { temporalCoverage, detail } = computeTemporalCoverage(read, tripCtx);
      const payload = mapDs4TripMapToTireShadowInput(read, tripCtx);
      const directBreakdown = analyzeDirectExclusionBreakdown(read, tripCtx);
      report.push({
        tripId,
        adapterVersion: TIRE_DS4_SHADOW_ADAPTER_VERSION,
        temporalCoverage,
        validDrivingSeconds: detail.validDrivingSeconds,
        invalidLabelSeconds: detail.invalidLabelSeconds,
        directExclusion: directBreakdown,
        m3AccelerationJPerKgPerKmSum: payload.acceleration.okM3JPerKgPerKmSum,
        m3DecelerationJPerKgPerKmSum: payload.deceleration.okM3JPerKgPerKmSum,
      });
    }
    process.stdout.write(JSON.stringify(report, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

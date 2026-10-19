#!/usr/bin/env npx tsx
/**
 * Idempotent recovery for COMPLETED LIVE_FSM MID_TRIP_GAP_SPLIT parents (and continuations)
 * missing diV0BoundaryAdmissionV1. Default: dry-run list only — pass --execute to write admission.
 *
 * Not invoked automatically in production; run only after owner authorization post-deploy.
 */
import { PrismaClient } from '@prisma/client';
import { TripDiBoundaryAdmissionService } from '../../src/modules/vehicle-intelligence/trips/di-boundary-admission/trip-di-boundary-admission.service';
import { listLiveFsmSplitAdmissionCandidateTripIds } from '../../src/modules/vehicle-intelligence/trips/di-boundary-admission/trip-di-boundary-admission-live-fsm-split.util';
import { readTripDiBoundaryAdmissionV1 } from '../../src/modules/vehicle-intelligence/trips/di-boundary-admission/trip-di-boundary-admission';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const vehicleId = args.find((a) => !a.startsWith('--'));
  if (!vehicleId) {
    console.error('Usage: trip-di-boundary-admission-live-fsm-split-recovery.ts <vehicleId> [--execute]');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const admission = new TripDiBoundaryAdmissionService(prisma as never);
  try {
    const tripIds = await listLiveFsmSplitAdmissionCandidateTripIds(prisma, vehicleId);
    console.log(JSON.stringify({ vehicleId, candidateCount: tripIds.length, tripIds, execute }, null, 2));
    if (!execute) {
      console.log('Dry-run only. Re-run with --execute to release admission via TripDiBoundaryAdmissionService.');
      return;
    }
    const result = await admission.releaseEligibleLiveFsmSplitSegmentsAfterVehicleSettlement(vehicleId);
    for (const tripId of result.tripIds) {
      const rows = await prisma.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
        SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${tripId}`;
      const admitted = readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta);
      console.log(JSON.stringify({ tripId, admitted: admitted != null, releasedBy: admitted?.releasedBy ?? null }));
    }
    console.log(JSON.stringify({ result }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env npx tsx
/**
 * Trip-scoped recovery for LIVE_FSM split segments missing diV0BoundaryAdmissionV1.
 * Default: dry-run eligibility only.
 *
 * Execute requires:
 *   --execute
 *   TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_AUTHORIZED=1
 *   --trip-id <uuid> --vehicle-id <uuid>  (both required; must match)
 */
import { PrismaClient } from '@prisma/client';
import { TripDiBoundaryAdmissionService } from '../../src/modules/vehicle-intelligence/trips/di-boundary-admission/trip-di-boundary-admission.service';
import { readTripDiBoundaryAdmissionV1 } from '../../src/modules/vehicle-intelligence/trips/di-boundary-admission/trip-di-boundary-admission';

function readArg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  if (i < 0 || i + 1 >= args.length) return undefined;
  return args[i + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const tripId = readArg(args, '--trip-id');
  const vehicleId = readArg(args, '--vehicle-id');

  if (!tripId || !vehicleId) {
    console.error(
      'Usage: trip-di-boundary-admission-live-fsm-split-recovery.ts --trip-id <uuid> --vehicle-id <uuid> [--execute]',
    );
    process.exit(1);
  }

  const prisma = new PrismaClient();
  const admission = new TripDiBoundaryAdmissionService(prisma as never);
  try {
    const eligibility = await admission.evaluateLiveFsmSplitAdmissionEligibility(tripId, vehicleId);
    const scope = await admission.loadScope(tripId);
    const dryRun = {
      tripId,
      vehicleId,
      execute,
      eligibility,
      detectionState: scope?.detectionState ?? null,
      activeTripId: scope?.activeTripId ?? null,
      proposedBoundaryRepairCount: scope?.proposedBoundaryRepairCount ?? null,
      canReleaseWouldRun: eligibility.eligible,
    };
    console.log(JSON.stringify(dryRun, null, 2));

    if (!execute) {
      console.log('Dry-run only. To execute: set TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_AUTHORIZED=1 and pass --execute');
      return;
    }

    if (process.env.TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_AUTHORIZED !== '1') {
      console.error('Refusing --execute without TRIP_DI_BOUNDARY_ADMISSION_RECOVERY_AUTHORIZED=1');
      process.exit(2);
    }

    const result = await admission.tryReleaseLiveFsmSplitTripScoped(tripId, vehicleId);
    const rows = await prisma.$queryRaw<Array<{ raw_detection_meta: unknown }>>`
      SELECT raw_detection_meta FROM vehicle_trips WHERE id = ${tripId}`;
    const admitted = readTripDiBoundaryAdmissionV1(rows[0]?.raw_detection_meta);
    console.log(
      JSON.stringify(
        {
          ...result,
          admitted: admitted != null,
          releasedBy: admitted?.releasedBy ?? null,
          revisionKey: admitted?.revisionKey ?? null,
        },
        null,
        2,
      ),
    );
    process.exit(result.ok ? 0 : 3);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

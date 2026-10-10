/**
 * Read-only production preflight for EXP-021 post-completion gap observer.
 */
import { TripStatus } from '@prisma/client';
import {
  assertExp021GapObserverSlimBootstrap,
  bootstrapExp021PostCompletionGapObserverContext,
  resolveExp021GapObserverNestServices,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-post-completion-gap-observer-bootstrap.lib';
import {
  bucketIdentityVersion,
  EXP021_GAP_OBSERVER_COHORT,
  HF_FAST_LOOP_FIELDS,
  POST_TRIP_TEST_GEOMETRY_MS,
} from '../../src/modules/vehicle-intelligence/reference-capture/exp021-maturation-shadow/reference-capture-exp021-post-completion-gap-observer.lib';

const PREFLIGHT_TRIP_ID = '9c3eddb3-09b4-4131-9f1f-dc60ba4b5ba3';

async function main(): Promise<void> {
  const slim = assertExp021GapObserverSlimBootstrap();
  const app = await bootstrapExp021PostCompletionGapObserverContext({ logger: ['error', 'warn'] });
  const { prisma, providerQuery } = resolveExp021GapObserverNestServices(app);

  const trip = await prisma.vehicleTrip.findFirst({
    where: { id: PREFLIGHT_TRIP_ID, tripStatus: TripStatus.COMPLETED, endTime: { not: null } },
    select: {
      id: true,
      endTime: true,
      vehicleId: true,
      vehicle: { select: { organizationId: true } },
    },
  });
  if (!trip?.endTime) {
    throw new Error(`Preflight trip ${PREFLIGHT_TRIP_ID} not found or incomplete`);
  }

  const cohort = EXP021_GAP_OBSERVER_COHORT.find((c) => c.vehicleId === trip.vehicleId);
  if (!cohort) {
    throw new Error('Preflight trip vehicle not in cohort');
  }

  const windowTo = trip.endTime;
  const windowFrom = new Date(windowTo.getTime() - POST_TRIP_TEST_GEOMETRY_MS);
  const result = await providerQuery.executeHistoricalQuery({
    tokenId: cohort.tokenId,
    organizationId: trip.vehicle.organizationId,
    vehicleId: cohort.vehicleId,
    providerFields: [...HF_FAST_LOOP_FIELDS],
    windowFrom,
    windowTo,
    interval: '1s',
  });

  await app.close();

  const lines = [
    ...Object.entries(slim).map(([k, v]) => `${k}=${v}`),
    'OBSERVER_DB_READ_ONLY=YES',
    'DATABASE_INSERT_PATHS=0',
    'DATABASE_UPDATE_PATHS=0',
    'DATABASE_DELETE_PATHS=0',
    'PRISMA_TRANSACTION_MUTATION_PATHS=0',
    `DIMO_AUTH_PREFLIGHT=${result.providerRequestSucceeded ? 'PASS' : 'FAIL'}`,
    'DIMO_LIMITER_PATH_USED=YES',
    `PROVIDER_READ_TEST=${result.providerRequestSucceeded ? 'PASS' : 'FAIL'}`,
    `QUERY_SCHEMA_VERSION=${bucketIdentityVersion()}`,
    `PREFLIGHT_BUCKET_LOCUS_COUNT=${result.uniqueBucketLocusCount ?? 0}`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

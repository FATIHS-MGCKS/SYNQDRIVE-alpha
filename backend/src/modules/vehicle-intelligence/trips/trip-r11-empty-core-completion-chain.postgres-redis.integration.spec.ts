import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { type TripTrackingJobData } from './trip-detection.types';
import {
  buildActiveTickJob,
  buildTripR11DetectorMock,
  buildTripR11OrchestrationHarness,
  buildTripR11SegmentsMock,
  buildTripTrackingJobId,
  cleanupTripR11Fixture,
  countTripTrackingJobs,
  createTripR11ActiveTripFixture,
  drainTripTrackingQueue,
  probeTripR11Postgres,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { resolveEndCycleToken } from './trip-end-cycle-reset';

const LIVE = process.env.TRIP_R11_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_R11_POSTGRES_REDIS_REQUIRED === '1';

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TRIP_R11_POSTGRES_REDIS_REQUIRED=1 but TRIP_R11_POSTGRES_REDIS_INTEGRATION is not 1',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error('TRIP_R11 integration requires CI-local DATABASE_URL');
  }
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R11 Scenario C — empty-core completion chain (Postgres + BullMQ)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let redisStack: Awaited<ReturnType<typeof startTripR11RedisStack>>;
    let trackingQueue: Queue<TripTrackingJobData>;
    let fixture: TripR11PostgresFixture;

    beforeAll(async () => {
      dbOk = await probeTripR11Postgres();
      if (REQUIRED && !dbOk) {
        throw new Error('Trip R11 postgres probe failed in required CI mode');
      }
      if (!dbOk) return;
      prisma = new PrismaClient();
      redisStack = await startTripR11RedisStack();
      trackingQueue = new Queue(QUEUE_NAMES.TRIP_TRACKING, {
        connection: redisStack.connectionOptions,
      });
      RuntimeStatusRegistry.setWorkersEnabled(true);
    }, 120_000);

    beforeEach(async () => {
      if (!dbOk) return;
      await trackingQueue.obliterate({ force: true });
      fixture = await createTripR11ActiveTripFixture(prisma);
    });

    afterEach(async () => {
      restoreTripR11Clock();
      if (!dbOk || !fixture) return;
      await cleanupTripR11Fixture(prisma, fixture);
    });

    afterAll(async () => {
      await trackingQueue?.close().catch(() => undefined);
      await prisma?.$disconnect().catch(() => undefined);
      if (redisStack) await stopTripR11RedisStack(redisStack);
    }, 60_000);

    it('C — provider anchor → empty-core gate → POSSIBLE_END → queue chain → COMPLETED + RESTING', async () => {
      const segments = buildTripR11SegmentsMock(fixture.expectedEndTime);
      const detectorRegistry = buildTripR11DetectorMock(fixture.expectedEndTime);
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        detectorRegistry,
      );

      const emptyCoreTickAt = new Date('2026-09-08T05:02:30.000Z');
      useTripR11FrozenClock(emptyCoreTickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, emptyCoreTickAt));

        const afterEmptyCore = await prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId: fixture.vehicle.id },
        });
        expect(afterEmptyCore?.state).toBe(TripDetectionState.POSSIBLE_END);
        expect(afterEmptyCore?.activeTripId).toBe(fixture.trip.id);
        expect(afterEmptyCore?.possibleEndEnteredAt?.toISOString()).toBe(
          emptyCoreTickAt.toISOString(),
        );
        const summary = afterEmptyCore?.lastEvidenceSummary as Record<string, unknown>;
        expect(summary.innerGateReason).toBe('empty_core_corroborated_inactivity');
        expect(summary.emptyCoreDecision).toBe('POSSIBLE_END');

        const pecJobId = buildTripTrackingJobId(
          'pec',
          fixture.vehicle.id,
          fixture.trip.id,
        );
        const pecJob = await trackingQueue.getJob(pecJobId);
        expect(pecJob).not.toBeNull();

        const endCycleAt = new Date('2026-09-08T05:04:30.000Z');
        jest.setSystemTime(endCycleAt);
        const steps = await drainTripTrackingQueue({
          queue: trackingQueue,
          runJob: harness.runJob,
        });
        expect(steps).toBeGreaterThanOrEqual(3);

        const trip = await prisma.vehicleTrip.findUnique({
          where: { id: fixture.trip.id },
        });
        const det = await prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId: fixture.vehicle.id },
        });

        expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
        expect(trip?.endTime).toEqual(fixture.expectedEndTime);
        expect(det?.state).toBe(TripDetectionState.RESTING);
        expect(det?.activeTripId).toBeNull();
        expect(det?.possibleEndEnteredAt).toBeNull();
        expect(det?.possibleEndAt).toBeNull();
        expect(det).not.toBeNull();
        expect(resolveEndCycleToken(det!)).toBeNull();
        expect(await countTripTrackingJobs(trackingQueue)).toBe(0);
      } finally {
        restoreTripR11Clock();
      }
    }, 120_000);
  },
);

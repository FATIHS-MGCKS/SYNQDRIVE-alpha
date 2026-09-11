import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { TRIP_TRACKING_TRIGGERS, type TripTrackingJobData } from './trip-detection.types';
import {
  buildActiveTickJob,
  buildTripR11DetectorMock,
  buildTripR11OrchestrationHarness,
  buildTripR11SegmentsMock,
  buildTripTrackingJobId,
  cleanupTripR11Fixture,
  closeTripTrackingWorkers,
  countTripTrackingJobs,
  createTripR11ActiveTripFixture,
  createTripTrackingWorkers,
  probeTripR11Postgres,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  waitForTripTrackingJobState,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import {
  buildTripTrackingSuccessorJobId,
  inspectStableSlotFamily,
  stableSlotFamilyHasFutureAuthority,
} from './trip-tracking-stable-slot-family';
import { resolveEndCycleToken } from './trip-end-cycle-reset';

const LIVE = process.env.TRIP_R12_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_R12_POSTGRES_REDIS_REQUIRED === '1';

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TRIP_R12_POSTGRES_REDIS_REQUIRED=1 but TRIP_R12_POSTGRES_REDIS_INTEGRATION is not 1',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error('Trip R12 integration requires CI-local DATABASE_URL');
  }
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R12 — real BullMQ ACTIVE end-cycle lock regression (Postgres + Workers)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let redisStack: Awaited<ReturnType<typeof startTripR11RedisStack>>;
    let trackingQueue: Queue<TripTrackingJobData>;
    let fixture: TripR11PostgresFixture;

    beforeAll(async () => {
      dbOk = await probeTripR11Postgres();
      if (REQUIRED && !dbOk) {
        throw new Error('Trip R12 postgres probe failed in required CI mode');
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
      fixture = await createTripR11ActiveTripFixture(prisma, {
        stopBoundarySource: 'provider_stationary_vls',
      });
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

    it('ACTIVE locked END_VALIDATION + competing schedule → successor/skip → COMPLETED + RESTING', async () => {
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
      const endCycleAt = new Date('2026-09-08T05:04:30.000Z');
      const evPrimaryId = buildTripTrackingJobId('ev', fixture.vehicle.id, fixture.trip.id);
      const evSuccId = buildTripTrackingSuccessorJobId(evPrimaryId);

      useTripR11FrozenClock(emptyCoreTickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, emptyCoreTickAt));
      } finally {
        restoreTripR11Clock();
      }

      const afterPe = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterPe?.state).toBe(TripDetectionState.POSSIBLE_END);
      expect(afterPe?.possibleEndEnteredAt).not.toBeNull();

      useTripR11FrozenClock(endCycleAt);
      try {
        await TripDetectionOrchestrationService.prototype.scheduleEndValidation.call(
          harness.orchestration,
          fixture.vehicle.id,
          fixture.org.id,
          fixture.vehicle.dimoTokenId,
        );
      } finally {
        restoreTripR11Clock();
      }

      let releaseEvHold: (() => void) | undefined;
      const evHold = new Promise<void>((resolve) => {
        releaseEvHold = resolve;
      });

      const runJobWithActiveHold = async (job: TripTrackingJobData): Promise<void> => {
        if (job.trigger === TRIP_TRACKING_TRIGGERS.END_VALIDATION) {
          await evHold;
        }
        await harness.runJob(job);
      };

      const workers = createTripTrackingWorkers({
        connection: redisStack.connectionOptions,
        runJob: runJobWithActiveHold,
        workerCount: 2,
        concurrency: 1,
      });

      try {
        await waitForTripTrackingJobState(trackingQueue, evPrimaryId, 'active', 15_000);

        const familyWhileActive = await inspectStableSlotFamily(trackingQueue, evPrimaryId);
        expect(familyWhileActive.primaryState).toBe('active');

        useTripR11FrozenClock(endCycleAt);
        try {
          await expect(
            TripDetectionOrchestrationService.prototype.scheduleEndValidation.call(
              harness.orchestration,
              fixture.vehicle.id,
              fixture.org.id,
              fixture.vehicle.dimoTokenId,
            ),
          ).resolves.toBeUndefined();
        } finally {
          restoreTripR11Clock();
        }

        const familyAfterCompete = await inspectStableSlotFamily(trackingQueue, evPrimaryId);
        expect(familyAfterCompete.primaryState).toBe('active');
        expect(await stableSlotFamilyHasFutureAuthority(familyAfterCompete)).toBe(true);

        const successor = await trackingQueue.getJob(evSuccId);
        expect(successor).not.toBeNull();
        expect(await successor!.getState()).not.toBe('failed');

        releaseEvHold?.();

        const deadline = Date.now() + 60_000;
        let trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
        let det = await prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId: fixture.vehicle.id },
        });
        while (Date.now() < deadline) {
          trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
          det = await prisma.vehicleTripDetectionState.findUnique({
            where: { vehicleId: fixture.vehicle.id },
          });
          if (
            trip?.tripStatus === TripStatus.COMPLETED &&
            det?.state === TripDetectionState.RESTING &&
            det.activeTripId === null
          ) {
            break;
          }
          await new Promise((r) => setTimeout(r, 200));
        }

        expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
        expect(trip?.endTime).toEqual(fixture.expectedEndTime);
        expect(det?.state).toBe(TripDetectionState.RESTING);
        expect(det?.activeTripId).toBeNull();
        expect(det?.possibleEndEnteredAt).toBeNull();
        expect(det?.possibleEndAt).toBeNull();
        expect(resolveEndCycleToken(det!)).toBeNull();
        expect(await countTripTrackingJobs(trackingQueue)).toBe(0);
      } finally {
        releaseEvHold?.();
        await closeTripTrackingWorkers(workers);
      }
    }, 120_000);
  },
);

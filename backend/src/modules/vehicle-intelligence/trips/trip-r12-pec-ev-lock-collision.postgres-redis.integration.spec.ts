import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { DelayedError, Queue, type Job } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from './trip-detection.types';
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
  promoteDelayedTripTrackingJobs,
  purgeTripTrackingQueueJobs,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  waitForHarnessCondition,
  waitForTripTerminalState,
  type TripR11OrchestrationHarness,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { buildTripTrackingJobOptions } from './trip-tracking-queue.util';
import { resolveEndCycleToken } from './trip-end-cycle-reset';
import { TripTrackingHandoffLockContentionError } from './trip-tracking-lock-contention';

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

function buildPossibleEndCheckJob(
  fixture: TripR11PostgresFixture,
  requestedAt: Date,
): TripTrackingJobData {
  return {
    vehicleId: fixture.vehicle.id,
    organizationId: fixture.org.id,
    dimoTokenId: fixture.vehicle.dimoTokenId,
    trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
    requestedAt: requestedAt.toISOString(),
  };
}

async function runJobLikeTripTrackingProcessor(
  queue: Queue<TripTrackingJobData>,
  harness: TripR11OrchestrationHarness,
  bullJob: Job<TripTrackingJobData>,
): Promise<void> {
  try {
    await harness.runJob(bullJob.data);
  } catch (err) {
    if (err instanceof TripTrackingHandoffLockContentionError) {
      const token = bullJob.token;
      if (!token) throw err;
      await bullJob.moveToDelayed(Date.now() + err.delayMs, token);
      throw new DelayedError(err.message);
    }
    throw err;
  }
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R12 — PEC-held worker lock vs END_VALIDATION dispatch (Postgres + BullMQ)',
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

    async function seedPossibleEndWithStableDwell(): Promise<Date> {
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
      } finally {
        restoreTripR11Clock();
      }

      await purgeTripTrackingQueueJobs(trackingQueue);

      const afterPe = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterPe?.state).toBe(TripDetectionState.POSSIBLE_END);
      expect(afterPe?.possibleEndEnteredAt).not.toBeNull();
      expect(afterPe?.possibleEndAt).not.toBeNull();

      return new Date('2026-09-08T05:04:30.000Z');
    }

    it('lock-order regression — scheduleEndValidation never runs while PEC worker lock is held', async () => {
      const pecNow = await seedPossibleEndWithStableDwell();
      useTripR11FrozenClock(pecNow);

      const segments = buildTripR11SegmentsMock(fixture.expectedEndTime);
      const detectorRegistry = buildTripR11DetectorMock(fixture.expectedEndTime);
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        detectorRegistry,
      );

      let scheduleWhileLockHeld = false;
      const scheduleProto = TripDetectionOrchestrationService.prototype.scheduleEndValidation;
      const scheduleSpy = jest
        .spyOn(TripDetectionOrchestrationService.prototype, 'scheduleEndValidation')
        .mockImplementation(async function (
          this: TripDetectionOrchestrationService,
          vehicleId: string,
          organizationId: string | null,
          dimoTokenId: number,
          delayMs?: number,
        ) {
          const det = await prisma.vehicleTripDetectionState.findUnique({
            where: { vehicleId },
            select: { workerRunToken: true, workerLockedUntil: true },
          });
          const locked =
            det?.workerRunToken != null &&
            det.workerLockedUntil != null &&
            det.workerLockedUntil.getTime() > Date.now();
          if (locked) scheduleWhileLockHeld = true;
          return scheduleProto.call(
            this,
            vehicleId,
            organizationId,
            dimoTokenId,
            delayMs,
          );
        });

      const pecJobId = buildTripTrackingJobId('pec', fixture.vehicle.id, fixture.trip.id);
      const workers = createTripTrackingWorkers({
        connection: redisStack.connectionOptions,
        runJob: (job) => harness.runJob(job),
        workerCount: 2,
        concurrency: 1,
      });

      try {
        await trackingQueue.add(
          'trip-tracking',
          buildPossibleEndCheckJob(fixture, pecNow),
          {
            jobId: pecJobId,
            ...buildTripTrackingJobOptions(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
          },
        );

        await waitForHarnessCondition(async () => {
          const triggerRuns = await prisma.vehicleTripTrackingRun.count({
            where: {
              tripId: fixture.trip.id,
              runType: 'POSSIBLE_END_CHECK',
              resultSummary: { path: ['reason'], equals: 'triggering_cusum_validation' },
            },
          });
          return triggerRuns >= 1;
        }, 30_000, 'PEC triggering_cusum_validation');
      } finally {
        scheduleSpy.mockRestore();
        await closeTripTrackingWorkers(workers);
        restoreTripR11Clock();
      }

      expect(scheduleWhileLockHeld).toBe(false);
    }, 120_000);

    it('concurrent BullMQ workers — natural POSSIBLE_END → END_VALIDATION → FINALIZE → RESTING', async () => {
      const pecNow = await seedPossibleEndWithStableDwell();
      useTripR11FrozenClock(pecNow);

      const segments = buildTripR11SegmentsMock(fixture.expectedEndTime);
      const detectorRegistry = buildTripR11DetectorMock(fixture.expectedEndTime);
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        detectorRegistry,
      );

      const pecJobId = buildTripTrackingJobId('pec', fixture.vehicle.id, fixture.trip.id);
      const evJobId = buildTripTrackingJobId('ev', fixture.vehicle.id, fixture.trip.id);

      let evProcessorEntered = 0;
      let evLockMiss = 0;
      const acquireProto = TripDetectionOrchestrationService.prototype.acquireWorkerLock;
      const acquireSpy = jest
        .spyOn(TripDetectionOrchestrationService.prototype, 'acquireWorkerLock')
        .mockImplementation(async function (
          this: TripDetectionOrchestrationService,
          vehicleId: string,
          ttlMs?: number,
        ) {
          const stack = new Error().stack ?? '';
          const fromEndValidation = stack.includes('processEndValidation');
          const result = await acquireProto.call(this, vehicleId, ttlMs);
          if (fromEndValidation && !result.acquired) {
            evLockMiss += 1;
          }
          return result;
        });

      const workers = createTripTrackingWorkers({
        connection: redisStack.connectionOptions,
        runJob: async (jobData, jobId) => {
          if (jobData.trigger === TRIP_TRACKING_TRIGGERS.END_VALIDATION) {
            evProcessorEntered += 1;
          }
          const bullJob = await trackingQueue.getJob(jobId ?? '');
          if (!bullJob) {
            throw new Error(`missing BullMQ job ${jobId ?? '(no id)'}`);
          }
          await runJobLikeTripTrackingProcessor(trackingQueue, harness, bullJob);
        },
        workerCount: 2,
        concurrency: 1,
      });

      try {
        await trackingQueue.add(
          'trip-tracking',
          buildPossibleEndCheckJob(fixture, pecNow),
          {
            jobId: pecJobId,
            ...buildTripTrackingJobOptions(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
          },
        );

        await waitForHarnessCondition(async () => {
          const pecRuns = await prisma.vehicleTripTrackingRun.count({
            where: {
              tripId: fixture.trip.id,
              runType: 'POSSIBLE_END_CHECK',
              resultSummary: { path: ['reason'], equals: 'triggering_cusum_validation' },
            },
          });
          return pecRuns >= 1;
        }, 30_000, 'PEC schedule END_VALIDATION intent');

        await waitForHarnessCondition(async () => {
          const evRuns = await prisma.vehicleTripTrackingRun.count({
            where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
          });
          return evRuns >= 1;
        }, 30_000, 'END_VALIDATION tracking run');

        await waitForTripTerminalState({
          prisma,
          fixture,
          trackingQueue,
          timeoutMs: 60_000,
        });
      } finally {
        acquireSpy.mockRestore();
        await closeTripTrackingWorkers(workers);
        restoreTripR11Clock();
      }

      const evRuns = await prisma.vehicleTripTrackingRun.count({
        where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
      });
      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });

      expect(evProcessorEntered).toBeGreaterThanOrEqual(1);
      expect(evLockMiss).toBe(0);
      expect(evRuns).toBeGreaterThanOrEqual(1);
      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(trip?.endTime).toEqual(fixture.expectedEndTime);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(det?.activeTripId).toBeNull();
      expect(resolveEndCycleToken(det!)).toBeNull();
      expect(det?.possibleEndAt).toBeNull();
      expect(det?.possibleEndEnteredAt).toBeNull();
      expect(await countTripTrackingJobs(trackingQueue)).toBe(0);

      const evJob = await trackingQueue.getJob(evJobId);
      expect(evJob).toBeNull();
    }, 120_000);

    it('END_VALIDATION lock miss — processor moveToDelayed preserves authority and retries', async () => {
      const pecNow = await seedPossibleEndWithStableDwell();
      useTripR11FrozenClock(pecNow);

      const segments = buildTripR11SegmentsMock(fixture.expectedEndTime);
      const detectorRegistry = buildTripR11DetectorMock(fixture.expectedEndTime);
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        detectorRegistry,
      );

      const evJobId = buildTripTrackingJobId('ev', fixture.vehicle.id, fixture.trip.id);
      const heldLock = await TripDetectionOrchestrationService.prototype.acquireWorkerLock.call(
        harness.orchestration,
        fixture.vehicle.id,
      );
      expect(heldLock.acquired).toBe(true);

      await TripDetectionOrchestrationService.prototype.scheduleEndValidation.call(
        harness.orchestration,
        fixture.vehicle.id,
        fixture.org.id,
        fixture.vehicle.dimoTokenId,
      );

      const evJobBefore = await trackingQueue.getJob(evJobId);
      expect(evJobBefore).not.toBeNull();

      const workers = createTripTrackingWorkers({
        connection: redisStack.connectionOptions,
        runJob: async (jobData, jobId) => {
          const bullJob = await trackingQueue.getJob(jobId ?? '');
          if (!bullJob) throw new Error(`missing bull job ${jobId}`);
          await runJobLikeTripTrackingProcessor(trackingQueue, harness, bullJob);
        },
        workerCount: 1,
        concurrency: 1,
      });

      try {
        await waitForHarnessCondition(async () => {
          const job = await trackingQueue.getJob(evJobId);
          if (!job) return false;
          const state = await job.getState();
          return state === 'delayed';
        }, 15_000, 'END_VALIDATION lock-miss delayed state');

        const delayedJob = await trackingQueue.getJob(evJobId);
        expect(delayedJob).not.toBeNull();
        expect(await delayedJob!.getState()).toBe('delayed');

        await TripDetectionOrchestrationService.prototype.releaseWorkerLock.call(
          harness.orchestration,
          fixture.vehicle.id,
          heldLock.runToken!,
        );

        await promoteDelayedTripTrackingJobs(trackingQueue);

        await waitForTripTerminalState({
          prisma,
          fixture,
          trackingQueue,
          timeoutMs: 60_000,
        });

        const evRuns = await prisma.vehicleTripTrackingRun.count({
          where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
        });
        expect(evRuns).toBeGreaterThanOrEqual(1);
      } finally {
        await closeTripTrackingWorkers(workers);
        restoreTripR11Clock();
      }
    }, 120_000);
  },
);

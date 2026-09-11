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
  purgeTripTrackingQueueJobs,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  waitForHarnessCondition,
  waitForTripTerminalStateNatural,
  type TripR11OrchestrationHarness,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { buildTripTrackingJobOptions } from './trip-tracking-queue.util';
import { resolveEndCycleToken } from './trip-end-cycle-reset';
import {
  TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS,
  TripTrackingHandoffLockContentionError,
} from './trip-tracking-lock-contention';

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
        runJob: (job) => harness.runJob(job.data),
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
        runJob: async (bullJob) => {
          if (bullJob.data.trigger === TRIP_TRACKING_TRIGGERS.END_VALIDATION) {
            evProcessorEntered += 1;
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

        const { manualPromoteCount } = await waitForTripTerminalStateNatural({
          prisma,
          fixture,
          trackingQueue,
          timeoutMs: 60_000,
        });

        expect(manualPromoteCount).toBe(0);
      } finally {
        acquireSpy.mockRestore();
        await closeTripTrackingWorkers(workers);
        restoreTripR11Clock();
      }

      const evRuns = await prisma.vehicleTripTrackingRun.count({
        where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
      });
      const finRuns = await prisma.vehicleTripTrackingRun.count({
        where: { tripId: fixture.trip.id, runType: 'FINALIZATION_CHECK' },
      });
      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });

      expect(evProcessorEntered).toBeGreaterThanOrEqual(1);
      expect(evLockMiss).toBe(0);
      expect(evRuns).toBeGreaterThanOrEqual(1);
      expect(finRuns).toBeGreaterThanOrEqual(1);
      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(trip?.endTime).toEqual(fixture.expectedEndTime);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(det?.activeTripId).toBeNull();
      expect(resolveEndCycleToken(det!)).toBeNull();
      expect(det?.possibleEndAt).toBeNull();
      expect(det?.possibleEndEnteredAt).toBeNull();
      expect(await countTripTrackingJobs(trackingQueue)).toBe(0);

      const evJob = await trackingQueue.getJob(evJobId);
      expect(evJob ?? null).toBeNull();
    }, 120_000);

    it('END_VALIDATION lock miss — BullMQ natural delayed retry completes terminal chain', async () => {
      const pecNow = await seedPossibleEndWithStableDwell();
      restoreTripR11Clock();

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

      let evProcessorEntries = 0;
      let lockMissAt: number | null = null;
      let delayedUntil: number | null = null;

      const workers = createTripTrackingWorkers({
        connection: redisStack.connectionOptions,
        runJob: async (bullJob) => {
          if (bullJob.data.trigger === TRIP_TRACKING_TRIGGERS.END_VALIDATION) {
            evProcessorEntries += 1;
          }
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
          if (state === 'delayed') {
            if (lockMissAt == null) lockMissAt = Date.now();
            delayedUntil = (job.timestamp ?? Date.now()) + (job.delay ?? 0);
            return true;
          }
          return false;
        }, 15_000, 'END_VALIDATION lock-miss delayed state');

        const delayedJob = await trackingQueue.getJob(evJobId);
        expect(delayedJob).not.toBeNull();
        expect(await delayedJob!.getState()).toBe('delayed');
        expect(evProcessorEntries).toBeGreaterThanOrEqual(1);

        await TripDetectionOrchestrationService.prototype.releaseWorkerLock.call(
          harness.orchestration,
          fixture.vehicle.id,
          heldLock.runToken!,
        );

        let retryProcessorEntryAt: number | null = null;
        await waitForHarnessCondition(async () => {
          const evRuns = await prisma.vehicleTripTrackingRun.count({
            where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
          });
          if (evRuns >= 1) {
            if (retryProcessorEntryAt == null) retryProcessorEntryAt = Date.now();
            return true;
          }
          return false;
        }, TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS + 20_000, 'END_VALIDATION natural retry');

        expect(retryProcessorEntryAt).not.toBeNull();
        expect(lockMissAt).not.toBeNull();
        const observedRetryDelayMs = retryProcessorEntryAt! - lockMissAt!;
        expect(observedRetryDelayMs).toBeGreaterThanOrEqual(
          TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS - 2_000,
        );

        await waitForTripTerminalStateNatural({
          prisma,
          fixture,
          trackingQueue,
          timeoutMs: 60_000,
        });

        // Structured metrics for evidence scripts
        // eslint-disable-next-line no-console
        console.log(
          JSON.stringify({
            LOCK_MISS_AT: lockMissAt,
            DELAYED_UNTIL: delayedUntil,
            RETRY_PROCESSOR_ENTRY_AT: retryProcessorEntryAt,
            OBSERVED_RETRY_DELAY_MS: observedRetryDelayMs,
            EV_LOCK_MISS_MOVED_TO_DELAYED: true,
            EV_LOCK_MISS_NATURAL_RETRY: true,
          }),
        );
      } finally {
        await closeTripTrackingWorkers(workers);
      }
    }, 120_000);

    it('FINALIZE primary lock miss — moveToDelayed natural retry preserves terminal authority', async () => {
      await seedPossibleEndWithStableDwell();
      restoreTripR11Clock();

      const segments = buildTripR11SegmentsMock(fixture.expectedEndTime);
      const detectorRegistry = buildTripR11DetectorMock(fixture.expectedEndTime);
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        detectorRegistry,
      );

      const finJobId = buildTripTrackingJobId('fin', fixture.vehicle.id, fixture.trip.id);
      const heldLock = await TripDetectionOrchestrationService.prototype.acquireWorkerLock.call(
        harness.orchestration,
        fixture.vehicle.id,
      );
      expect(heldLock.acquired).toBe(true);

      await TripDetectionOrchestrationService.prototype.scheduleFinalize.call(
        harness.orchestration,
        fixture.vehicle.id,
        fixture.org.id,
        fixture.vehicle.dimoTokenId,
      );

      let finProcessorEntries = 0;
      let lockMissObserved = false;
      let jobMarkedSuccessAndLost = false;

      const workers = createTripTrackingWorkers({
        connection: redisStack.connectionOptions,
        runJob: async (bullJob) => {
          if (bullJob.data.trigger === TRIP_TRACKING_TRIGGERS.FINALIZE) {
            finProcessorEntries += 1;
          }
          const jobBefore = await trackingQueue.getJob(finJobId);
          await runJobLikeTripTrackingProcessor(trackingQueue, harness, bullJob);
          const jobAfter = await trackingQueue.getJob(finJobId);
          if (
            jobBefore &&
            (await jobBefore.getState()) === 'active' &&
            !jobAfter &&
            finProcessorEntries === 1
          ) {
            jobMarkedSuccessAndLost = true;
          }
        },
        workerCount: 1,
        concurrency: 1,
      });

      try {
        await waitForHarnessCondition(async () => {
          const job = await trackingQueue.getJob(finJobId);
          if (!job) return false;
          const state = await job.getState();
          if (state === 'delayed') {
            lockMissObserved = true;
            return true;
          }
          return false;
        }, 15_000, 'FINALIZE lock-miss delayed state');

        expect(lockMissObserved).toBe(true);
        expect(jobMarkedSuccessAndLost).toBe(false);

        await TripDetectionOrchestrationService.prototype.releaseWorkerLock.call(
          harness.orchestration,
          fixture.vehicle.id,
          heldLock.runToken!,
        );

        await waitForHarnessCondition(async () => {
          const finRuns = await prisma.vehicleTripTrackingRun.count({
            where: { tripId: fixture.trip.id, runType: 'FINALIZATION_CHECK' },
          });
          return finRuns >= 1;
        }, TRIP_TRACKING_HANDOFF_LOCK_DEFERRAL_MS + 20_000, 'FINALIZE natural retry');

        await waitForTripTerminalStateNatural({
          prisma,
          fixture,
          trackingQueue,
          timeoutMs: 60_000,
        });
      } finally {
        await closeTripTrackingWorkers(workers);
      }

      const finRuns = await prisma.vehicleTripTrackingRun.count({
        where: { tripId: fixture.trip.id, runType: 'FINALIZATION_CHECK' },
      });
      const completedTrips = await prisma.vehicleTrip.count({
        where: { id: fixture.trip.id, tripStatus: TripStatus.COMPLETED },
      });
      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });

      expect(finProcessorEntries).toBeGreaterThanOrEqual(2);
      expect(finRuns).toBeGreaterThanOrEqual(1);
      expect(completedTrips).toBe(1);
      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(det?.activeTripId).toBeNull();
      expect(await countTripTrackingJobs(trackingQueue)).toBe(0);

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          FINALIZE_PRIMARY_LOCK_MISS_OBSERVED: lockMissObserved,
          FINALIZE_JOB_MARKED_SUCCESS_AND_LOST: jobMarkedSuccessAndLost,
          FINALIZE_MOVED_TO_DELAYED: lockMissObserved,
          FINALIZE_EVENTUAL_RETRY: finProcessorEntries >= 2,
          FINALIZE_COMPLETED_TRIP: trip?.tripStatus === TripStatus.COMPLETED,
          FINALIZE_RESTING: det?.state === TripDetectionState.RESTING,
          FINALIZE_ACTIVE_TRIP_ID_NULL: det?.activeTripId === null,
          DUPLICATE_FINALIZE_AUTHORITY: completedTrips > 1,
        }),
      );
    }, 120_000);
  },
);

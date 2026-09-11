import { PrismaClient, TripDetectionState } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import {
  TRIP_TRACKING_TRIGGERS,
  type TripTrackingJobData,
} from './trip-detection.types';
import { computeEmptyCoreBackoffMs } from './trip-empty-core-backoff';
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
  drainTripTrackingQueue,
  getActiveTickJobDelayMs,
  probeTripR11Postgres,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { enqueueRecoveryTripTrackingJob } from './trip-tracking-queue.util';

const LIVE = process.env.TRIP_R11_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_R11_POSTGRES_REDIS_REQUIRED === '1';

if (REQUIRED && !LIVE) {
  throw new Error('TRIP_R11_POSTGRES_REDIS_REQUIRED=1 but integration flag missing');
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R11 Scenario I — backoff, wake, concurrency (Postgres + BullMQ)',
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
      fixture = await createTripR11ActiveTripFixture(prisma, {
        lastMovementAt: new Date('2026-09-08T05:00:00.000Z'),
        stopBoundaryAt: new Date('2026-09-08T05:00:05.000Z'),
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

    async function buildHarnessWithAbsentVls() {
      await prisma.vehicleLatestState.delete({ where: { vehicleId: fixture.vehicle.id } });
      // No trusted stop boundary — empty-core UNKNOWN should surface vls_row_absent,
      // not stop_boundary_untrusted_worker_time from a pre-seeded idle_within_trip latch.
      await prisma.vehicleTripDetectionState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          lastEvidenceSummary: {
            lastProviderActivityAt: fixture.lastMovementAt.toISOString(),
          },
        },
      });
      const segments = buildTripR11SegmentsMock(fixture.expectedEndTime);
      segments.fetchRawTripCoreData.mockResolvedValue([]);
      const detectorRegistry = buildTripR11DetectorMock(fixture.expectedEndTime);
      return buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        detectorRegistry,
      );
    }

    it('I-a — empty-core UNKNOWN schedules long backoff on BullMQ', async () => {
      const harness = await buildHarnessWithAbsentVls();
      const tickAt = new Date('2026-09-08T05:02:30.000Z');
      useTripR11FrozenClock(tickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, tickAt));
        const det = await prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId: fixture.vehicle.id },
        });
        expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);
        const summary = det?.lastEvidenceSummary as Record<string, unknown>;
        expect(summary.innerGateReason).toBe('vls_row_absent');
        expect(summary.emptyCoreDeferralStreak).toBe(1);

        const delayMs = await getActiveTickJobDelayMs(trackingQueue, fixture);
        expect(delayMs).toBe(
          computeEmptyCoreBackoffMs({
            baseIntervalMs: 30_000,
            consecutiveDeferrals: 1,
            backoffBaseMs: 30_000,
            backoffMaxMs: 600_000,
            jitterRatio: 0,
          }),
        );
      } finally {
        restoreTripR11Clock();
      }
    }, 60_000);

    it('I-b — wake preempts delayed backoff without losing follow-up work', async () => {
      const harness = await buildHarnessWithAbsentVls();
      const tickAt = new Date('2026-09-08T05:02:30.000Z');
      useTripR11FrozenClock(tickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, tickAt));
        const beforeDelay = await getActiveTickJobDelayMs(trackingQueue, fixture);
        expect(beforeDelay).toBeGreaterThanOrEqual(30_000);

        await TripDetectionOrchestrationService.prototype.accelerateActiveTickAfterWake.call(
          harness.orchestration,
          fixture.vehicle.id,
          fixture.org.id,
          fixture.vehicle.dimoTokenId,
        );

        const afterDelay = await getActiveTickJobDelayMs(trackingQueue, fixture);
        expect(afterDelay).toBe(0);
        expect(await countTripTrackingJobs(trackingQueue)).toBe(1);
      } finally {
        restoreTripR11Clock();
      }
    }, 60_000);

    it('I-c — duplicate wake enqueue does not create retry loop', async () => {
      const harness = await buildHarnessWithAbsentVls();
      const tickAt = new Date('2026-09-08T05:02:30.000Z');
      useTripR11FrozenClock(tickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, tickAt));
        await TripDetectionOrchestrationService.prototype.accelerateActiveTickAfterWake.call(
          harness.orchestration,
          fixture.vehicle.id,
          fixture.org.id,
          fixture.vehicle.dimoTokenId,
        );
        await TripDetectionOrchestrationService.prototype.accelerateActiveTickAfterWake.call(
          harness.orchestration,
          fixture.vehicle.id,
          fixture.org.id,
          fixture.vehicle.dimoTokenId,
        );
        expect(await countTripTrackingJobs(trackingQueue)).toBe(1);
      } finally {
        restoreTripR11Clock();
      }
    }, 60_000);

    it('I-d — end-cycle finalize job is not delayed by empty-core backoff slot', async () => {
      const harness = await buildHarnessWithAbsentVls();
      const tickAt = new Date('2026-09-08T05:02:30.000Z');
      useTripR11FrozenClock(tickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, tickAt));
        const atDelay = await getActiveTickJobDelayMs(trackingQueue, fixture);
        expect(atDelay).toBeGreaterThanOrEqual(30_000);

        await prisma.vehicleTripDetectionState.update({
          where: { vehicleId: fixture.vehicle.id },
          data: {
            state: TripDetectionState.POSSIBLE_END,
            possibleEndAt: fixture.stopBoundaryAt,
            possibleEndEnteredAt: tickAt,
          },
        });

        await TripDetectionOrchestrationService.prototype.scheduleFinalize.call(
          harness.orchestration,
          fixture.vehicle.id,
          fixture.org.id,
          fixture.vehicle.dimoTokenId,
        );

        const finJob = await trackingQueue.getJob(
          buildTripTrackingJobId('fin', fixture.vehicle.id, fixture.trip.id),
        );
        expect(finJob).not.toBeNull();
        expect(finJob!.delay ?? 0).toBe(0);
        expect(await getActiveTickJobDelayMs(trackingQueue, fixture)).toBe(atDelay);
      } finally {
        restoreTripR11Clock();
      }
    }, 60_000);

    it('I-e — recovery enqueue after worker restart preserves active tick wake path', async () => {
      const harness = await buildHarnessWithAbsentVls();
      const outcome = await enqueueRecoveryTripTrackingJob({
        queue: trackingQueue,
        vehicleId: fixture.vehicle.id,
        jobName: 'trip-tracking',
        data: {
          vehicleId: fixture.vehicle.id,
          organizationId: fixture.org.id,
          dimoTokenId: fixture.vehicle.dimoTokenId,
          trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
          requestedAt: new Date().toISOString(),
        },
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
      });
      expect(outcome).toBe('enqueued');
      const recoveryJob = await trackingQueue.getJob(`trip-recovery-${fixture.vehicle.id}`);
      expect(recoveryJob).not.toBeNull();
    }, 30_000);

    it('I-f — two workers with concurrent wake/tick leave one durable follow-up job', async () => {
      const harness = await buildHarnessWithAbsentVls();
      const workers = createTripTrackingWorkers({
        connection: redisStack.connectionOptions,
        runJob: (bullJob) => harness.runJob(bullJob.data),
        workerCount: 2,
        concurrency: 1,
      });

      try {
        const tickAt = new Date('2026-09-08T05:02:30.000Z');
        useTripR11FrozenClock(tickAt);
        await harness.runJob(buildActiveTickJob(fixture, tickAt));
        await TripDetectionOrchestrationService.prototype.accelerateActiveTickAfterWake.call(
          harness.orchestration,
          fixture.vehicle.id,
          fixture.org.id,
          fixture.vehicle.dimoTokenId,
        );
        restoreTripR11Clock();

        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(await countTripTrackingJobs(trackingQueue)).toBeLessThanOrEqual(2);

        const runs = await prisma.vehicleTripTrackingRun.count({
          where: { vehicleId: fixture.vehicle.id },
        });
        expect(runs).toBeGreaterThanOrEqual(1);
      } finally {
        await closeTripTrackingWorkers(workers);
      }
    }, 60_000);
  },
);

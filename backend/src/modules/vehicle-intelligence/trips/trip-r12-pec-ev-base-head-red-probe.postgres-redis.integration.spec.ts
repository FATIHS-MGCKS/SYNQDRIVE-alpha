/**
 * Portable BASE vs HEAD behavioral probe for PEC/EV lock-order regression.
 * Copied into isolated git worktrees by trip-r12-pec-ev-base-head-red-proof.sh.
 *
 * Emits PROBE_METRIC=<json> lines for shell validation — never treat infra failures as RED.
 */
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
  createTripR11ActiveTripFixture,
  createTripTrackingWorkers,
  probeTripR11Postgres,
  purgeTripTrackingQueueJobs,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  waitForHarnessCondition,
  type TripR11OrchestrationHarness,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { buildTripTrackingJobOptions } from './trip-tracking-queue.util';

const LIVE = process.env.TRIP_R12_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_R12_POSTGRES_REDIS_REQUIRED === '1';

function emitMetric(name: string, value: unknown): void {
  // eslint-disable-next-line no-console
  console.log(`PROBE_METRIC ${name}=${JSON.stringify(value)}`);
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
  harness: TripR11OrchestrationHarness,
  bullJob: Job<TripTrackingJobData>,
): Promise<void> {
  try {
    await harness.runJob(bullJob.data);
  } catch (err: unknown) {
    const contentionModule = await import('./trip-tracking-lock-contention').catch(() => null);
    const ContentionError = contentionModule?.TripTrackingHandoffLockContentionError;
    if (ContentionError && err instanceof ContentionError) {
      const token = bullJob.token;
      if (!token) throw err;
      await bullJob.moveToDelayed(Date.now() + err.delayMs, token);
      throw new DelayedError(err.message);
    }
    throw err;
  }
}

async function waitForNaturalTerminal(params: {
  prisma: PrismaClient;
  fixture: TripR11PostgresFixture;
  timeoutMs: number;
}): Promise<boolean> {
  const deadline = Date.now() + params.timeoutMs;
  while (Date.now() < deadline) {
    const trip = await params.prisma.vehicleTrip.findUnique({
      where: { id: params.fixture.trip.id },
    });
    const det = await params.prisma.vehicleTripDetectionState.findUnique({
      where: { vehicleId: params.fixture.vehicle.id },
    });
    if (
      trip?.tripStatus === TripStatus.COMPLETED &&
      det?.state === TripDetectionState.RESTING &&
      det?.activeTripId === null
    ) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

(LIVE ? describe : describe.skip)(
  'TDL-PROBE-R12 — portable BASE/HEAD PEC→EV lock-order behavioral probe',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let redisStack: Awaited<ReturnType<typeof startTripR11RedisStack>>;
    let trackingQueue: Queue<TripTrackingJobData>;
    let fixture: TripR11PostgresFixture;
    let infraError: string | null = null;

    beforeAll(async () => {
      try {
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
      } catch (err) {
        infraError = err instanceof Error ? err.message : String(err);
      }
    }, 120_000);

    afterAll(async () => {
      emitMetric('BASE_TEST_INFRASTRUCTURE_ERROR', infraError != null);
      if (infraError) emitMetric('INFRA_ERROR_DETAIL', infraError);
      await trackingQueue?.close().catch(() => undefined);
      await prisma?.$disconnect().catch(() => undefined);
      if (redisStack) await stopTripR11RedisStack(redisStack);
    }, 60_000);

    it('captures causal PEC→EV observations for BASE/HEAD comparison', async () => {
      if (infraError) {
        throw new Error(`Probe infrastructure error: ${infraError}`);
      }
      if (!dbOk) return;

      await trackingQueue.obliterate({ force: true });
      fixture = await createTripR11ActiveTripFixture(prisma, {
        stopBoundarySource: 'provider_stationary_vls',
      });

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

      const pecNow = new Date('2026-09-08T05:04:30.000Z');
      useTripR11FrozenClock(pecNow);

      let scheduleWhilePecLockHeld = false;
      let evProcessorEntry = false;
      let evLockMiss = false;
      let finalizeReached = false;

      const scheduleProto = TripDetectionOrchestrationService.prototype.scheduleEndValidation;
      jest
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
          if (locked) scheduleWhilePecLockHeld = true;
          return scheduleProto.call(this, vehicleId, organizationId, dimoTokenId, delayMs);
        });

      const acquireProto = TripDetectionOrchestrationService.prototype.acquireWorkerLock;
      jest
        .spyOn(TripDetectionOrchestrationService.prototype, 'acquireWorkerLock')
        .mockImplementation(async function (
          this: TripDetectionOrchestrationService,
          vehicleId: string,
          ttlMs?: number,
        ) {
          const stack = new Error().stack ?? '';
          const fromEndValidation = stack.includes('processEndValidation');
          const fromFinalize = stack.includes('processFinalize');
          const result = await acquireProto.call(this, vehicleId, ttlMs);
          if (fromEndValidation) {
            evProcessorEntry = true;
            if (!result.acquired) evLockMiss = true;
          }
          if (fromFinalize && result.acquired) finalizeReached = true;
          return result;
        });

      const pecJobId = buildTripTrackingJobId('pec', fixture.vehicle.id, fixture.trip.id);
      const workers = createTripTrackingWorkers({
        connection: redisStack.connectionOptions,
        runJob: async (bullJob) => runJobLikeTripTrackingProcessor(harness, bullJob),
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
        }, 30_000, 'PEC triggering_cusum_validation');

        restoreTripR11Clock();

        await waitForNaturalTerminal({
          prisma,
          fixture,
          timeoutMs: 60_000,
        });
      } finally {
        jest.restoreAllMocks();
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

      const terminal =
        trip?.tripStatus === TripStatus.COMPLETED &&
        det?.state === TripDetectionState.RESTING &&
        det?.activeTripId === null;

      emitMetric('PROBE_EXECUTED', true);
      emitMetric('SCHEDULE_WHILE_PEC_LOCK_HELD', scheduleWhilePecLockHeld);
      emitMetric('EV_PROCESSOR_ENTRY', evProcessorEntry);
      emitMetric('EV_LOCK_MISS', evLockMiss);
      emitMetric('EV_TRACKING_RUN_COUNT', evRuns);
      emitMetric('FINALIZE_REACHED', finalizeReached);
      emitMetric('TRIP_COMPLETED', trip?.tripStatus === TripStatus.COMPLETED);
      emitMetric('RESTING', det?.state === TripDetectionState.RESTING);
      emitMetric('TERMINAL_STATE', terminal ? 'TERMINAL' : 'NONTERMINAL');

      await cleanupTripR11Fixture(prisma, fixture);

      expect(true).toBe(true);
    }, 180_000);
  },
);

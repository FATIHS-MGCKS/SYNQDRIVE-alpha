import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { type TripTrackingJobData } from './trip-detection.types';
import {
  buildActiveTickJob,
  buildKs661EmptyCoreSegmentsMock,
  buildKs661IdleTransitionSegmentsMock,
  buildTripR11DetectorMock,
  buildTripR11OrchestrationHarness,
  buildTripTrackingJobId,
  cleanupTripR11Fixture,
  countTripTrackingJobs,
  createTripR11Ks661PreIdleFixture,
  drainTripTrackingQueue,
  probeTripR11Postgres,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  type TripR11PostgresFixture,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { readStopBoundaryAt } from './trip-fsm-evidence-state';
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
    throw new Error('TRIP R11 integration requires CI-local DATABASE_URL');
  }
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R11 Scenario J — stop boundary generation + completion chain (Postgres + BullMQ)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let redisStack: Awaited<ReturnType<typeof startTripR11RedisStack>>;
    let trackingQueue: Queue<TripTrackingJobData>;
    let fixture: TripR11PostgresFixture;

    const vlsObservedAt = new Date('2026-09-08T19:59:22.000Z');
    const idleTickAt = new Date('2026-09-08T19:59:56.000Z');
    const emptyCoreTickAt = new Date('2026-09-08T20:02:00.000Z');
    const endCycleAt = new Date('2026-09-08T20:04:30.000Z');

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
      fixture = await createTripR11Ks661PreIdleFixture(prisma);
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

    it('J — ACTIVE_TRIP → IDLE sets stopBoundaryAt → empty-core → R10 finalize (KS661 reconstructed)', async () => {
      if (!dbOk) return;
      expect(fixture.stopBoundaryPreseeded).toBe(false);

      const before = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(before?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(readStopBoundaryAt(before?.lastEvidenceSummary as Record<string, unknown>)).toBeNull();

      const idleSegments = buildKs661IdleTransitionSegmentsMock(vlsObservedAt);
      const emptySegments = buildKs661EmptyCoreSegmentsMock(fixture.expectedEndTime);
      idleSegments.fetchEndValidationWindow = emptySegments.fetchEndValidationWindow;

      const detectorRegistry = buildTripR11DetectorMock(fixture.expectedEndTime);
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        idleSegments,
        detectorRegistry,
      );

      useTripR11FrozenClock(idleTickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, idleTickAt));
      } finally {
        restoreTripR11Clock();
      }

      const afterIdle = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterIdle?.state).toBe(TripDetectionState.IDLE_WITHIN_TRIP);
      const idleSummary = afterIdle?.lastEvidenceSummary as Record<string, unknown>;
      expect(idleSummary.stopBoundaryAt).toBe(vlsObservedAt.toISOString());
      expect(idleSummary.stopBoundarySource).toBe('provider_stationary_vls');
      expect(idleSummary.lastProviderActivityAt).toBe(vlsObservedAt.toISOString());

      harness.segments.fetchRawTripCoreData = emptySegments.fetchRawTripCoreData;
      harness.segments.fetchPerformance = emptySegments.fetchPerformance;

      useTripR11FrozenClock(emptyCoreTickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, emptyCoreTickAt));
      } finally {
        restoreTripR11Clock();
      }

      const afterEmptyCore = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterEmptyCore?.state).toBe(TripDetectionState.POSSIBLE_END);
      expect(afterEmptyCore?.activeTripId).toBe(fixture.trip.id);
      expect(afterEmptyCore?.possibleEndEnteredAt?.toISOString()).toBe(
        emptyCoreTickAt.toISOString(),
      );
      const emptySummary = afterEmptyCore?.lastEvidenceSummary as Record<string, unknown>;
      expect(emptySummary.innerGateReason).toBe('boundary_backed_provider_silence');
      expect(emptySummary.emptyCoreDecision).toBe('POSSIBLE_END');
      expect(emptySummary.vlsEvidenceState).toBe('UNKNOWN');

      const pecJobId = buildTripTrackingJobId(
        'pec',
        fixture.vehicle.id,
        fixture.trip.id,
      );
      expect(await trackingQueue.getJob(pecJobId)).not.toBeNull();

      useTripR11FrozenClock(endCycleAt);
      try {
        const steps = await drainTripTrackingQueue({
          queue: trackingQueue,
          runJob: harness.runJob,
        });
        expect(steps).toBeGreaterThanOrEqual(3);
      } finally {
        restoreTripR11Clock();
      }

      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });

      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(trip?.endTime).toEqual(fixture.expectedEndTime);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(det?.activeTripId).toBeNull();
      expect(det?.possibleEndEnteredAt).toBeNull();
      expect(det?.possibleEndAt).toBeNull();
      expect(resolveEndCycleToken(det!)).toBeNull();
      expect(await countTripTrackingJobs(trackingQueue)).toBe(0);

      const repairs = await prisma.tripRepair.findMany({
        where: { tripId: fixture.trip.id },
      });
      expect(repairs.some((r) => r.repairType === 'STALE_ONGOING')).toBe(false);
    }, 120_000);
  },
);

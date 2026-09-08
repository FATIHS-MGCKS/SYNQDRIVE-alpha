import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';

import {
  buildTripFinalizeIntegrationOrchestration,
  cleanupTripFinalizePostgresFixture,
  consumeTripTrackingFinalizeJob,
  createInMemoryTripTrackingQueue,
  createTripFinalizePostgresFixture,
  enqueueLegacyFinalizeJob,
  probeTripFinalizeDatabase,
  scheduleFinalizeThroughQueue,
  type TripFinalizePostgresFixture,
} from '../testing/trip-finalize-end-cycle-postgres.integration.harness';

const LIVE = process.env.TRIP_FINALIZE_POSTGRES_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_FINALIZE_POSTGRES_REQUIRED === '1';

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TRIP_FINALIZE_POSTGRES_REQUIRED=1 but TRIP_FINALIZE_POSTGRES_INTEGRATION is not 1',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    throw new Error('TRIP_FINALIZE_POSTGRES_REQUIRED=1 but DATABASE_URL is unset');
  }
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error(
      'TRIP_FINALIZE_POSTGRES_REQUIRED=1 but DATABASE_URL is not CI-local (127.0.0.1/localhost)',
    );
  }
}

(LIVE ? describe : describe.skip)(
  'Trip finalize end-cycle PostgreSQL integration (DATABASE_URL)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let fixture: TripFinalizePostgresFixture;

    beforeAll(async () => {
      dbOk = await probeTripFinalizeDatabase();
      if (REQUIRED && !dbOk) {
        throw new Error(
          'Trip finalize PostgreSQL probe failed in required CI integration mode',
        );
      }
      if (!dbOk) return;
      prisma = new PrismaClient();
      RuntimeStatusRegistry.setWorkersEnabled(true);
    }, 60_000);

    beforeEach(async () => {
      expect(dbOk).toBe(true);
      fixture = await createTripFinalizePostgresFixture(prisma);
    });

    afterEach(async () => {
      if (!dbOk || !fixture) return;
      await cleanupTripFinalizePostgresFixture(prisma, fixture);
    });

    afterAll(async () => {
      if (prisma) await prisma.$disconnect().catch(() => undefined);
    });

    /**
     * Real components: Prisma, TripDecisionEngine.finalizeTrip,
     * orchestration transitionState/acquireWorkerLock/processFinalize/scheduleFinalize.
     * Substituted: BullMQ (in-memory queue), post-finalize producers, DIMO/CH/metrics.
     */
    it('A — scheduleFinalize → queue → consumer persists COMPLETED + RESTING', async () => {
      const queue = createInMemoryTripTrackingQueue();
      const orchestration = buildTripFinalizeIntegrationOrchestration(prisma, queue);

      const job = await scheduleFinalizeThroughQueue(orchestration, fixture);
      expect(job).toBeDefined();
      expect(job?.endCycleToken).toBe(fixture.cycleToken);
      expect(queue.added).toHaveLength(1);

      await consumeTripTrackingFinalizeJob(orchestration, job!);

      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });

      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(trip?.endTime).toEqual(fixture.endTime);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(det?.activeTripId).toBeNull();
      expect(det?.possibleEndEnteredAt).toBeNull();
      expect(det?.possibleEndAt).toBeNull();
    });

    it('B — stale legacy cycle-A job cannot mutate cycle-B state', async () => {
      const queue = createInMemoryTripTrackingQueue();
      const orchestration = buildTripFinalizeIntegrationOrchestration(prisma, queue);

      const staleJob = await enqueueLegacyFinalizeJob({
        queue,
        fixture,
        requestedAt: '2026-09-08T04:50:08.000Z',
      });
      await consumeTripTrackingFinalizeJob(orchestration, staleJob);

      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trip?.tripStatus).toBe(TripStatus.ONGOING);
      expect(trip?.endTime).toBeNull();
      expect(det?.state).toBe(TripDetectionState.POSSIBLE_END);
      expect(det?.activeTripId).toBe(fixture.trip.id);
      expect(det?.possibleEndEnteredAt?.toISOString()).toBe(fixture.cycleToken);
    });

    it('C — valid cycle-B job completes after legacy cycle-A rejected', async () => {
      const queue = createInMemoryTripTrackingQueue();
      const orchestration = buildTripFinalizeIntegrationOrchestration(prisma, queue);

      await consumeTripTrackingFinalizeJob(
        orchestration,
        await enqueueLegacyFinalizeJob({
          queue,
          fixture,
          requestedAt: '2026-09-08T04:50:08.000Z',
        }),
      );

      const validJob = await scheduleFinalizeThroughQueue(orchestration, fixture);
      expect(validJob?.endCycleToken).toBe(fixture.cycleToken);
      await consumeTripTrackingFinalizeJob(orchestration, validJob!);

      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(trip?.endTime).toEqual(fixture.endTime);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(det?.activeTripId).toBeNull();
    });

    it('D — duplicate consumer execution does not double-complete', async () => {
      const queue = createInMemoryTripTrackingQueue();
      const orchestration = buildTripFinalizeIntegrationOrchestration(prisma, queue);
      const job = (await scheduleFinalizeThroughQueue(orchestration, fixture))!;

      await consumeTripTrackingFinalizeJob(orchestration, job);
      await consumeTripTrackingFinalizeJob(orchestration, job);

      const trips = await prisma.vehicleTrip.findMany({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trips).toHaveLength(1);
      expect(trips[0]?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(trips[0]?.endTime).toEqual(fixture.endTime);

      const completedCount = await prisma.vehicleTrip.count({
        where: { vehicleId: fixture.vehicle.id, tripStatus: TripStatus.COMPLETED },
      });
      expect(completedCount).toBe(1);

      const trackingRuns = await prisma.vehicleTripTrackingRun.findMany({
        where: { vehicleId: fixture.vehicle.id, runType: 'FINALIZATION_CHECK' },
      });
      expect(trackingRuns.length).toBeGreaterThanOrEqual(1);

      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(det?.activeTripId).toBeNull();
    });
  },
);

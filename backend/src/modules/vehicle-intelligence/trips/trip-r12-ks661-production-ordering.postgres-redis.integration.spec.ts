import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { type TripTrackingJobData } from './trip-detection.types';
import {
  buildActiveTickJob,
  buildTripR11DetectorMock,
  buildTripR11OrchestrationHarness,
  buildTripTrackingJobId,
  cleanupTripR11Fixture,
  countTripTrackingJobs,
  drainTripTrackingQueue,
  probeTripR11Postgres,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  type TripR11PostgresFixture,
  type TripR11SegmentsMock,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { readPauseDetectedAt, readStopBoundaryAt } from './trip-fsm-evidence-state';
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

/** Approximated from TDL-EVID-KS-MS-661-R11-NATURAL-001 — not invented facts. */
const FINAL_STOP_VLS = new Date('2026-09-09T05:07:00.000Z');
const FINAL_STOP_BOUNDARY = new Date('2026-09-09T05:06:58.562Z');
const LAST_MOVEMENT = new Date('2026-09-09T05:06:49.562Z');
const TRIP_START = new Date('2026-09-09T04:37:00.000Z');

async function createKs661R12ActiveFixture(
  prisma: PrismaClient,
): Promise<TripR11PostgresFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dimoTokenId = 920000 + Math.floor(Math.random() * 1000);
  const org = await prisma.organization.create({
    data: {
      companyName: `Trip R12 KS661 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `R12-${suffix}`.slice(0, 12),
      make: 'Audi',
      model: 'A4',
      year: 2024,
      fuelType: 'GASOLINE',
      status: 'AVAILABLE',
    },
    select: { id: true, organizationId: true },
  });
  const trip = await prisma.vehicleTrip.create({
    data: {
      vehicleId: vehicle.id,
      tripStatus: TripStatus.ONGOING,
      startTime: TRIP_START,
      startLatitude: 51.33,
      startLongitude: 9.5,
      distanceKm: 17,
      rawDetectionMeta: {},
    },
    select: { id: true, startTime: true },
  });
  await prisma.vehicleTripDetectionState.create({
    data: {
      vehicleId: vehicle.id,
      organizationId: org.id,
      state: TripDetectionState.ACTIVE_TRIP,
      detectionProfile: 'ICE',
      activeTripId: trip.id,
      possibleStartAt: TRIP_START,
      lastMeaningfulMovementAt: LAST_MOVEMENT,
      lastActivityAt: LAST_MOVEMENT,
      lastCoreProcessedAt: LAST_MOVEMENT,
      lastRouteProcessedAt: LAST_MOVEMENT,
      lastDrivingProcessedAt: LAST_MOVEMENT,
      lastEvidenceSummary: {
        lastProviderActivityAt: LAST_MOVEMENT.toISOString(),
      },
    },
  });
  await prisma.vehicleLatestState.create({
    data: {
      vehicleId: vehicle.id,
      dimoTokenId,
      isIgnitionOn: false,
      speedKmh: 0,
      engineLoad: 39.6078431372549,
      sourceTimestamp: FINAL_STOP_VLS,
      updatedAt: FINAL_STOP_VLS,
    },
  });
  return {
    suffix,
    org,
    vehicle: { id: vehicle.id, organizationId: vehicle.organizationId, dimoTokenId },
    trip,
    lastMovementAt: LAST_MOVEMENT,
    stopBoundaryAt: FINAL_STOP_BOUNDARY,
    expectedEndTime: FINAL_STOP_BOUNDARY,
    stopBoundaryPreseeded: false,
  };
}

function buildKs661R12FinalStopCoreMock(): TripR11SegmentsMock {
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([
      {
        timestamp: FINAL_STOP_BOUNDARY.toISOString(),
        speed: 3.33,
        travelledDistance: 191075,
        isIgnitionOn: false,
      },
      {
        timestamp: FINAL_STOP_BOUNDARY.toISOString(),
        speed: 0,
        travelledDistance: 191075,
        isIgnitionOn: false,
      },
    ]),
    fetchRouteEnrichment: jest.fn().mockResolvedValue([
      {
        latitude: 51.33535,
        longitude: 9.5059516,
        speedKmh: 0,
        timestamp: FINAL_STOP_BOUNDARY.toISOString(),
      },
    ]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: FINAL_STOP_BOUNDARY.toISOString(),
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 191075,
      },
    ]),
  };
}

function buildKs661R12EmptyStaleMock(): TripR11SegmentsMock {
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
    fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: FINAL_STOP_BOUNDARY.toISOString(),
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 191075,
      },
    ]),
  };
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R12 K1/K11 — KS661 Production ordering + normal finalize chain',
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
      fixture = await createKs661R12ActiveFixture(prisma);
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

    it('K1 — Production ordering reaches POSSIBLE_END without pre-seeded boundary', async () => {
      const stopTickAt = new Date('2026-09-09T05:07:30.000Z');
      const staleObsAt = new Date('2026-09-09T05:08:00.000Z');
      const emptyTickAt = new Date('2026-09-09T05:10:30.000Z');

      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        buildKs661R12FinalStopCoreMock(),
        buildTripR11DetectorMock(fixture.expectedEndTime),
      );

      useTripR11FrozenClock(stopTickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, stopTickAt));
      } finally {
        restoreTripR11Clock();
      }

      const afterStop = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterStop?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      const stopSummary = afterStop?.lastEvidenceSummary as Record<string, unknown>;
      expect(readStopBoundaryAt(stopSummary)?.toISOString()).toBe(
        FINAL_STOP_VLS.toISOString(),
      );

      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 39.6078431372549,
          sourceTimestamp: staleObsAt,
          updatedAt: staleObsAt,
        },
      });

      harness.segments.fetchRawTripCoreData =
        buildKs661R12EmptyStaleMock().fetchRawTripCoreData;
      harness.segments.fetchRouteEnrichment =
        buildKs661R12EmptyStaleMock().fetchRouteEnrichment;
      harness.segments.fetchPerformance =
        buildKs661R12EmptyStaleMock().fetchPerformance;

      useTripR11FrozenClock(emptyTickAt);
      try {
        await harness.runJob(buildActiveTickJob(fixture, emptyTickAt));
      } finally {
        restoreTripR11Clock();
      }

      const afterEmpty = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterEmpty?.state).toBe(TripDetectionState.POSSIBLE_END);
      const emptySummary = afterEmpty?.lastEvidenceSummary as Record<string, unknown>;
      expect(emptySummary.boundaryBackedSilenceEligible).toBe(true);
      expect(emptySummary.innerGateReason).toBe('boundary_backed_provider_silence');
      expect(emptySummary.vlsEvidenceState).toBe('UNKNOWN');
      expect(emptySummary.vlsProviderObservedAt).toBe(staleObsAt.toISOString());
    }, 120_000);

    it('K1-same-tick — stop observation tick stays ACTIVE_TRIP (no immediate end)', async () => {
      const stopTickAt = new Date('2026-09-09T05:07:30.000Z');
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        buildKs661R12FinalStopCoreMock(),
        buildTripR11DetectorMock(fixture.expectedEndTime),
      );
      useTripR11FrozenClock(stopTickAt);
      await harness.runJob(buildActiveTickJob(fixture, stopTickAt));
      restoreTripR11Clock();
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(det?.possibleEndAt).toBeNull();
    }, 120_000);

    it('K11 — normal R10 finalize chain to COMPLETED + RESTING', async () => {
      const stopTickAt = new Date('2026-09-09T05:07:30.000Z');
      const staleObsAt = new Date('2026-09-09T05:08:00.000Z');
      const emptyTickAt = new Date('2026-09-09T05:10:30.000Z');
      const endCycleAt = new Date('2026-09-09T05:12:00.000Z');

      const finalStopMock = buildKs661R12FinalStopCoreMock();
      const emptyMock = buildKs661R12EmptyStaleMock();
      finalStopMock.fetchEndValidationWindow = emptyMock.fetchEndValidationWindow;

      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        finalStopMock,
        buildTripR11DetectorMock(fixture.expectedEndTime),
      );

      useTripR11FrozenClock(stopTickAt);
      await harness.runJob(buildActiveTickJob(fixture, stopTickAt));
      restoreTripR11Clock();

      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 39.6078431372549,
          sourceTimestamp: staleObsAt,
          updatedAt: staleObsAt,
        },
      });

      harness.segments.fetchRawTripCoreData = emptyMock.fetchRawTripCoreData;
      harness.segments.fetchRouteEnrichment = emptyMock.fetchRouteEnrichment;
      harness.segments.fetchPerformance = emptyMock.fetchPerformance;

      useTripR11FrozenClock(emptyTickAt);
      await harness.runJob(buildActiveTickJob(fixture, emptyTickAt));
      restoreTripR11Clock();

      useTripR11FrozenClock(endCycleAt);
      const steps = await drainTripTrackingQueue({
        queue: trackingQueue,
        runJob: harness.runJob,
      });
      restoreTripR11Clock();
      expect(steps).toBeGreaterThanOrEqual(3);

      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(det?.activeTripId).toBeNull();
      expect(resolveEndCycleToken(det!)).toBeNull();
      expect(await countTripTrackingJobs(trackingQueue)).toBe(0);
    }, 120_000);

    it('K2 — 92s pause keeps same trip with pause/boundary evidence', async () => {
      const pauseAt = new Date('2026-09-09T04:59:57.000Z');
      const pauseTick = new Date('2026-09-09T05:01:21.000Z');
      await prisma.vehicleTripDetectionState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          lastMeaningfulMovementAt: new Date('2026-09-09T04:59:50.000Z'),
          lastActivityAt: new Date('2026-09-09T04:59:50.000Z'),
        },
      });
      await prisma.vehicleLatestState.update({
        where: { vehicleId: fixture.vehicle.id },
        data: {
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 42,
          sourceTimestamp: pauseAt,
          updatedAt: pauseAt,
        },
      });

      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        {
          fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
          fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
          fetchPerformance: jest.fn().mockResolvedValue([]),
          fetchEndValidationWindow: jest.fn().mockResolvedValue([]),
        },
        buildTripR11DetectorMock(fixture.expectedEndTime),
      );

      useTripR11FrozenClock(pauseTick);
      await harness.runJob(buildActiveTickJob(fixture, pauseTick));
      restoreTripR11Clock();

      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(det?.activeTripId).toBe(fixture.trip.id);
      const summary = det?.lastEvidenceSummary as Record<string, unknown>;
      expect(readStopBoundaryAt(summary)?.toISOString()).toBe(pauseAt.toISOString());
      expect(readPauseDetectedAt(summary)?.toISOString()).toBe(pauseAt.toISOString());
    }, 120_000);
  },
);

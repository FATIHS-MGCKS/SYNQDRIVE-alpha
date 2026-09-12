import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import type { TripTrackingJobData } from './trip-detection.types';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { END_DETECTION_MODES, TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import {
  buildActiveTickJob,
  buildTripR11OrchestrationHarness,
  buildTripTrackingJobId,
  cleanupTripR11Fixture,
  countTripTrackingJobs,
  drainTripTrackingQueue,
  probeTripR11Postgres,
  purgeTripTrackingQueueJobs,
  restoreTripR11Clock,
  startTripR11RedisStack,
  stopTripR11RedisStack,
  useTripR11FrozenClock,
  type TripR11OrchestrationHarness,
  type TripR11PostgresFixture,
  type TripR11SegmentsMock,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { readStopBoundaryAt } from './trip-fsm-evidence-state';
import { resolveEndCycleToken } from './trip-end-cycle-reset';
import { buildTripTrackingJobOptions } from './trip-tracking-queue.util';

const LIVE = process.env.TRIP_R12_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_R12_POSTGRES_REDIS_REQUIRED === '1';

/** KS MS 661 POST-#1603 physical drive anchors (UTC). */
const TRIP_START = new Date('2026-09-12T04:31:00.000Z');
const LAST_MOVEMENT = new Date('2026-09-12T05:06:52.636Z');
const STOP_BOUNDARY = new Date('2026-09-12T05:06:59.000Z');
const STALE_VLS = new Date('2026-09-12T05:06:59.000Z');
const POSSIBLE_END_AT = new Date('2026-09-12T05:09:02.763Z');
const EV_ATTEMPT_1_AT = new Date('2026-09-12T05:11:03.781Z');
const POST_REOPEN_ACTIVE_AT = new Date('2026-09-12T05:11:33.000Z');
const END_CYCLE_2_AT = new Date('2026-09-12T05:13:00.000Z');

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

async function createPost1603Ks661Fixture(
  prisma: PrismaClient,
): Promise<TripR11PostgresFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dimoTokenId = 930000 + Math.floor(Math.random() * 1000);
  const org = await prisma.organization.create({
    data: {
      companyName: `Trip R12 POST1603 ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `P1603-${suffix}`.slice(0, 12),
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
      engineLoad: 39.6,
      sourceTimestamp: STOP_BOUNDARY,
      updatedAt: STOP_BOUNDARY,
    },
  });
  return {
    suffix,
    org,
    vehicle: { id: vehicle.id, organizationId: vehicle.organizationId, dimoTokenId },
    trip,
    lastMovementAt: LAST_MOVEMENT,
    stopBoundaryAt: STOP_BOUNDARY,
    expectedEndTime: STOP_BOUNDARY,
    stopBoundaryPreseeded: false,
  };
}

function buildStopCoreMock(): TripR11SegmentsMock {
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([
      {
        timestamp: STOP_BOUNDARY.toISOString(),
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
        timestamp: STOP_BOUNDARY.toISOString(),
      },
    ]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: STOP_BOUNDARY.toISOString(),
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 191075,
      },
    ]),
  };
}

function buildEmptyStaleMock(): TripR11SegmentsMock {
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
    fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: STOP_BOUNDARY.toISOString(),
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 191075,
      },
    ]),
  };
}

function buildCusumOngoingDetectorMock() {
  let evDetectorCalls = 0;
  return {
    runAll: jest.fn().mockImplementation(async (names: string[]) => {
      if (names.includes('ChangePointEndDetector')) {
        evDetectorCalls += 1;
        if (evDetectorCalls === 1) {
          return [
            {
              detectorName: 'ChangePointEndDetector',
              verdict: 'NOT_TRIGGERED',
              evidence: {
                cusumLastMovementAt: LAST_MOVEMENT.toISOString(),
                appearsOngoing: true,
              },
            },
          ];
        }
        return [
          {
            detectorName: 'ChangePointEndDetector',
            verdict: 'TRIGGERED',
            evidence: {
              cusumLastMovementAt: STOP_BOUNDARY.toISOString(),
              segmentEnd: STOP_BOUNDARY.toISOString(),
            },
          },
        ];
      }
      if (names.includes('EndContinuityDetector')) {
        return [
          {
            detectorName: 'EndContinuityDetector',
            verdict: 'NOT_TRIGGERED',
            evidence: {},
          },
        ];
      }
      return [];
    }),
  };
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

async function seedPossibleEndFromEmptyCore(params: {
  prisma: PrismaClient;
  harness: TripR11OrchestrationHarness;
  fixture: TripR11PostgresFixture;
}): Promise<void> {
  const stopTickAt = new Date('2026-09-12T05:07:30.000Z');
  useTripR11FrozenClock(stopTickAt);
  try {
    await params.harness.runJob(buildActiveTickJob(params.fixture, stopTickAt));
  } finally {
    restoreTripR11Clock();
  }

  await params.prisma.vehicleLatestState.update({
    where: { vehicleId: params.fixture.vehicle.id },
    data: {
      isIgnitionOn: false,
      speedKmh: 0,
      engineLoad: 39.6,
      sourceTimestamp: STALE_VLS,
      updatedAt: STALE_VLS,
    },
  });

  params.harness.segments.fetchRawTripCoreData =
    buildEmptyStaleMock().fetchRawTripCoreData;
  params.harness.segments.fetchRouteEnrichment =
    buildEmptyStaleMock().fetchRouteEnrichment;
  params.harness.segments.fetchPerformance = buildEmptyStaleMock().fetchPerformance;

  useTripR11FrozenClock(POSSIBLE_END_AT);
  try {
    await params.harness.runJob(buildActiveTickJob(params.fixture, POSSIBLE_END_AT));
  } finally {
    restoreTripR11Clock();
  }

  const det = await params.prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: params.fixture.vehicle.id },
  });
  expect(det?.state).toBe(TripDetectionState.POSSIBLE_END);
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R12 — CUSUM still-ongoing boundary retry (Postgres + BullMQ)',
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
      fixture = await createPost1603Ks661Fixture(prisma);
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

    it('GREEN — CUSUM still-ongoing preserves boundary and completes terminal chain', async () => {
      const stopMock = buildStopCoreMock();
      const emptyMock = buildEmptyStaleMock();
      stopMock.fetchEndValidationWindow = emptyMock.fetchEndValidationWindow;

      const detectorRegistry = buildCusumOngoingDetectorMock();
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        stopMock,
        detectorRegistry,
      );

      let evDecisionCalls = 0;
      harness.evaluateEndCandidate.mockImplementation(() => {
        evDecisionCalls += 1;
        if (evDecisionCalls === 1) {
          return {
            shouldReopen: true,
            shouldEnd: false,
            endMode: 'CUSUM_ONGOING',
            reason: 'CUSUM indicates trip is still active',
          };
        }
        return {
          shouldEnd: true,
          shouldReopen: false,
          detectedEndAt: STOP_BOUNDARY,
          confidence: 'MEDIUM',
          endMode: END_DETECTION_MODES.CUSUM_VALIDATED,
          reason: 'integration_cusum_end',
        };
      });

      await seedPossibleEndFromEmptyCore({ prisma, harness, fixture });
      await purgeTripTrackingQueueJobs(trackingQueue);

      useTripR11FrozenClock(EV_ATTEMPT_1_AT);
      await trackingQueue.add(
        'trip-tracking',
        buildPossibleEndCheckJob(fixture, EV_ATTEMPT_1_AT),
        {
          jobId: buildTripTrackingJobId('pec', fixture.vehicle.id, fixture.trip.id),
          ...buildTripTrackingJobOptions(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
        },
      );
      const { steps: pecEvSteps } = await drainTripTrackingQueue({
        queue: trackingQueue,
        runJob: harness.runJob,
        maxSteps: 4,
      });
      restoreTripR11Clock();
      expect(pecEvSteps).toBeGreaterThanOrEqual(2);

      const afterEv1 = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterEv1?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      const afterEv1Summary = afterEv1?.lastEvidenceSummary as Record<string, unknown>;
      expect(readStopBoundaryAt(afterEv1Summary)?.toISOString()).toBe(
        STOP_BOUNDARY.toISOString(),
      );

      const evRunsAfter1 = await prisma.vehicleTripTrackingRun.count({
        where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
      });
      expect(evRunsAfter1).toBe(1);

      harness.segments.fetchRawTripCoreData = emptyMock.fetchRawTripCoreData;
      harness.segments.fetchRouteEnrichment = emptyMock.fetchRouteEnrichment;
      harness.segments.fetchPerformance = emptyMock.fetchPerformance;

      useTripR11FrozenClock(POST_REOPEN_ACTIVE_AT);
      await harness.runJob(buildActiveTickJob(fixture, POST_REOPEN_ACTIVE_AT));
      restoreTripR11Clock();

      const afterReentry = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterReentry?.state).toBe(TripDetectionState.POSSIBLE_END);

      useTripR11FrozenClock(END_CYCLE_2_AT);
      const { steps: terminalSteps } = await drainTripTrackingQueue({
        queue: trackingQueue,
        runJob: harness.runJob,
        maxSteps: 6,
      });
      restoreTripR11Clock();
      expect(terminalSteps).toBeGreaterThanOrEqual(2);

      const evRunsTotal = await prisma.vehicleTripTrackingRun.count({
        where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
      });
      expect(evRunsTotal).toBeGreaterThanOrEqual(2);

      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(det?.activeTripId).toBeNull();
      expect(resolveEndCycleToken(det!)).toBeNull();
      expect(await countTripTrackingJobs(trackingQueue)).toBe(0);

      const metrics = {
        POST_FIX_BOUNDARY_DURABLE: readStopBoundaryAt(afterEv1Summary) != null,
        POST_FIX_POSSIBLE_END_REENTRY: afterReentry?.state === TripDetectionState.POSSIBLE_END,
        POST_FIX_LATER_END_VALIDATION_REACHED: evRunsTotal >= 2,
        POST_FIX_END_VALIDATION_COMPLETED: evRunsTotal >= 2,
        POST_FIX_FINALIZE_COMPLETED: trip?.tripStatus === TripStatus.COMPLETED,
        POST_FIX_TRIP_COMPLETED: trip?.tripStatus === TripStatus.COMPLETED,
        POST_FIX_RESTING_REACHED: det?.state === TripDetectionState.RESTING,
        POST_FIX_ACTIVE_TRIP_ID_CLEARED: det?.activeTripId == null,
        POST_FIX_MANUAL_REPAIR_USED: false,
        POST_FIX_RECONCILIATION_REPAIR_USED: false,
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(metrics));
    }, 180_000);
  },
);

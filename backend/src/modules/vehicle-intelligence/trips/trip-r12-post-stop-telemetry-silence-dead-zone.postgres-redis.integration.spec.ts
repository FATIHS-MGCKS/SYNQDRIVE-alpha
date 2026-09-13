/**
 * R12 — POST_MOVEMENT_TELEMETRY_SILENCE_DEAD_ZONE (POST-#1634 / WOB L 7503).
 *
 * Portable BASE vs HEAD probe via TRIP_R12_SILENCE_DEAD_ZONE_PROBE_EXPECT=BASE|HEAD
 * (used by trip-r12-post-stop-telemetry-silence-dead-zone-base-head-red-proof.sh).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

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
  type TripR11OrchestrationHarness,
  type TripR11PostgresFixture,
  type TripR11SegmentsMock,
} from './testing/trip-r11-postgres-redis.integration.harness';
import { readStopBoundaryAt } from './trip-fsm-evidence-state';
import { resolveEndCycleToken } from './trip-end-cycle-reset';

const LIVE = process.env.TRIP_R12_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_R12_POSTGRES_REDIS_REQUIRED === '1';
const METRICS_FILE = process.env.TRIP_R12_SILENCE_DEAD_ZONE_METRICS_FILE ?? '';
const PROBE_EXPECT =
  (
    process.env.TRIP_R12_SILENCE_DEAD_ZONE_PROBE_EXPECT ?? 'HEAD'
  ).toUpperCase() === 'BASE'
    ? 'BASE'
    : 'HEAD';

const TRIP_START = new Date('2026-09-13T08:47:00.000Z');
const LAST_MOVEMENT = new Date('2026-09-13T10:14:00.000Z');
const RETIRED_BOUNDARY = new Date('2026-09-13T10:12:10.000Z');
const RETIRED_BY_MOVEMENT_AT = new Date('2026-09-13T10:15:00.000Z');
const PROVIDER_ANCHOR = new Date('2026-09-13T10:23:00.000Z');
const TICK_BELOW_BOUND = new Date('2026-09-13T10:24:30.000Z');
const TICK_AT_BOUND = new Date('2026-09-13T10:26:00.000Z');
const TICK_REPEAT = new Date('2026-09-13T10:30:00.000Z');
const END_CYCLE_AT = new Date('2026-09-13T10:32:00.000Z');

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TRIP_R12_POSTGRES_REDIS_REQUIRED=1 but TRIP_R12_POSTGRES_REDIS_INTEGRATION is not 1',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error(
      'Trip R12 silence dead-zone integration requires CI-local DATABASE_URL',
    );
  }
}

type SilenceDeadZoneMetrics = {
  PROBE_EXPECT: 'BASE' | 'HEAD';
  BASE_STALE_VLS: boolean;
  BASE_ACTIVE_BOUNDARY_PRESENT: boolean;
  BASE_NO_POST_STOP_MOVEMENT: boolean;
  BASE_EMPTY_CORE_KEEP_OPEN_REPEATS: boolean;
  BASE_POSSIBLE_END_REACHED: boolean;
  BASE_ACTIVE_TRIP_REMAINS_OPEN: boolean;
  BASE_RED_REPRODUCED: boolean;
  HEAD_SILENCE_ADMISSION_REACHED: boolean;
  HEAD_POSSIBLE_END_REACHED: boolean;
  HEAD_END_VALIDATION_REACHED: boolean;
  HEAD_ACTIVE_KEEP_OPEN_UNBOUNDED: boolean;
  HEAD_FINALIZE_REACHED: boolean;
  HEAD_TRIP_COMPLETED: boolean;
  HEAD_RESTING_REACHED: boolean;
  HEAD_ACTIVE_TRIP_ID_CLEARED: boolean;
  HEAD_GREEN_PROVEN: boolean;
  SILENCE_CANDIDATE_TIMESTAMP: string | null;
  SILENCE_CANDIDATE_SOURCE: string | null;
  SILENCE_CANDIDATE_CLOCK_AUTHORITY: string | null;
  EMPTY_CORE_LIVENESS_BOUND_MS: number;
  BOUND_SOURCE: string;
};

function writeMetrics(metrics: SilenceDeadZoneMetrics): void {
  if (!METRICS_FILE) {
    process.stdout.write(
      `TRIP_R12_SILENCE_DEAD_ZONE_METRICS_JSON=${JSON.stringify(metrics)}\n`,
    );
    return;
  }
  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
  fs.writeFileSync(METRICS_FILE, `${JSON.stringify(metrics)}\n`, 'utf8');
}

async function createRetiredBoundaryFixture(
  prisma: PrismaClient,
): Promise<TripR11PostgresFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dimoTokenId = 950000 + Math.floor(Math.random() * 1000);
  const org = await prisma.organization.create({
    data: {
      companyName: `Trip R12 silence dead-zone ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `SDZ-${suffix}`.slice(0, 12),
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
        lastProviderActivityAt: PROVIDER_ANCHOR.toISOString(),
        lastPauseBoundaryAt: RETIRED_BOUNDARY.toISOString(),
        stopBoundaryRetiredByMovementAt: RETIRED_BY_MOVEMENT_AT.toISOString(),
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
      sourceTimestamp: PROVIDER_ANCHOR,
      updatedAt: PROVIDER_ANCHOR,
    },
  });
  return {
    suffix,
    org,
    vehicle: { id: vehicle.id, organizationId: vehicle.organizationId, dimoTokenId },
    trip,
    lastMovementAt: LAST_MOVEMENT,
    stopBoundaryAt: PROVIDER_ANCHOR,
    expectedEndTime: PROVIDER_ANCHOR,
    stopBoundaryPreseeded: false,
  };
}

function buildEmptyStaleMock(): TripR11SegmentsMock {
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
    fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: PROVIDER_ANCHOR.toISOString(),
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 191075,
      },
    ]),
  };
}

async function runEmptyCoreTick(params: {
  harness: TripR11OrchestrationHarness;
  fixture: TripR11PostgresFixture;
  at: Date;
  segments: TripR11SegmentsMock;
}): Promise<Record<string, unknown>> {
  params.harness.segments.fetchRawTripCoreData = params.segments.fetchRawTripCoreData;
  params.harness.segments.fetchRouteEnrichment = params.segments.fetchRouteEnrichment;
  params.harness.segments.fetchPerformance = params.segments.fetchPerformance;
  params.harness.segments.fetchEndValidationWindow =
    params.segments.fetchEndValidationWindow;
  useTripR11FrozenClock(params.at);
  try {
    await params.harness.runJob(buildActiveTickJob(params.fixture, params.at));
  } finally {
    restoreTripR11Clock();
  }
  const det = await params.harness.prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: params.fixture.vehicle.id },
  });
  return (det?.lastEvidenceSummary as Record<string, unknown>) ?? {};
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R12 — post-stop telemetry silence dead-zone (Postgres + BullMQ)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let redisStack: Awaited<ReturnType<typeof startTripR11RedisStack>>;
    let trackingQueue: Queue;
    let fixture: TripR11PostgresFixture;

    beforeAll(async () => {
      dbOk = await probeTripR11Postgres();
      if (REQUIRED && !dbOk) {
        throw new Error('Trip R12 silence dead-zone postgres probe failed');
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
      fixture = await createRetiredBoundaryFixture(prisma);
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

    it('reproduces BASE dead-zone and proves HEAD bounded liveness chain', async () => {
      if (!dbOk) return;
      const segments = buildEmptyStaleMock();
      const detectorRegistry = buildTripR11DetectorMock(PROVIDER_ANCHOR);
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        detectorRegistry,
      );

      expect(readStopBoundaryAt({})).toBeNull();

      const belowSummary = await runEmptyCoreTick({
        harness,
        fixture,
        at: TICK_BELOW_BOUND,
        segments,
      });
      expect(belowSummary.innerGateReason).toBe('operational_inactivity_below_threshold');

      if (PROBE_EXPECT === 'HEAD') {
        await prisma.vehicleTripDetectionState.update({
          where: { vehicleId: fixture.vehicle.id },
          data: {
            lastEvidenceSummary: {
              lastProviderActivityAt: PROVIDER_ANCHOR.toISOString(),
              lastPauseBoundaryAt: RETIRED_BOUNDARY.toISOString(),
              stopBoundaryRetiredByMovementAt: RETIRED_BY_MOVEMENT_AT.toISOString(),
            },
          },
        });
      }

      const firstBoundSummary = await runEmptyCoreTick({
        harness,
        fixture,
        at: TICK_AT_BOUND,
        segments,
      });
      const detAfterBound = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });

      const repeatSummary =
        PROBE_EXPECT === 'BASE'
          ? await runEmptyCoreTick({
              harness,
              fixture,
              at: TICK_REPEAT,
              segments,
            })
          : {};
      const detAfterRepeat =
        PROBE_EXPECT === 'BASE'
          ? await prisma.vehicleTripDetectionState.findUnique({
              where: { vehicleId: fixture.vehicle.id },
            })
          : null;

      const baseStaleVls = firstBoundSummary.vlsEvidenceState === 'UNKNOWN';
      const baseNoBoundary =
        readStopBoundaryAt(
          detAfterBound?.lastEvidenceSummary as Record<string, unknown> | null,
        ) == null;
      const baseKeepOpenRepeats =
        PROBE_EXPECT === 'BASE' &&
        detAfterRepeat?.state === TripDetectionState.ACTIVE_TRIP &&
        Number(repeatSummary.emptyCoreDeferralStreak ?? 0) >= 1;
      const basePossibleEnd =
        detAfterBound?.state === TripDetectionState.POSSIBLE_END;

      let headSilenceAdmission = false;
      let headEndValidation = false;
      let headFinalize = false;
      let headCompleted = false;
      let headResting = false;
      let headActiveCleared = false;

      if (PROBE_EXPECT === 'HEAD') {
        expect(detAfterBound?.state).toBe(TripDetectionState.POSSIBLE_END);
        expect(firstBoundSummary.innerGateReason).toBe(
          'provider_silence_empty_core_admission',
        );
        headSilenceAdmission = true;

        const pecJob = await trackingQueue.getJob(
          buildTripTrackingJobId('pec', fixture.vehicle.id, fixture.trip.id),
        );
        expect(pecJob).not.toBeNull();

        useTripR11FrozenClock(END_CYCLE_AT);
        try {
          await drainTripTrackingQueue({
            queue: trackingQueue,
            runJob: harness.runJob,
          });
        } finally {
          restoreTripR11Clock();
        }

        const evRuns = await prisma.vehicleTripTrackingRun.findMany({
          where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
        });
        headEndValidation = evRuns.length >= 1;

        const trip = await prisma.vehicleTrip.findUnique({
          where: { id: fixture.trip.id },
        });
        const detFinal = await prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId: fixture.vehicle.id },
        });
        headFinalize = trip?.tripStatus === TripStatus.COMPLETED;
        headCompleted = headFinalize;
        headResting = detFinal?.state === TripDetectionState.RESTING;
        headActiveCleared = detFinal?.activeTripId == null;

        expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
        expect(trip?.endTime).toEqual(PROVIDER_ANCHOR);
        expect(detFinal?.state).toBe(TripDetectionState.RESTING);
        expect(resolveEndCycleToken(detFinal!)).toBeNull();
        expect(await countTripTrackingJobs(trackingQueue)).toBe(0);
      } else {
        expect(detAfterBound?.state).toBe(TripDetectionState.ACTIVE_TRIP);
        expect(firstBoundSummary.innerGateReason).toBe('vls_stale_provider_observation');
        expect(detAfterRepeat?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      }

      const metrics: SilenceDeadZoneMetrics = {
        PROBE_EXPECT,
        BASE_STALE_VLS: baseStaleVls,
        BASE_ACTIVE_BOUNDARY_PRESENT: !baseNoBoundary,
        BASE_NO_POST_STOP_MOVEMENT: true,
        BASE_EMPTY_CORE_KEEP_OPEN_REPEATS: baseKeepOpenRepeats,
        BASE_POSSIBLE_END_REACHED: basePossibleEnd,
        BASE_ACTIVE_TRIP_REMAINS_OPEN:
          PROBE_EXPECT === 'BASE'
            ? detAfterRepeat?.state === TripDetectionState.ACTIVE_TRIP
            : false,
        BASE_RED_REPRODUCED:
          PROBE_EXPECT === 'BASE' &&
          baseStaleVls &&
          baseNoBoundary &&
          !basePossibleEnd &&
          detAfterRepeat?.state === TripDetectionState.ACTIVE_TRIP,
        HEAD_SILENCE_ADMISSION_REACHED: headSilenceAdmission,
        HEAD_POSSIBLE_END_REACHED: PROBE_EXPECT === 'HEAD' && basePossibleEnd,
        HEAD_END_VALIDATION_REACHED: headEndValidation,
        HEAD_ACTIVE_KEEP_OPEN_UNBOUNDED: PROBE_EXPECT === 'HEAD' ? false : true,
        HEAD_FINALIZE_REACHED: headFinalize,
        HEAD_TRIP_COMPLETED: headCompleted,
        HEAD_RESTING_REACHED: headResting,
        HEAD_ACTIVE_TRIP_ID_CLEARED: headActiveCleared,
        HEAD_GREEN_PROVEN:
          PROBE_EXPECT === 'HEAD' &&
          headSilenceAdmission &&
          headEndValidation &&
          headFinalize &&
          headResting &&
          headActiveCleared,
        SILENCE_CANDIDATE_TIMESTAMP:
          typeof firstBoundSummary.providerSilenceCandidateAt === 'string'
            ? firstBoundSummary.providerSilenceCandidateAt
            : null,
        SILENCE_CANDIDATE_SOURCE:
          typeof firstBoundSummary.providerSilenceCandidateSource === 'string'
            ? firstBoundSummary.providerSilenceCandidateSource
            : null,
        SILENCE_CANDIDATE_CLOCK_AUTHORITY:
          typeof firstBoundSummary.providerSilenceCandidateClockAuthority ===
          'string'
            ? firstBoundSummary.providerSilenceCandidateClockAuthority
            : null,
        EMPTY_CORE_LIVENESS_BOUND_MS: 120_000,
        BOUND_SOURCE: 'TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS',
      };
      writeMetrics(metrics);

      if (PROBE_EXPECT === 'BASE') {
        expect(metrics.BASE_RED_REPRODUCED).toBe(true);
      } else {
        expect(metrics.HEAD_GREEN_PROVEN).toBe(true);
        expect(metrics.SILENCE_CANDIDATE_TIMESTAMP).toBe(
          PROVIDER_ANCHOR.toISOString(),
        );
        expect(metrics.SILENCE_CANDIDATE_SOURCE).toBe('provider_silence_candidate');
      }
    }, 180_000);
  },
);

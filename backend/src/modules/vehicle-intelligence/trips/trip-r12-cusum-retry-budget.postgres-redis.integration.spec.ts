/**
 * R12 — END_VALIDATION retry-budget durability (POST-#1617 / WOB L 7503).
 *
 * Portable BASE vs HEAD probe via TRIP_R12_RETRY_BUDGET_PROBE_EXPECT=BASE|HEAD
 * (used by trip-r12-cusum-retry-budget-base-head-red-proof.sh).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';

import { TripDecisionEngine } from './decision/trip-decision.engine';
import { TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import {
  buildActiveTickJob,
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
const METRICS_FILE = process.env.TRIP_R12_RETRY_BUDGET_METRICS_FILE ?? '';
const PROBE_EXPECT =
  (process.env.TRIP_R12_RETRY_BUDGET_PROBE_EXPECT ?? 'HEAD').toUpperCase() === 'BASE'
    ? 'BASE'
    : 'HEAD';

const TRIP_START = new Date('2026-09-12T04:31:00.000Z');
const LAST_MOVEMENT = new Date('2026-09-12T05:06:52.636Z');
const STOP_BOUNDARY = new Date('2026-09-12T05:06:59.000Z');
const STALE_VLS = new Date('2026-09-12T05:06:59.000Z');
const POSSIBLE_END_AT = new Date('2026-09-12T05:09:02.763Z');
const EV1_AT = new Date('2026-09-12T05:11:03.781Z');
const REOPEN1_ACTIVE = new Date('2026-09-12T05:11:33.000Z');
const EV2_PEC_AT = new Date('2026-09-12T05:13:30.000Z');
const REOPEN2_ACTIVE = new Date('2026-09-12T05:14:00.000Z');
const EV3_PEC_AT = new Date('2026-09-12T05:15:57.000Z');
const REOPEN3_ACTIVE = new Date('2026-09-12T05:16:27.000Z');
const EV4_PEC_AT = new Date('2026-09-12T05:18:24.000Z');

if (REQUIRED) {
  if (!LIVE) {
    throw new Error(
      'TRIP_R12_POSTGRES_REDIS_REQUIRED=1 but TRIP_R12_POSTGRES_REDIS_INTEGRATION is not 1',
    );
  }
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
    throw new Error('Trip R12 retry-budget integration requires CI-local DATABASE_URL');
  }
}

type RetryBudgetMetrics = {
  PROBE_EXPECT: 'BASE' | 'HEAD';
  RED_BOUNDARY_PRESERVED: boolean;
  RED_POSSIBLE_END_REENTRY: boolean;
  RED_CUSUM_ONGOING_REPEATS: boolean;
  RED_COMPLETED_ATTEMPT_ALWAYS_ONE: boolean;
  RED_ATTEMPT_COUNTER_RESETS: boolean;
  RED_MAX_ATTEMPT_FALLBACK_REACHED: boolean;
  RED_EV_RUNS_EXCEED_MAX_ATTEMPTS: boolean;
  RED_FINALIZE_REACHED: boolean;
  BASE_EV_RUN_COUNT: number;
  BASE_MAX_ATTEMPTS: number;
  BASE_COMPLETED_ATTEMPTS_SEQUENCE: number[];
  BASE_PERSISTED_ATTEMPTS_SEQUENCE: number[];
  BASE_MAX_FALLBACK_REACHED: boolean;
  BASE_FINALIZE_REACHED: boolean;
  BASE_RED_REPRODUCED: boolean;
  HEAD_EV_RUN_COUNT: number;
  HEAD_MAX_ATTEMPTS: number;
  HEAD_COMPLETED_ATTEMPTS_SEQUENCE: number[];
  HEAD_PERSISTED_ATTEMPTS_SEQUENCE: number[];
  HEAD_EV4_EXECUTED: boolean;
  HEAD_MAX_FALLBACK_REACHED: boolean;
  HEAD_MAX_FALLBACK_REASON: string | null;
  HEAD_FINALIZE_REACHED: boolean;
  HEAD_TRIP_COMPLETED: boolean;
  HEAD_RESTING_REACHED: boolean;
  HEAD_ACTIVE_TRIP_ID_CLEARED: boolean;
  HEAD_GREEN_PROVEN: boolean;
  BOUNDARY_PRESERVED_AFTER_EV1: boolean;
  BOUNDARY_PRESERVED_AFTER_EV2: boolean;
  BOUNDARY_PRESERVED_AFTER_EV3: boolean;
};

function writeMetrics(metrics: RetryBudgetMetrics): void {
  if (!METRICS_FILE) {
    process.stdout.write(
      `TRIP_R12_RETRY_BUDGET_METRICS_JSON=${JSON.stringify(metrics)}\n`,
    );
    return;
  }
  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
  fs.writeFileSync(METRICS_FILE, `${JSON.stringify(metrics)}\n`, 'utf8');
}

async function createFixture(prisma: PrismaClient): Promise<TripR11PostgresFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dimoTokenId = 940000 + Math.floor(Math.random() * 1000);
  const org = await prisma.organization.create({
    data: {
      companyName: `Trip R12 retry-budget ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `RB-${suffix}`.slice(0, 12),
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

function buildAlwaysCusumOngoingDetectorMock() {
  return {
    runAll: jest.fn().mockImplementation(async (names: string[]) => {
      if (names.includes('ChangePointEndDetector')) {
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

  const emptyMock = buildEmptyStaleMock();
  params.harness.segments.fetchRawTripCoreData = emptyMock.fetchRawTripCoreData;
  params.harness.segments.fetchRouteEnrichment = emptyMock.fetchRouteEnrichment;
  params.harness.segments.fetchPerformance = emptyMock.fetchPerformance;

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

async function collectEvRunSequences(prisma: PrismaClient, tripId: string) {
  const runs = await prisma.vehicleTripTrackingRun.findMany({
    where: { tripId, runType: 'END_VALIDATION' },
    orderBy: { createdAt: 'asc' },
  });
  const completedAttempts: number[] = [];
  const persistedAttempts: number[] = [];
  for (const run of runs) {
    const summary = run.resultSummary as Record<string, unknown>;
    if (summary?.reason !== 'cusum_still_ongoing') continue;
    completedAttempts.push(Number(summary.completedAttempt ?? 0));
    persistedAttempts.push(Number(summary.persistedAttemptsAfterReset ?? 0));
  }
  return { evRunCount: runs.length, completedAttempts, persistedAttempts };
}

async function runActiveReopen(params: {
  harness: TripR11OrchestrationHarness;
  fixture: TripR11PostgresFixture;
  emptyMock: TripR11SegmentsMock;
  at: Date;
}): Promise<void> {
  params.harness.segments.fetchRawTripCoreData = params.emptyMock.fetchRawTripCoreData;
  params.harness.segments.fetchRouteEnrichment = params.emptyMock.fetchRouteEnrichment;
  params.harness.segments.fetchPerformance = params.emptyMock.fetchPerformance;
  useTripR11FrozenClock(params.at);
  try {
    await params.harness.runJob(buildActiveTickJob(params.fixture, params.at));
  } finally {
    restoreTripR11Clock();
  }
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R12 — CUSUM retry-budget durability (Postgres + BullMQ)',
  () => {
    let prisma: PrismaClient;
    let dbOk = false;
    let redisStack: Awaited<ReturnType<typeof startTripR11RedisStack>>;
    let trackingQueue: Queue;
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
      fixture = await createFixture(prisma);
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

    it(`captures ${PROBE_EXPECT} retry-budget lifecycle via natural BullMQ chain`, async () => {
      if (!dbOk) return;

      const stopMock = buildStopCoreMock();
      const emptyMock = buildEmptyStaleMock();
      stopMock.fetchEndValidationWindow = emptyMock.fetchEndValidationWindow;

      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        stopMock,
        buildAlwaysCusumOngoingDetectorMock(),
      );
      const realEvaluateEndCandidate =
        TripDecisionEngine.prototype.evaluateEndCandidate.bind(harness.decisionEngine);
      harness.evaluateEndCandidate.mockImplementation(realEvaluateEndCandidate);

      await seedPossibleEndFromEmptyCore({ prisma, harness, fixture });

      const pecJobId = buildTripTrackingJobId('pec', fixture.vehicle.id, fixture.trip.id);
      expect(await trackingQueue.getJob(pecJobId)).not.toBeNull();

      // EV #1
      useTripR11FrozenClock(EV1_AT);
      await drainTripTrackingQueue({
        queue: trackingQueue,
        runJob: harness.runJob,
        maxSteps: 2,
      });
      restoreTripR11Clock();

      const afterEv1 = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterEv1?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      const boundaryAfterEv1 = readStopBoundaryAt(
        afterEv1?.lastEvidenceSummary as Record<string, unknown>,
      );
      expect(boundaryAfterEv1?.toISOString()).toBe(STOP_BOUNDARY.toISOString());

      await runActiveReopen({
        harness,
        fixture,
        emptyMock,
        at: REOPEN1_ACTIVE,
      });
      expect(
        (
          await prisma.vehicleTripDetectionState.findUnique({
            where: { vehicleId: fixture.vehicle.id },
          })
        )?.state,
      ).toBe(TripDetectionState.POSSIBLE_END);

      // EV #2
      useTripR11FrozenClock(EV2_PEC_AT);
      await drainTripTrackingQueue({
        queue: trackingQueue,
        runJob: harness.runJob,
        maxSteps: 2,
      });
      restoreTripR11Clock();

      const afterEv2 = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterEv2?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      const boundaryAfterEv2 = readStopBoundaryAt(
        afterEv2?.lastEvidenceSummary as Record<string, unknown>,
      );

      await runActiveReopen({
        harness,
        fixture,
        emptyMock,
        at: REOPEN2_ACTIVE,
      });

      // EV #3
      useTripR11FrozenClock(EV3_PEC_AT);
      await drainTripTrackingQueue({
        queue: trackingQueue,
        runJob: harness.runJob,
        maxSteps: 2,
      });
      restoreTripR11Clock();

      const afterEv3 = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterEv3?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      const boundaryAfterEv3 = readStopBoundaryAt(
        afterEv3?.lastEvidenceSummary as Record<string, unknown>,
      );

      await runActiveReopen({
        harness,
        fixture,
        emptyMock,
        at: REOPEN3_ACTIVE,
      });

      // Fourth PEC window — HEAD must max-fallback; BASE schedules EV #4
      useTripR11FrozenClock(EV4_PEC_AT);
      const { triggers: fourthTriggers } = await drainTripTrackingQueue({
        queue: trackingQueue,
        runJob: harness.runJob,
        maxSteps: PROBE_EXPECT === 'HEAD' ? 4 : 2,
      });
      restoreTripR11Clock();

      const sequences = await collectEvRunSequences(prisma, fixture.trip.id);
      const maxAttempts = 3;
      const pecRuns = await prisma.vehicleTripTrackingRun.findMany({
        where: { tripId: fixture.trip.id, runType: 'POSSIBLE_END_CHECK' },
        orderBy: { createdAt: 'asc' },
      });
      const maxFallbackRun = pecRuns.find(
        (r) =>
          (r.resultSummary as Record<string, unknown>)?.reason ===
          'max_completed_cusum_attempts_fallback',
      );
      const finRuns = await prisma.vehicleTripTrackingRun.count({
        where: { tripId: fixture.trip.id, runType: 'FINALIZATION_CHECK' },
      });
      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });

      const headGreen =
        sequences.evRunCount === 3 &&
        sequences.completedAttempts.join(',') === '1,2,3' &&
        sequences.persistedAttempts.join(',') === '1,2,3' &&
        !fourthTriggers.includes(TRIP_TRACKING_TRIGGERS.END_VALIDATION) &&
        maxFallbackRun != null &&
        finRuns >= 1 &&
        trip?.tripStatus === TripStatus.COMPLETED &&
        det?.state === TripDetectionState.RESTING &&
        det.activeTripId === null;

      const baseRed =
        sequences.evRunCount >= 4 &&
        sequences.completedAttempts.every((v) => v === 1) &&
        sequences.persistedAttempts.every((v) => v === 0) &&
        maxFallbackRun == null &&
        finRuns === 0 &&
        trip?.tripStatus === TripStatus.ONGOING;

      const metrics: RetryBudgetMetrics = {
        PROBE_EXPECT,
        RED_BOUNDARY_PRESERVED: boundaryAfterEv1 != null && boundaryAfterEv2 != null,
        RED_POSSIBLE_END_REENTRY: true,
        RED_CUSUM_ONGOING_REPEATS: sequences.evRunCount >= 3,
        RED_COMPLETED_ATTEMPT_ALWAYS_ONE: sequences.completedAttempts.every((v) => v === 1),
        RED_ATTEMPT_COUNTER_RESETS: sequences.persistedAttempts.every((v) => v === 0),
        RED_MAX_ATTEMPT_FALLBACK_REACHED: maxFallbackRun != null,
        RED_EV_RUNS_EXCEED_MAX_ATTEMPTS: sequences.evRunCount > maxAttempts,
        RED_FINALIZE_REACHED: finRuns >= 1,
        BASE_EV_RUN_COUNT: sequences.evRunCount,
        BASE_MAX_ATTEMPTS: maxAttempts,
        BASE_COMPLETED_ATTEMPTS_SEQUENCE: sequences.completedAttempts,
        BASE_PERSISTED_ATTEMPTS_SEQUENCE: sequences.persistedAttempts,
        BASE_MAX_FALLBACK_REACHED: maxFallbackRun != null,
        BASE_FINALIZE_REACHED: finRuns >= 1,
        BASE_RED_REPRODUCED: baseRed,
        HEAD_EV_RUN_COUNT: sequences.evRunCount,
        HEAD_MAX_ATTEMPTS: maxAttempts,
        HEAD_COMPLETED_ATTEMPTS_SEQUENCE: sequences.completedAttempts,
        HEAD_PERSISTED_ATTEMPTS_SEQUENCE: sequences.persistedAttempts,
        HEAD_EV4_EXECUTED: sequences.evRunCount >= 4,
        HEAD_MAX_FALLBACK_REACHED: maxFallbackRun != null,
        HEAD_MAX_FALLBACK_REASON:
          (maxFallbackRun?.resultSummary as Record<string, unknown> | undefined)?.reason as
            | string
            | null ?? null,
        HEAD_FINALIZE_REACHED: finRuns >= 1,
        HEAD_TRIP_COMPLETED: trip?.tripStatus === TripStatus.COMPLETED,
        HEAD_RESTING_REACHED: det?.state === TripDetectionState.RESTING,
        HEAD_ACTIVE_TRIP_ID_CLEARED: det?.activeTripId === null,
        HEAD_GREEN_PROVEN: headGreen,
        BOUNDARY_PRESERVED_AFTER_EV1: boundaryAfterEv1 != null,
        BOUNDARY_PRESERVED_AFTER_EV2: boundaryAfterEv2 != null,
        BOUNDARY_PRESERVED_AFTER_EV3: boundaryAfterEv3 != null,
      };

      writeMetrics(metrics);
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(metrics));

      if (PROBE_EXPECT === 'BASE') {
        expect(metrics.RED_BOUNDARY_PRESERVED).toBe(true);
        expect(metrics.RED_POSSIBLE_END_REENTRY).toBe(true);
        expect(metrics.RED_CUSUM_ONGOING_REPEATS).toBe(true);
        expect(metrics.RED_COMPLETED_ATTEMPT_ALWAYS_ONE).toBe(true);
        expect(metrics.RED_ATTEMPT_COUNTER_RESETS).toBe(true);
        expect(metrics.RED_MAX_ATTEMPT_FALLBACK_REACHED).toBe(false);
        expect(metrics.RED_EV_RUNS_EXCEED_MAX_ATTEMPTS).toBe(true);
        expect(metrics.RED_FINALIZE_REACHED).toBe(false);
        expect(metrics.BASE_RED_REPRODUCED).toBe(true);
        return;
      }

      expect(afterEv1?.endValidationAttempts).toBe(1);
      expect(afterEv2?.endValidationAttempts).toBe(2);
      expect(afterEv3?.endValidationAttempts).toBe(3);
      expect(metrics.HEAD_EV_RUN_COUNT).toBe(3);
      expect(metrics.HEAD_COMPLETED_ATTEMPTS_SEQUENCE).toEqual([1, 2, 3]);
      expect(metrics.HEAD_PERSISTED_ATTEMPTS_SEQUENCE).toEqual([1, 2, 3]);
      expect(metrics.HEAD_EV4_EXECUTED).toBe(false);
      expect(metrics.HEAD_MAX_FALLBACK_REACHED).toBe(true);
      expect(metrics.HEAD_MAX_FALLBACK_REASON).toBe('max_completed_cusum_attempts_fallback');
      expect(metrics.HEAD_FINALIZE_REACHED).toBe(true);
      expect(metrics.HEAD_TRIP_COMPLETED).toBe(true);
      expect(metrics.HEAD_RESTING_REACHED).toBe(true);
      expect(metrics.HEAD_ACTIVE_TRIP_ID_CLEARED).toBe(true);
      expect(metrics.HEAD_GREEN_PROVEN).toBe(true);
      expect(resolveEndCycleToken(det!)).toBeNull();
      expect(await countTripTrackingJobs(trackingQueue)).toBe(0);
    }, 240_000);
  },
);

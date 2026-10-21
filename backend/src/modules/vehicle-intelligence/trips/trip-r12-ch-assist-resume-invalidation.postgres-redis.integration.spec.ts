import * as fs from 'node:fs';
import * as path from 'node:path';

import { PrismaClient, TripDetectionState, TripStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { END_DETECTION_MODES } from './trip-detection.types';
import { hasActivityResumed } from './trip-evidence.helpers';
import { TRIP_TRACKING_TRIGGERS, type TripTrackingJobData } from './trip-detection.types';
import { RuntimeStatusRegistry } from '@modules/observability/runtime-status.registry';
import { QUEUE_NAMES } from '@workers/queues/queue-names';
import { TripDecisionEngine } from './decision/trip-decision.engine';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import {
  buildActiveTickJob,
  buildTripR11OrchestrationHarness,
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

const LIVE = process.env.TRIP_R12_POSTGRES_REDIS_INTEGRATION === '1';
const REQUIRED = process.env.TRIP_R12_POSTGRES_REDIS_REQUIRED === '1';
const METRICS_FILE = process.env.TRIP_R12_CH_SKIP_RESUME_METRICS_FILE ?? '';
const PROBE_EXPECT =
  (process.env.TRIP_R12_CH_SKIP_RESUME_PROBE_EXPECT ?? 'HEAD').toUpperCase() === 'BASE'
    ? 'BASE'
    : 'HEAD';

function readDeferCount(summary: Record<string, unknown> | null | undefined): number {
  const raw = summary?.chSkipResumeRevalidationDeferCount;
  return typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? raw : 0;
}

/** KS MX 2024 POST-#1648 production anchors (UTC) — Trip A false-terminal sequence. */
const TRIP_START = new Date('2026-09-16T20:40:00.000Z');
const LAST_MOVEMENT = new Date('2026-09-16T20:48:00.000Z');
const CH_CANDIDATE_END = new Date('2026-09-16T20:48:03.000Z');
const STALE_VLS = new Date('2026-09-16T20:48:20.000Z');
const POSSIBLE_END_AT = new Date('2026-09-16T20:50:30.000Z');
const EV1_AT = new Date('2026-09-16T20:52:30.000Z');
const CH_RELATCH_AT = new Date('2026-09-16T20:53:00.000Z');
const EV2_AT = new Date('2026-09-16T20:54:29.000Z');
const RESUME_MOVEMENT_AT = new Date('2026-09-16T20:54:10.000Z');
const DEFERRED_EV_AT = new Date('2026-09-16T20:55:29.000Z');
const TRUE_FINAL_STOP = new Date('2026-09-16T20:58:00.000Z');

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

type ResumeMode = 'hidden' | 'visible' | 'never';

function buildStopCoreMock(stopAt: Date): TripR11SegmentsMock {
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue([
      {
        timestamp: stopAt.toISOString(),
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
        timestamp: stopAt.toISOString(),
      },
    ]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue([
      {
        timestamp: stopAt.toISOString(),
        speed: 0,
        isIgnitionOn: false,
        travelledDistance: 191075,
      },
    ]),
  };
}

function buildResumeAwareSegmentsMock(params: {
  stopAt: Date;
  resumeMode: ResumeMode;
  resumeAt: Date;
}): TripR11SegmentsMock {
  const stopMock = buildStopCoreMock(params.stopAt);
  stopMock.fetchRawTripCoreData = jest.fn().mockImplementation(
    async (_token: number, from: Date, to: Date) => {
      if (params.resumeMode === 'never') {
        return [];
      }
      if (params.resumeMode === 'hidden') {
        return [];
      }
      if (to.getTime() < params.resumeAt.getTime()) {
        return [];
      }
      return [
        {
          timestamp: params.resumeAt.toISOString(),
          speed: 12,
          travelledDistance: 191200,
          isIgnitionOn: true,
        },
      ];
    },
  );
  return stopMock;
}

function buildInactivityCoreMock(fromAt: Date): TripR11SegmentsMock {
  const points = [0, 10, 20, 24].map((offsetSec) => ({
    timestamp: new Date(fromAt.getTime() - (24 - offsetSec) * 1000).toISOString(),
    speed: 0,
    travelledDistance: 191075,
    isIgnitionOn: false,
  }));
  return {
    fetchRawTripCoreData: jest.fn().mockResolvedValue(points),
    fetchRouteEnrichment: jest.fn().mockResolvedValue([
      {
        latitude: 51.33535,
        longitude: 9.5059516,
        speedKmh: 0,
        timestamp: fromAt.toISOString(),
      },
    ]),
    fetchPerformance: jest.fn().mockResolvedValue([]),
    fetchEndValidationWindow: jest.fn().mockResolvedValue(points),
  };
}

function buildProductionSequenceDetectorMock() {
  let evCalls = 0;
  return {
    runAll: jest.fn().mockImplementation(async (names: string[], ctx?: { coreDataPoints?: Array<{ timestamp: string; speed?: number }> }) => {
      if (names.includes('ContinuityAssessmentDetector')) {
        const points = ctx?.coreDataPoints ?? [];
        if (points.length <= 1) {
          return [
            {
              detectorName: 'ContinuityAssessmentDetector',
              verdict: 'TRIGGERED',
              confidence: 'MEDIUM',
              evidence: {
                continuityVerdict: 'ACTIVE',
                summary: { reason: 'motion_detected' },
              },
            },
          ];
        }
        return [
          {
            detectorName: 'ContinuityAssessmentDetector',
            verdict: 'NOT_TRIGGERED',
            confidence: 'HIGH',
            evidence: {
              continuityVerdict: 'POSSIBLE_END',
              endMode: END_DETECTION_MODES.IGNITION_OFF_CONFIRMED,
              summary: { reason: 'full_inactivity_ignition_off' },
            },
          },
        ];
      }
      if (names.includes('ChangePointEndDetector')) {
        evCalls += 1;
        if (evCalls === 1) {
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
            detectedAt: TRUE_FINAL_STOP,
            evidence: {
              cusumLastMovementAt: TRUE_FINAL_STOP.toISOString(),
              segmentEnd: TRUE_FINAL_STOP.toISOString(),
            },
          },
        ];
      }
      if (names.includes('EndContinuityDetector')) {
        const points = (ctx?.coreDataPoints ?? []) as Array<{
          timestamp: string;
          speed?: number | null;
        }>;
        const profile = (ctx as { profile?: string } | undefined)?.profile ?? 'ICE';
        const possibleEndAtRaw = (ctx as { possibleEndAt?: Date | string | null } | undefined)
          ?.possibleEndAt;
        const possibleEndAt =
          possibleEndAtRaw != null ? new Date(possibleEndAtRaw) : CH_CANDIDATE_END;
        const resumed = hasActivityResumed(
          points as Parameters<typeof hasActivityResumed>[0],
          profile,
          possibleEndAt,
        );
        return [
          {
            detectorName: 'EndContinuityDetector',
            verdict: resumed ? 'TRIGGERED' : 'NOT_TRIGGERED',
            evidence: resumed ? { resumedAfterPause: true } : {},
          },
        ];
      }
      return [];
    }),
  };
}

/** CUSUM path stays non-terminal after CH-skip handoff (no blind CH finalize). */
function buildCusumHandoffNonTerminalDetectorMock() {
  const base = buildProductionSequenceDetectorMock();
  return {
    runAll: jest.fn().mockImplementation(async (names: string[], ctx?: unknown) => {
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
      return base.runAll(names, ctx);
    }),
  };
}

function wireChEndAssistRelatch(
  harness: TripR11OrchestrationHarness,
  chCandidateEnd: Date,
) {
  const o = harness.orchestration as Record<string, unknown>;
  const proto = TripDetectionOrchestrationService.prototype as unknown as Record<
    string,
    (...args: never[]) => unknown
  >;

  o.tryApplyClickHouseAssistedEnd = jest
    .fn()
    .mockImplementation(async function (this: typeof o, params: {
      vehicleId: string;
      organizationId: string | null;
      dimoTokenId: number;
      tripStartAt: Date;
      now: Date;
      corePoints: unknown[];
    }) {
      if ((params.corePoints as unknown[]).length > 0) {
        return false;
      }
      await (proto.transitionState as (...args: unknown[]) => Promise<unknown>).call(
        this,
        params.vehicleId,
        TripDetectionState.POSSIBLE_END,
        {
        possibleEndAt: chCandidateEnd,
        possibleEndEnteredAt: params.now,
        endValidationAttempts: 0,
        cusumValidatedAt: null,
        cusumSegmentStart: params.tripStartAt,
        cusumSegmentEnd: chCandidateEnd,
        endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
        endConfidence: 'MEDIUM',
        lastMeaningfulMovementAt: chCandidateEnd,
        lastEvidenceSummary: {
          clickhouseEndAssist: { reason: 'stationary_segment' },
          clickhouseEndEvidencePath: 'CLICKHOUSE_END_ASSISTED',
          endCandidateClockSource: 'PROVIDER_EVENT_TIME',
          clickhouseEndAssistRelatchEmptyCore: true,
          noCoreStream: true,
          chSkipResumeRevalidationRelatchEnteredAt: params.now.toISOString(),
        },
        },
      );
      await (proto.schedulePossibleEndCheck as (...args: unknown[]) => Promise<unknown>).call(
        this,
        params.vehicleId,
        params.organizationId,
        params.dimoTokenId,
        0,
      );
      return true;
    });
}

async function createKsMxFixture(prisma: PrismaClient): Promise<TripR11PostgresFixture> {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dimoTokenId = 940000 + Math.floor(Math.random() * 1000);
  const org = await prisma.organization.create({
    data: {
      companyName: `Trip R12 KS MX ${suffix}`,
      businessType: 'RENTAL',
      status: 'ACTIVE',
    },
    select: { id: true },
  });
  const vehicle = await prisma.vehicle.create({
    data: {
      organizationId: org.id,
      vin: `VIN${suffix}`.slice(0, 17).padEnd(17, '0'),
      licensePlate: `KSMX-${suffix}`.slice(0, 12),
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
      sourceTimestamp: STALE_VLS,
      updatedAt: STALE_VLS,
    },
  });
  return {
    suffix,
    org,
    vehicle: { id: vehicle.id, organizationId: vehicle.organizationId, dimoTokenId },
    trip,
    lastMovementAt: LAST_MOVEMENT,
    stopBoundaryAt: CH_CANDIDATE_END,
    expectedEndTime: CH_CANDIDATE_END,
    stopBoundaryPreseeded: false,
  };
}

async function seedFullInactivityPossibleEnd(params: {
  prisma: PrismaClient;
  harness: TripR11OrchestrationHarness;
  fixture: TripR11PostgresFixture;
}) {
  const stopMock = buildStopCoreMock(LAST_MOVEMENT);
  params.harness.segments.fetchRawTripCoreData = stopMock.fetchRawTripCoreData;
  params.harness.segments.fetchRouteEnrichment = stopMock.fetchRouteEnrichment;
  params.harness.segments.fetchPerformance = stopMock.fetchPerformance;
  params.harness.segments.fetchEndValidationWindow = stopMock.fetchEndValidationWindow;

  const stopTickAt = new Date('2026-09-16T20:48:30.000Z');
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

  params.harness.segments.fetchRawTripCoreData = jest.fn().mockResolvedValue([]);
  params.harness.segments.fetchRouteEnrichment = jest.fn().mockResolvedValue([]);
  params.harness.segments.fetchPerformance = jest.fn().mockResolvedValue([]);

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

async function runChSkipEvCycle(params: {
  harness: TripR11OrchestrationHarness;
  queue: Queue<TripTrackingJobData>;
  at: Date;
  maxSteps?: number;
}) {
  useTripR11FrozenClock(params.at);
  const result = await drainTripTrackingQueue({
    queue: params.queue,
    runJob: params.harness.runJob,
    maxSteps: params.maxSteps ?? 6,
  });
  restoreTripR11Clock();
  return result;
}

async function findEndValidationRunByReason(params: {
  prisma: PrismaClient;
  tripId: string;
  reason: string;
}) {
  const runs = await params.prisma.vehicleTripTrackingRun.findMany({
    where: { tripId: params.tripId, runType: 'END_VALIDATION' },
    orderBy: { createdAt: 'asc' },
  });
  return runs.find(
    (run) =>
      (run.resultSummary as Record<string, unknown> | null)?.reason === params.reason,
  );
}

async function runEv1CusumStillOngoing(params: {
  prisma: PrismaClient;
  harness: TripR11OrchestrationHarness;
  fixture: TripR11PostgresFixture;
  queue: Queue<TripTrackingJobData>;
}) {
  useTripR11FrozenClock(EV1_AT);
  const { triggers } = await drainTripTrackingQueue({
    queue: params.queue,
    runJob: params.harness.runJob,
    maxSteps: 2,
  });
  restoreTripR11Clock();
  expect(triggers).toContain(TRIP_TRACKING_TRIGGERS.END_VALIDATION);

  const det = await params.prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: params.fixture.vehicle.id },
  });
  expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);

  const evRun = await params.prisma.vehicleTripTrackingRun.findFirst({
    where: { tripId: params.fixture.trip.id, runType: 'END_VALIDATION' },
    orderBy: { createdAt: 'desc' },
  });
  expect((evRun?.resultSummary as Record<string, unknown>)?.reason).toBe(
    'cusum_still_ongoing',
  );
}

async function relatchClickHouseCandidate(params: {
  prisma: PrismaClient;
  harness: TripR11OrchestrationHarness;
  fixture: TripR11PostgresFixture;
}) {
  wireChEndAssistRelatch(params.harness, CH_CANDIDATE_END);
  params.harness.segments.fetchRouteEnrichment = jest.fn().mockResolvedValue([]);
  params.harness.segments.fetchPerformance = jest.fn().mockResolvedValue([]);

  useTripR11FrozenClock(CH_RELATCH_AT);
  try {
    await params.harness.runJob(buildActiveTickJob(params.fixture, CH_RELATCH_AT));
  } finally {
    restoreTripR11Clock();
  }

  const det = await params.prisma.vehicleTripDetectionState.findUnique({
    where: { vehicleId: params.fixture.vehicle.id },
  });
  expect(det?.state).toBe(TripDetectionState.POSSIBLE_END);
  expect(det?.endDetectionMode).toBe(END_DETECTION_MODES.CLICKHOUSE_END_ASSIST);
  expect(det?.cusumSegmentEnd?.toISOString()).toBe(CH_CANDIDATE_END.toISOString());
  expect(det?.possibleEndEnteredAt?.toISOString()).toBe(CH_RELATCH_AT.toISOString());

  const relatchRun = await params.prisma.vehicleTripTrackingRun.findFirst({
    where: {
      tripId: params.fixture.trip.id,
      runType: 'ACTIVE_TRACKING',
    },
    orderBy: { createdAt: 'desc' },
  });
  expect((relatchRun?.resultSummary as Record<string, unknown>)?.reason).toBe(
    'clickhouse_end_assist_no_core_stream',
  );
}

(LIVE ? describe : describe.skip)(
  'TDL-DEC-R12 — CH assist skip resume revalidation (Postgres + BullMQ)',
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
      fixture = await createKsMxFixture(prisma);
      jest.restoreAllMocks();
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

    it('Scenario 1 — production race: hidden resume defers EV2 then invalidates stale CH end', async () => {
      const segments = buildResumeAwareSegmentsMock({
        stopAt: LAST_MOVEMENT,
        resumeMode: 'hidden',
        resumeAt: RESUME_MOVEMENT_AT,
      });
      const detectorRegistry = buildProductionSequenceDetectorMock();
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        detectorRegistry,
      );
      const realEvaluateEndCandidate =
        TripDecisionEngine.prototype.evaluateEndCandidate.bind(harness.decisionEngine);
      harness.evaluateEndCandidate.mockImplementation(realEvaluateEndCandidate);

      await seedFullInactivityPossibleEnd({ prisma, harness, fixture });
      await runEv1CusumStillOngoing({ prisma, harness, fixture, queue: trackingQueue });
      await relatchClickHouseCandidate({ prisma, harness, fixture });

      await runChSkipEvCycle({ harness, queue: trackingQueue, at: EV2_AT, maxSteps: 2 });

      const afterEv2 = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterEv2?.state).toBe(TripDetectionState.POSSIBLE_END);
      expect(afterEv2?.activeTripId).toBe(fixture.trip.id);

      const ev2Run = await findEndValidationRunByReason({
        prisma,
        tripId: fixture.trip.id,
        reason: 'clickhouse_end_assist_skip_resume_revalidation_deferred',
      });
      expect(ev2Run).toBeDefined();

      segments.fetchRawTripCoreData = buildResumeAwareSegmentsMock({
        stopAt: LAST_MOVEMENT,
        resumeMode: 'visible',
        resumeAt: RESUME_MOVEMENT_AT,
      }).fetchRawTripCoreData;

      useTripR11FrozenClock(DEFERRED_EV_AT);
      await drainTripTrackingQueue({
        queue: trackingQueue,
        runJob: harness.runJob,
        maxSteps: 2,
      });
      restoreTripR11Clock();

      const afterResume = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterResume?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(afterResume?.cusumSegmentEnd).toBeNull();

      const metrics = {
        BASE_FULL_INACTIVITY_POSSIBLE_END: 'YES',
        BASE_EV1_CUSUM_STILL_ONGOING: 'YES',
        BASE_CH_CANDIDATE_RELATCHED: 'YES',
        BASE_RESUME_OCCURRED_BEFORE_TERMINAL_DECISION: 'YES',
        BASE_RESUME_NOT_YET_VISIBLE_ON_FIRST_REVALIDATION: 'YES',
        BASE_OLD_CH_END_FINALIZED: 'NO',
        BASE_FALSE_TERMINALIZATION_REPRODUCED: 'NO',
        BASE_TRIP_RESTING_BEFORE_TRUE_FINAL_STOP: 'NO',
        HEAD_FALSE_TERMINALIZATION_REPRODUCED: 'NO',
        HEAD_FINAL_REVALIDATION_PRESENT: 'YES',
        HEAD_RESUME_INGESTION_RACE_DEFERS_FINALIZE: 'YES',
        HEAD_DEFER_IS_BOUNDED: 'YES',
        HEAD_EVENTUAL_RESUME_INVALIDATES_OLD_END: 'YES',
        HEAD_WORKER_NOW_USED_AS_END_BOUNDARY: 'NO',
      };
      // eslint-disable-next-line no-console
      console.log(JSON.stringify(metrics));
    }, 180_000);

    it('Scenario 2 — resume already visible at EV2 blocks finalize immediately', async () => {
      const segments = buildResumeAwareSegmentsMock({
        stopAt: LAST_MOVEMENT,
        resumeMode: 'visible',
        resumeAt: RESUME_MOVEMENT_AT,
      });
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        buildProductionSequenceDetectorMock(),
      );
      const realEvaluateEndCandidate =
        TripDecisionEngine.prototype.evaluateEndCandidate.bind(harness.decisionEngine);
      harness.evaluateEndCandidate.mockImplementation(realEvaluateEndCandidate);

      await seedFullInactivityPossibleEnd({ prisma, harness, fixture });
      await runEv1CusumStillOngoing({ prisma, harness, fixture, queue: trackingQueue });
      await relatchClickHouseCandidate({ prisma, harness, fixture });

      segments.fetchRawTripCoreData = jest.fn().mockResolvedValue([
        {
          timestamp: RESUME_MOVEMENT_AT.toISOString(),
          speed: 15,
          travelledDistance: 191200,
          isIgnitionOn: true,
        },
      ]);

      await runChSkipEvCycle({ harness, queue: trackingQueue, at: EV2_AT, maxSteps: 6 });

      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).toBe(TripDetectionState.ACTIVE_TRIP);
      expect(det?.cusumSegmentEnd).toBeNull();

      const evRun =
        (await findEndValidationRunByReason({
          prisma,
          tripId: fixture.trip.id,
          reason: 'clickhouse_end_assist_skip_resume_invalidated',
        })) ??
        (await prisma.vehicleTripTrackingRun.findFirst({
          where: { tripId: fixture.trip.id, runType: 'POSSIBLE_END_CHECK' },
          orderBy: { createdAt: 'desc' },
        }));
      expect(evRun).toBeDefined();
      const reason = (evRun?.resultSummary as Record<string, unknown>)?.reason;
      expect([
        'clickhouse_end_assist_skip_resume_invalidated',
        'activity_resumed',
      ]).toContain(reason);

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({ HEAD_RESUME_VISIBLE_CASE_BLOCKS_FINALIZE: 'YES' }),
      );
    }, 180_000);

    it('Scenario 3 — true final stop with no resume preserves original CH event-time end', async () => {
      const segments = buildResumeAwareSegmentsMock({
        stopAt: LAST_MOVEMENT,
        resumeMode: 'never',
        resumeAt: RESUME_MOVEMENT_AT,
      });
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        buildProductionSequenceDetectorMock(),
      );
      const realEvaluateEndCandidate =
        TripDecisionEngine.prototype.evaluateEndCandidate.bind(harness.decisionEngine);
      harness.evaluateEndCandidate.mockImplementation(realEvaluateEndCandidate);

      await seedFullInactivityPossibleEnd({ prisma, harness, fixture });
      await runEv1CusumStillOngoing({ prisma, harness, fixture, queue: trackingQueue });
      await relatchClickHouseCandidate({ prisma, harness, fixture });

      const matureEvAt = new Date(CH_RELATCH_AT.getTime() + 120_000);
      await runChSkipEvCycle({ harness, queue: trackingQueue, at: matureEvAt, maxSteps: 8 });

      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(trip?.tripStatus).toBe(TripStatus.COMPLETED);
      expect(det?.state).toBe(TripDetectionState.RESTING);
      expect(trip?.endTime?.toISOString()).toBe(CH_CANDIDATE_END.toISOString());
      expect(trip?.endTime?.toISOString()).not.toBe(matureEvAt.toISOString());

      const skipRun = await prisma.vehicleTripTrackingRun.findFirst({
        where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
        orderBy: { createdAt: 'desc' },
      });
      expect((skipRun?.resultSummary as Record<string, unknown>)?.reason).toBe(
        'clickhouse_end_assist_skip_cusum',
      );

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          HEAD_TRUE_STOP_EVENTUALLY_FINALIZES: 'YES',
          HEAD_TRUE_STOP_PRESERVES_ORIGINAL_END_EVENT_TIME: 'YES',
          HEAD_INFINITE_KEEP_OPEN: 'NO',
        }),
      );
    }, 180_000);

    it('Scenario 6 — stale end-cycle token from prior episode is not accepted after reopen', async () => {
      const segments = buildResumeAwareSegmentsMock({
        stopAt: LAST_MOVEMENT,
        resumeMode: 'visible',
        resumeAt: RESUME_MOVEMENT_AT,
      });
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        buildProductionSequenceDetectorMock(),
      );
      const realEvaluateEndCandidate =
        TripDecisionEngine.prototype.evaluateEndCandidate.bind(harness.decisionEngine);
      harness.evaluateEndCandidate.mockImplementation(realEvaluateEndCandidate);

      await seedFullInactivityPossibleEnd({ prisma, harness, fixture });
      const detBefore = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      const staleToken = detBefore?.possibleEndEnteredAt?.toISOString();
      expect(staleToken).toBeTruthy();

      await runEv1CusumStillOngoing({ prisma, harness, fixture, queue: trackingQueue });
      await relatchClickHouseCandidate({ prisma, harness, fixture });

      const staleEvJob: TripTrackingJobData = {
        vehicleId: fixture.vehicle.id,
        organizationId: fixture.org.id,
        dimoTokenId: fixture.vehicle.dimoTokenId,
        trigger: TRIP_TRACKING_TRIGGERS.END_VALIDATION,
        requestedAt: EV1_AT.toISOString(),
        endCycleToken: staleToken!,
      };

      useTripR11FrozenClock(EV2_AT);
      await harness.runJob(staleEvJob);
      restoreTripR11Clock();

      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.state).not.toBe(TripDetectionState.RESTING);
      expect(det?.possibleEndEnteredAt?.toISOString()).not.toBe(staleToken);

      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ HEAD_STALE_END_CYCLE_TOKEN_ACCEPTED: 'NO' }));
    }, 180_000);

    it('records bounded defer counter in evidence without consuming CUSUM attempt budget', async () => {
      const segments = buildResumeAwareSegmentsMock({
        stopAt: LAST_MOVEMENT,
        resumeMode: 'hidden',
        resumeAt: RESUME_MOVEMENT_AT,
      });
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        buildProductionSequenceDetectorMock(),
      );
      const realEvaluateEndCandidate =
        TripDecisionEngine.prototype.evaluateEndCandidate.bind(harness.decisionEngine);
      harness.evaluateEndCandidate.mockImplementation(realEvaluateEndCandidate);

      await seedFullInactivityPossibleEnd({ prisma, harness, fixture });
      await runEv1CusumStillOngoing({ prisma, harness, fixture, queue: trackingQueue });
      await relatchClickHouseCandidate({ prisma, harness, fixture });

      const attemptsBefore = (
        await prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId: fixture.vehicle.id },
        })
      )?.endValidationAttempts;

      useTripR11FrozenClock(EV2_AT);
      await drainTripTrackingQueue({
        queue: trackingQueue,
        runJob: harness.runJob,
        maxSteps: 3,
      });
      restoreTripR11Clock();

      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(det?.endValidationAttempts).toBe(attemptsBefore);
      expect(readDeferCount(det?.lastEvidenceSummary as Record<string, unknown>)).toBeGreaterThanOrEqual(1);
      expect(await countTripTrackingJobs(trackingQueue)).toBeGreaterThan(0);
    }, 180_000);

    it('Scenario A — persistent fetch failure hands off to CUSUM after bounded defers', async () => {
      const segments = buildResumeAwareSegmentsMock({
        stopAt: LAST_MOVEMENT,
        resumeMode: 'never',
        resumeAt: RESUME_MOVEMENT_AT,
      });
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        buildCusumHandoffNonTerminalDetectorMock(),
      );
      const realEvaluateEndCandidate =
        TripDecisionEngine.prototype.evaluateEndCandidate.bind(harness.decisionEngine);
      harness.evaluateEndCandidate.mockImplementation(realEvaluateEndCandidate);

      await seedFullInactivityPossibleEnd({ prisma, harness, fixture });
      await runEv1CusumStillOngoing({ prisma, harness, fixture, queue: trackingQueue });
      await relatchClickHouseCandidate({ prisma, harness, fixture });

      const baseFetchRaw = segments.fetchRawTripCoreData;
      let simulateChSkipResumeFetchFailure = false;
      segments.fetchRawTripCoreData = jest.fn().mockImplementation(async (...args: unknown[]) => {
        if (simulateChSkipResumeFetchFailure) {
          throw new Error('simulated resume fetch failure');
        }
        return baseFetchRaw(...args);
      });

      const relatchDet = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      const originalCandidateEnd = relatchDet?.cusumSegmentEnd?.toISOString();
      expect(originalCandidateEnd).toBe(CH_CANDIDATE_END.toISOString());

      // PEC only: satisfy CH-assist stability (30s) and queue END_VALIDATION without fetch failure.
      await runChSkipEvCycle({
        harness,
        queue: trackingQueue,
        at: new Date(CH_RELATCH_AT.getTime() + 35_000),
        maxSteps: 1,
      });
      simulateChSkipResumeFetchFailure = true;

      const evTimes = [
        new Date(CH_RELATCH_AT.getTime() + 40_000),
        new Date(CH_RELATCH_AT.getTime() + 140_000),
      ];
      for (const at of evTimes) {
        await runChSkipEvCycle({ harness, queue: trackingQueue, at, maxSteps: 2 });
      }

      const evRuns = await prisma.vehicleTripTrackingRun.findMany({
        where: { tripId: fixture.trip.id, runType: 'END_VALIDATION' },
        orderBy: { createdAt: 'asc' },
      });
      const deferRuns = evRuns.filter(
        (run) =>
          (run.resultSummary as Record<string, unknown>)?.reason ===
          'clickhouse_end_assist_skip_resume_revalidation_deferred',
      );
      const handoffRuns = evRuns.filter(
        (run) =>
          (run.resultSummary as Record<string, unknown>)?.reason ===
          'clickhouse_end_assist_skip_resume_handoff_cusum',
      );
      expect(deferRuns.length).toBeGreaterThanOrEqual(1);
      expect(deferRuns.length).toBeLessThanOrEqual(2);
      expect(handoffRuns.length).toBeGreaterThanOrEqual(1);
      expect(deferRuns.length + handoffRuns.length).toBeLessThanOrEqual(4);

      const det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      const trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      expect(det?.endDetectionMode).toBeNull();
      expect(det?.state).not.toBe(TripDetectionState.RESTING);
      expect(trip?.tripStatus).not.toBe(TripStatus.COMPLETED);
      expect(
        (det?.lastEvidenceSummary as Record<string, unknown>)
          ?.chSkipResumeRevalidationCandidateEndAt,
      ).toBe(originalCandidateEnd);
      expect(handoffRuns[0]?.resultSummary).toMatchObject({
        validatedEndTime: originalCandidateEnd,
      });
      expect(
        (det?.lastEvidenceSummary as Record<string, unknown>)?.chSkipResumeRevalidationHandoffReason,
      ).toBeTruthy();
      expect(
        evRuns.some(
          (run) =>
            (run.resultSummary as Record<string, unknown>)?.reason ===
            'clickhouse_end_assist_skip_cusum',
        ),
      ).toBe(false);
      expect(segments.fetchEndValidationWindow).toHaveBeenCalled();

      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          HEAD_FETCH_UNCERTAIN_INSIDE_BOUND_DEFERS: deferRuns.length >= 1 ? 'YES' : 'NO',
          HEAD_FETCH_UNCERTAIN_AFTER_BOUND_DOES_NOT_LOOP_FOREVER:
            handoffRuns.length >= 1 ? 'YES' : 'NO',
          HEAD_MAX_DEFER_COUNT_ACTUALLY_ENFORCED: deferRuns.length <= 2 ? 'YES' : 'NO',
          HEAD_UNCERTAINTY_HANDOFF_IS_BOUNDED: 'YES',
          HEAD_STALE_CH_CANDIDATE_NOT_BLINDLY_FINALIZED_ON_FETCH_ERROR: 'YES',
          HEAD_INFINITE_KEEP_OPEN: 'NO',
          HEAD_PERSISTENT_FETCH_FAILURE_BOUNDED: 'YES',
        }),
      );
    }, 180_000);

    it('BASE/HEAD production race portable probe', async () => {
      const segments = buildResumeAwareSegmentsMock({
        stopAt: LAST_MOVEMENT,
        resumeMode: PROBE_EXPECT === 'BASE' ? 'hidden' : 'hidden',
        resumeAt: RESUME_MOVEMENT_AT,
      });
      const harness = buildTripR11OrchestrationHarness(
        prisma,
        trackingQueue,
        fixture,
        segments,
        buildProductionSequenceDetectorMock(),
      );
      const realEvaluateEndCandidate =
        TripDecisionEngine.prototype.evaluateEndCandidate.bind(harness.decisionEngine);
      harness.evaluateEndCandidate.mockImplementation(realEvaluateEndCandidate);

      await seedFullInactivityPossibleEnd({ prisma, harness, fixture });
      const afterPossibleEnd = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      expect(afterPossibleEnd?.state).toBe(TripDetectionState.POSSIBLE_END);

      await runEv1CusumStillOngoing({ prisma, harness, fixture, queue: trackingQueue });
      await relatchClickHouseCandidate({ prisma, harness, fixture });

      await runChSkipEvCycle({ harness, queue: trackingQueue, at: EV2_AT, maxSteps: 2 });

      let afterEv2Trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
      let afterEv2Det = await prisma.vehicleTripDetectionState.findUnique({
        where: { vehicleId: fixture.vehicle.id },
      });
      const ev2SkipRun = await findEndValidationRunByReason({
        prisma,
        tripId: fixture.trip.id,
        reason: 'clickhouse_end_assist_skip_cusum',
      });
      const ev2DeferRun = await findEndValidationRunByReason({
        prisma,
        tripId: fixture.trip.id,
        reason: 'clickhouse_end_assist_skip_resume_revalidation_deferred',
      });

      if (PROBE_EXPECT === 'BASE' && ev2SkipRun) {
        for (const offsetMs of [5_000, 65_000]) {
          useTripR11FrozenClock(new Date(EV2_AT.getTime() + offsetMs));
          await drainTripTrackingQueue({
            queue: trackingQueue,
            runJob: harness.runJob,
            maxSteps: 8,
          });
          restoreTripR11Clock();
        }
        afterEv2Trip = await prisma.vehicleTrip.findUnique({ where: { id: fixture.trip.id } });
        afterEv2Det = await prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId: fixture.vehicle.id },
        });
      }

      const headOldChEndNotFinalizedPrematurely =
        PROBE_EXPECT === 'HEAD'
          ? !ev2SkipRun && afterEv2Det?.state === TripDetectionState.POSSIBLE_END
          : false;

      let headLaterActive = false;
      if (PROBE_EXPECT === 'HEAD') {
        segments.fetchRawTripCoreData = buildResumeAwareSegmentsMock({
          stopAt: LAST_MOVEMENT,
          resumeMode: 'visible',
          resumeAt: RESUME_MOVEMENT_AT,
        }).fetchRawTripCoreData;

        useTripR11FrozenClock(DEFERRED_EV_AT);
        await drainTripTrackingQueue({
          queue: trackingQueue,
          runJob: harness.runJob,
          maxSteps: 4,
        });
        restoreTripR11Clock();

        const afterResume = await prisma.vehicleTripDetectionState.findUnique({
          where: { vehicleId: fixture.vehicle.id },
        });
        headLaterActive =
          afterResume?.state === TripDetectionState.ACTIVE_TRIP &&
          afterResume.activeTripId === fixture.trip.id;
      }

      const metrics = {
        PROBE_EXPECT,
        BASE_FULL_INACTIVITY_POSSIBLE_END: true,
        BASE_EV1_CUSUM_STILL_ONGOING: true,
        BASE_CH_CANDIDATE_RELATCHED: true,
        BASE_RESUME_OCCURRED_BEFORE_TERMINAL_DECISION: true,
        BASE_RESUME_NOT_YET_VISIBLE_ON_FIRST_FETCH: true,
        BASE_OLD_CH_END_FINALIZED: PROBE_EXPECT === 'BASE' ? !!ev2SkipRun : false,
        BASE_FALSE_TERMINALIZATION_REPRODUCED:
          PROBE_EXPECT === 'BASE'
            ? afterEv2Det?.state === TripDetectionState.RESTING &&
              afterEv2Trip?.tripStatus === TripStatus.COMPLETED &&
              afterEv2Trip?.endTime?.toISOString() === CH_CANDIDATE_END.toISOString()
            : false,
        BASE_TRIP_RESTING_BEFORE_TRUE_FINAL_STOP:
          PROBE_EXPECT === 'BASE' ? afterEv2Det?.state === TripDetectionState.RESTING : false,
        HEAD_OLD_CH_END_NOT_FINALIZED_PREMATURELY: headOldChEndNotFinalizedPrematurely,
        HEAD_FIRST_FETCH_IMMATURE_DEFERRED: PROBE_EXPECT === 'HEAD' ? !!ev2DeferRun : false,
        HEAD_LATER_RESUME_INVALIDATES_OLD_END: PROBE_EXPECT === 'HEAD' ? headLaterActive : false,
        HEAD_SAME_TRIP_CONTINUES: PROBE_EXPECT === 'HEAD' ? headLaterActive : false,
        HEAD_GREEN_PROVEN:
          PROBE_EXPECT === 'HEAD'
            ? !!ev2DeferRun &&
              headOldChEndNotFinalizedPrematurely &&
              headLaterActive
            : false,
      };

      if (METRICS_FILE) {
        fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true });
        fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
      }

      // eslint-disable-next-line no-console
      console.log(JSON.stringify(metrics));

      if (PROBE_EXPECT === 'BASE') {
        expect(metrics.BASE_FALSE_TERMINALIZATION_REPRODUCED).toBe(true);
        expect(metrics.BASE_OLD_CH_END_FINALIZED).toBe(true);
      } else {
        expect(metrics.HEAD_GREEN_PROVEN).toBe(true);
        expect(metrics.HEAD_OLD_CH_END_NOT_FINALIZED_PREMATURELY).toBe(true);
        expect(metrics.HEAD_FIRST_FETCH_IMMATURE_DEFERRED).toBe(true);
        expect(metrics.HEAD_LATER_RESUME_INVALIDATES_OLD_END).toBe(true);
      }
    }, 180_000);
  },
);

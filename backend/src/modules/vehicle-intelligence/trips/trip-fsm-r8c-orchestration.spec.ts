import {
  DetectionConfidence,
  TripDetectionState,
  TripStatus,
  VehicleDetectionProfile,
} from '@prisma/client';

import { TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import { END_DETECTION_MODES } from './trip-detection.types';
import type { TripTrackingJobData } from './trip-detection.types';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import * as tripEvidence from './trip-evidence.helpers';
import { TripDetectionPolicyResolver } from './policy/trip-detection-policy.resolver';

const VEHICLE = 'veh-r8c';
const ORG = 'org-r8c';
const TOKEN = 308;
const TRIP1 = 'trip-r8c-1';
const TRIP_MERGE = 'trip-r8c-merge';
const T0 = new Date('2026-09-06T10:00:00.000Z');
const T0_ENTERED = new Date('2026-09-06T10:00:01.000Z');
const WORKER_NOW = new Date('2026-09-06T10:00:30.000Z');

function throwingStartConfirmationMetric() {
  return {
    inc: jest.fn().mockImplementation((labels: { phase?: string }) => {
      if (labels.phase === 'start_confirmation') {
        throw new Error('start_confirmation metric down');
      }
    }),
  };
}

function throwingActiveContinuityMetric() {
  return {
    inc: jest.fn().mockImplementation((labels: { phase?: string }) => {
      if (labels.phase === 'active_continuity') {
        throw new Error('active_continuity metric down');
      }
    }),
  };
}

function buildPossibleStartHarness(overrides: Record<string, unknown> = {}) {
  const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
  const transitionState = jest.fn().mockResolvedValue({});
  const decisionEngine = {
    createTrip: jest.fn().mockResolvedValue({ id: TRIP1, startTime: T0 }),
    reopenTripForMerge: jest.fn().mockResolvedValue(undefined),
  };

  const svc = {
    logger: { warn: jest.fn(), log: jest.fn(), debug: jest.fn(), error: jest.fn() },
    CONFIRM_MAX_WAIT_MS: 180_000,
    BACKFILL_MS: 60_000,
    tripStartBoundaryMaxLookbackMs: 180_000,
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    getOrCreateDetectionState: jest.fn().mockResolvedValue({
      vehicleId: VEHICLE,
      organizationId: ORG,
      state: TripDetectionState.POSSIBLE_START,
      detectionProfile: VehicleDetectionProfile.ICE,
      possibleStartAt: T0,
      possibleStartEnteredAt: T0_ENTERED,
      activeTripId: null,
      lastEvidenceSummary: {},
    }),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    logTrackingRun: jest.fn().mockResolvedValue(undefined),
    scheduleActiveTick,
    schedulePossibleStart: jest.fn(),
    transitionState,
    decisionEngine,
    batteryTripStartProducer: { enqueueStartProxy: jest.fn().mockResolvedValue('job') },
    fetchAndStoreStartTemperature: jest.fn().mockReturnValue(Promise.resolve()),
    fetchAndStoreInitialRoute: jest.fn().mockReturnValue(Promise.resolve()),
    segments: {
      fetchRawTripCoreData: jest.fn().mockResolvedValue([
        { timestamp: T0, speedKmh: 10 },
      ]),
    },
    prisma: {
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue({
          isIgnitionOn: true,
          speedKmh: 10,
          updatedAt: T0,
        }),
      },
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    policyResolver: {
      resolve: jest.fn().mockReturnValue({
        detectors: ['StartConfirmationDetector'],
        timeoutMs: 5000,
      }),
    },
    detectorRegistry: {
      runAll: jest.fn().mockResolvedValue([
        {
          detectorName: 'StartConfirmationDetector',
          verdict: 'TRIGGERED',
          confidence: 'HIGH',
          evidence: { mode: 'IGNITION_PRIMARY', summary: { confirmed: true } },
        },
      ]),
    },
    hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(false),
    resolveConfirmedStartBoundary: jest.fn().mockResolvedValue({
      startAt: T0,
      source: 'core',
      adjustedMs: 0,
      dimoSegmentId: `v2-${VEHICLE}-${T0.getTime()}`,
    }),
    tripMetrics: {
      tripEvidencePaths: throwingStartConfirmationMetric(),
      tripStartsConfirmed: { inc: jest.fn() },
      tripStartRecognitionLatency: { observe: jest.fn() },
      tripStartBoundaryAdjustment: { observe: jest.fn() },
    },
    logTripStartTimeline: jest.fn(),
    dimoProviderContext: jest.fn().mockReturnValue({}),
    ...overrides,
  };

  return {
    svc,
    scheduleActiveTick,
    transitionState,
    decisionEngine,
  };
}

function buildChContinuityHarness(options: {
  keepTripOpen: boolean;
  metrics?: Record<string, unknown>;
}) {
  const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
  const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
  const transitionState = jest.fn().mockResolvedValue({});
  const activityEvidence = options.keepTripOpen
    ? { pointCount: 4, maxSpeedKmh: 18, odometerDeltaKm: 0.12 }
    : { pointCount: 1, maxSpeedKmh: 0, odometerDeltaKm: 0 };

  const svc = {
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    BACKFILL_MS: 60_000,
    OVERLAP_CORE_MS: 30_000,
    OVERLAP_ROUTE_MS: 15_000,
    OVERLAP_PERF_MS: 30_000,
    TRIP_CONTINUITY_CORE_WINDOW_MS: 900_000,
    TRIP_CONTINUITY_PERF_WINDOW_MS: 900_000,
    TRACKING_INTERVAL_MS: 30_000,
    getOrCreateDetectionState: jest.fn().mockResolvedValue({
      vehicleId: VEHICLE,
      organizationId: ORG,
      state: TripDetectionState.ACTIVE_TRIP,
      detectionProfile: VehicleDetectionProfile.ICE,
      activeTripId: TRIP1,
      possibleStartAt: new Date(WORKER_NOW.getTime() - 600_000),
      lastMeaningfulMovementAt: new Date(WORKER_NOW.getTime() - 130_000),
      lastActivityAt: new Date(WORKER_NOW.getTime() - 130_000),
      lastCoreProcessedAt: new Date(WORKER_NOW.getTime() - 60_000),
      lastRouteProcessedAt: new Date(WORKER_NOW.getTime() - 60_000),
      lastDrivingProcessedAt: new Date(WORKER_NOW.getTime() - 60_000),
      lastEvidenceSummary: {},
    }),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    transitionState,
    schedulePossibleEndCheck,
    scheduleActiveTick,
    logTrackingRun: jest.fn().mockResolvedValue(undefined),
    tripMetrics: {
      tripEndCandidateLatency: { observe: jest.fn() },
      tripEvidencePaths: options.metrics?.tripEvidencePaths ?? throwingActiveContinuityMetric(),
      tripEndRecognitionLatency: { observe: jest.fn() },
      tripEndBoundaryAdjustment: { observe: jest.fn() },
      tripDuration: { observe: jest.fn() },
      tripTimingSampleRejected: { inc: jest.fn() },
    },
    segments: {
      fetchRawTripCoreData: jest.fn().mockResolvedValue([
        { timestamp: WORKER_NOW.toISOString(), speed: 0, isIgnitionOn: false },
      ]),
      fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
      fetchPerformance: jest.fn().mockResolvedValue([]),
    },
    prisma: {
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue({ updatedAt: WORKER_NOW }) },
      vehicleTrip: {
        findUnique: jest.fn().mockResolvedValue({
          id: TRIP1,
          tripStatus: TripStatus.ONGOING,
          startTime: new Date(WORKER_NOW.getTime() - 600_000),
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      vehicle: {
        findUnique: jest.fn().mockResolvedValue({ tankCapacityLiters: 50, fuelType: 'PETROL' }),
      },
      vehicleTripWaypoint: { findFirst: jest.fn().mockResolvedValue(null) },
    },
    dimoProviderContext: jest.fn().mockReturnValue({}),
    tryApplyClickHouseAssistedEnd: jest.fn().mockResolvedValue(false),
    hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(true),
    findMidTripGap: jest.fn().mockReturnValue(null),
    TRIP_MID_GAP_SPLIT_MS: 180_000,
    TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M: 200,
    TRIP_MID_GAP_MIN_PRE_DURATION_MS: 60_000,
    resolveLiveMidGapDriftEvidence: jest.fn().mockResolvedValue({
      state: 'WITHIN_THRESHOLD',
      driftM: 12,
      missingPreWaypoint: false,
      missingPostWaypoint: false,
    }),
    policyResolver: {
      resolve: jest.fn().mockReturnValue({
        detectors: ['ActivityWindowDetector'],
        timeoutMs: 5000,
      }),
    },
    detectorRegistry: {
      runAll: jest
        .fn()
        .mockResolvedValueOnce([
          {
            detectorName: 'ContinuityAssessmentDetector',
            verdict: 'TRIGGERED',
            evidence: { summary: { reason: 'stopped' } },
          },
        ])
        .mockResolvedValueOnce([
          {
            detectorName: 'ActivityWindowDetector',
            verdict: options.keepTripOpen ? 'TRIGGERED' : 'NOT_TRIGGERED',
            confidence: 'HIGH',
            evidence: activityEvidence,
          },
        ]),
    },
    decisionEngine: {
      evaluateContinuity: jest.fn().mockReturnValue({
        verdict: 'POSSIBLE_END',
        endConfidence: 'MEDIUM',
        endMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
        reason: 'stopped',
      }),
    },
    logTripEndTimeline: jest.fn(),
  };

  return { svc, transitionState, scheduleActiveTick, schedulePossibleEndCheck };
}

describe('R8C — start confirmation evidence metric', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('R8C.2 — CREATE path survives start_confirmation metric throw', async () => {
    const { svc, scheduleActiveTick, transitionState, decisionEngine } =
      buildPossibleStartHarness();

    await TripDetectionOrchestrationService.prototype.processPossibleStart.call(
      svc as unknown as TripDetectionOrchestrationService,
      {
        vehicleId: VEHICLE,
        organizationId: ORG,
        dimoTokenId: TOKEN,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        requestedAt: WORKER_NOW.toISOString(),
      },
    );

    expect(decisionEngine.createTrip).toHaveBeenCalledTimes(1);
    expect(decisionEngine.reopenTripForMerge).not.toHaveBeenCalled();
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.any(Object),
    );
    expect(scheduleActiveTick).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
    expect(transitionState).not.toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect((svc as any).logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Trip observability'),
    );
  });

  it('R8C.3 — MERGE path survives start_confirmation metric throw', async () => {
    const { svc, scheduleActiveTick, transitionState, decisionEngine } =
      buildPossibleStartHarness({
        prisma: {
          vehicleLatestState: {
            findUnique: jest.fn().mockResolvedValue({
              isIgnitionOn: true,
              speedKmh: 10,
              updatedAt: T0,
            }),
          },
          vehicleTrip: {
            findFirst: jest.fn().mockResolvedValue({
              id: TRIP_MERGE,
              endTime: new Date(T0.getTime() - 120_000),
            }),
          },
        },
      });
    jest.spyOn(tripEvidence, 'checkTripQuality').mockReturnValue({
      shouldDiscard: false,
      shouldMergeWithPrevious: true,
      reason: 'small_gap_merge',
    });

    await TripDetectionOrchestrationService.prototype.processPossibleStart.call(
      svc as unknown as TripDetectionOrchestrationService,
      {
        vehicleId: VEHICLE,
        organizationId: ORG,
        dimoTokenId: TOKEN,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        requestedAt: WORKER_NOW.toISOString(),
      },
    );

    expect(decisionEngine.reopenTripForMerge).toHaveBeenCalledTimes(1);
    expect(decisionEngine.createTrip).not.toHaveBeenCalled();
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.objectContaining({ activeTripId: TRIP_MERGE }),
    );
    expect(scheduleActiveTick).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });
});

describe('R8C — active continuity evidence metric', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('R8C.5 — keep-open guard survives active_continuity metric throw', async () => {
    const { svc, transitionState, scheduleActiveTick, schedulePossibleEndCheck } =
      buildChContinuityHarness({ keepTripOpen: true });

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      svc as unknown as TripDetectionOrchestrationService,
      {
        vehicleId: VEHICLE,
        organizationId: ORG,
        dimoTokenId: TOKEN,
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        requestedAt: WORKER_NOW.toISOString(),
      },
    );

    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.any(Object),
    );
    expect(scheduleActiveTick).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
    expect(schedulePossibleEndCheck).not.toHaveBeenCalled();
  });

  it('R8C.6 — POSSIBLE_END continuity survives active_continuity metric throw', async () => {
    const { svc, transitionState, schedulePossibleEndCheck } = buildChContinuityHarness({
      keepTripOpen: false,
    });

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      svc as unknown as TripDetectionOrchestrationService,
      {
        vehicleId: VEHICLE,
        organizationId: ORG,
        dimoTokenId: TOKEN,
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        requestedAt: WORKER_NOW.toISOString(),
      },
    );

    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.any(Object),
    );
    expect(schedulePossibleEndCheck).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });
});

describe('R8C — max-attempt gauge', () => {
  const PEC_NOW = new Date('2026-09-06T12:00:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: PEC_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('R8C.8 — possibleEndStuck.set throw still schedules FINALIZE', async () => {
    const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
    const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
    const transitionState = jest.fn().mockResolvedValue({});
    const svc = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      TRIP_END_TIMEOUT_MS: 1_800_000,
      TRIP_END_STABILITY_WINDOW_MS: 90_000,
      TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS: 120_000,
      TRIP_END_VALIDATION_MAX_ATTEMPTS: 3,
      getOrCreateDetectionState: jest.fn().mockResolvedValue({
        vehicleId: VEHICLE,
        organizationId: ORG,
        state: TripDetectionState.POSSIBLE_END,
        detectionProfile: VehicleDetectionProfile.ICE,
        activeTripId: TRIP1,
        possibleEndAt: new Date(PEC_NOW.getTime() - 130_000),
        possibleEndEnteredAt: new Date(PEC_NOW.getTime() - 200_000),
        lastMeaningfulMovementAt: new Date(PEC_NOW.getTime() - 130_000),
        lastActivityAt: new Date(PEC_NOW.getTime() - 130_000),
        endValidationAttempts: 3,
        lastEvidenceSummary: {},
      }),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      transitionState,
      schedulePossibleEndCheck,
      scheduleEndValidation: jest.fn(),
      scheduleFinalize,
      scheduleActiveTick: jest.fn(),
      logTrackingRun: jest.fn().mockResolvedValue(undefined),
      segments: {
        fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
        fetchEndValidationWindow: jest.fn().mockResolvedValue([]),
      },
      checkDimoActivityResumed: jest.fn().mockResolvedValue(false),
      dimoProviderContext: jest.fn().mockReturnValue({}),
      tripMetrics: {
        possibleEndStuck: {
          set: jest.fn().mockImplementation(() => {
            throw new Error('gauge down');
          }),
        },
      },
      ensurePossibleEndClockDurability: jest
        .fn()
        .mockImplementation(async (_vehicleId: string, d: unknown) => d),
    };

    await TripDetectionOrchestrationService.prototype.processPossibleEndCheck.call(
      svc as unknown as TripDetectionOrchestrationService,
      {
        vehicleId: VEHICLE,
        organizationId: ORG,
        dimoTokenId: TOKEN,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK,
        requestedAt: PEC_NOW.toISOString(),
      },
    );

    expect(scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
    expect(schedulePossibleEndCheck).not.toHaveBeenCalled();
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.objectContaining({
        endConfidence: DetectionConfidence.LOW,
        lastEvidenceSummary: expect.objectContaining({
          maxAttemptFallbackReason: 'max_completed_cusum_attempts',
        }),
      }),
    );
  });
});

describe('R8C — post-critical start counters', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('R8C.15 — tripStartCandidates throw preserves POSSIBLE_START successor', async () => {
    const schedulePossibleStart = jest.fn().mockResolvedValue(undefined);
    const transitionState = jest.fn().mockResolvedValue({});
    const metrics = {
      tripStartCandidates: {
        inc: jest.fn().mockImplementation(() => {
          throw new Error('start candidate counter down');
        }),
      },
      tripStartCandidateLatency: { observe: jest.fn() },
      tripTimingSampleRejected: { inc: jest.fn() },
    };

    const svc = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      COOLDOWN_AFTER_COMPLETE_MS: 120_000,
      COOLDOWN_AFTER_DISCARD_MS: 30_000,
      COOLDOWN_AFTER_TIMEOUT_MS: 60_000,
      transitionState,
      schedulePossibleStart,
      tripMetrics: metrics,
      getOrCreateDetectionState: jest.fn().mockResolvedValue({
        vehicleId: VEHICLE,
        organizationId: ORG,
        state: TripDetectionState.RESTING,
        detectionProfile: VehicleDetectionProfile.ICE,
        updatedAt: new Date('2020-01-01T00:00:00.000Z'),
        lastEvidenceSummary: null,
      }),
      policyResolver: new TripDetectionPolicyResolver(),
      detectorRegistry: {
        runAll: jest.fn().mockResolvedValue([
          {
            detectorName: 'SnapshotEvidenceEvaluator',
            verdict: 'TRIGGERED',
            confidence: 'HIGH',
            evidence: {
              strong: 2,
              weak: 0,
              hasMovement: true,
              reasons: ['ignition ON'],
              mode: 'ignition_primary',
            },
          },
        ]),
      },
      decisionEngine: {
        evaluateStartCandidate: jest.fn().mockReturnValue({
          shouldStart: true,
          confidence: 'HIGH',
          mode: 'ignition_primary',
          reason: 'movement',
        }),
      },
    };

    const result =
      await TripDetectionOrchestrationService.prototype.evaluateSnapshotForTripStart.call(
        svc as unknown as TripDetectionOrchestrationService,
        VEHICLE,
        TOKEN,
        null,
        {
          isIgnitionOn: true,
          speedKmh: 10,
          engineLoad: 20,
          latitude: 48.1,
          longitude: 11.5,
          odometerKm: 100,
          fuelLevelAbsolute: null,
          evSoc: null,
          tractionBatteryPowerKw: null,
          sourceTimestamp: T0,
        },
      );

    expect(result.shouldStartTracking).toBe(true);
    expect(schedulePossibleStart).toHaveBeenCalled();
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_START,
      expect.any(Object),
    );
  });

  it('R8C.15 — tripStartsConfirmed throw preserves ACTIVE successor', async () => {
    const { svc, scheduleActiveTick, transitionState } = buildPossibleStartHarness({
      tripMetrics: {
        tripEvidencePaths: { inc: jest.fn() },
        tripStartsConfirmed: {
          inc: jest.fn().mockImplementation(() => {
            throw new Error('starts confirmed counter down');
          }),
        },
        tripStartRecognitionLatency: { observe: jest.fn() },
        tripStartBoundaryAdjustment: { observe: jest.fn() },
      },
    });

    await TripDetectionOrchestrationService.prototype.processPossibleStart.call(
      svc as unknown as TripDetectionOrchestrationService,
      {
        vehicleId: VEHICLE,
        organizationId: ORG,
        dimoTokenId: TOKEN,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        requestedAt: WORKER_NOW.toISOString(),
      },
    );

    expect(scheduleActiveTick).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.any(Object),
    );
  });
});

describe('R8C.11 — mid_gap_split metric non-blocking', () => {
  it('post-commit mid_gap_split metric throw does not trigger false recovery', async () => {
    const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
    const splitTripAtGap = jest.fn().mockResolvedValue({
      firstTripId: 'trip-1',
      secondTripId: 'trip-2',
      movedWaypoints: 0,
    });
    const logTrackingRun = jest.fn().mockResolvedValue(undefined);
    const GAP_END = new Date('2026-09-06T12:03:10.000Z');
    const GAP_START = new Date('2026-09-06T12:00:00.000Z');

    const svc = {
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      BACKFILL_MS: 60_000,
      OVERLAP_CORE_MS: 30_000,
      OVERLAP_ROUTE_MS: 15_000,
      OVERLAP_PERF_MS: 30_000,
      TRIP_MID_GAP_SPLIT_MS: 180_000,
      TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M: 200,
      TRIP_MID_GAP_MIN_PRE_DURATION_MS: 60_000,
      getOrCreateDetectionState: jest.fn().mockResolvedValue({
        vehicleId: VEHICLE,
        organizationId: ORG,
        state: TripDetectionState.ACTIVE_TRIP,
        detectionProfile: VehicleDetectionProfile.ICE,
        activeTripId: 'trip-1',
        possibleStartAt: new Date(GAP_START.getTime() - 120_000),
        lastMeaningfulMovementAt: GAP_START,
        lastActivityAt: GAP_START,
        lastCoreProcessedAt: GAP_START,
        lastRouteProcessedAt: GAP_START,
        lastDrivingProcessedAt: GAP_START,
      }),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      findMidTripGap: jest.fn().mockReturnValue({
        gapMs: 190_000,
        firstEndAt: GAP_START,
        secondStartAt: GAP_END,
      }),
      resolveLiveMidGapDriftEvidence: jest.fn().mockResolvedValue({
        state: 'WITHIN_THRESHOLD',
        driftM: 12,
      }),
      decisionEngine: { splitTripAtGap },
      transitionState: jest.fn().mockResolvedValue({}),
      scheduleActiveTick,
      postFinalizeAnalysisProducer: {
        produceAfterPersistedCompletion: jest.fn().mockResolvedValue(undefined),
      },
      enrichmentOrchestrator: {
        enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined),
      },
      logTrackingRun,
      tripMetrics: {
        tripEvidencePaths: {
          inc: jest.fn().mockImplementation(({ phase }: { phase: string }) => {
            if (phase === 'mid_gap_split') throw new Error('mid gap metric down');
          }),
        },
      },
      segments: {
        fetchRawTripCoreData: jest.fn().mockResolvedValue([
          { timestamp: GAP_END.toISOString(), speed: 10, isIgnitionOn: true },
        ]),
        fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
        fetchPerformance: jest.fn().mockResolvedValue([]),
      },
      prisma: {
        vehicleTripWaypoint: {
          findFirst: jest.fn().mockResolvedValue({ latitude: 52.5, longitude: 13.4 }),
        },
        vehicleTrip: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'trip-1',
            tripStatus: TripStatus.ONGOING,
            startTime: new Date(GAP_START.getTime() - 120_000),
            endTime: null,
            rawDetectionMeta: {},
          }),
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'trip-1',
              tripStatus: TripStatus.ONGOING,
              startTime: new Date(GAP_START.getTime() - 120_000),
              endTime: null,
              rawDetectionMeta: {},
            },
          ]),
          update: jest.fn().mockResolvedValue({}),
        },
        vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
      },
      dimoProviderContext: jest.fn().mockReturnValue({}),
      tryApplyClickHouseAssistedEnd: jest.fn().mockResolvedValue(false),
      hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(false),
      policyResolver: {
        resolve: jest.fn().mockReturnValue({ detectors: [], timeoutMs: 1000 }),
      },
      detectorRegistry: { runAll: jest.fn().mockResolvedValue([]) },
      decisionEngineContinuity: {
        evaluateContinuity: jest.fn().mockReturnValue({ verdict: 'ACTIVE' }),
      },
    };
    (svc as any).decisionEngine.evaluateContinuity =
      (svc as any).decisionEngineContinuity.evaluateContinuity;

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      svc as unknown as TripDetectionOrchestrationService,
      {
        vehicleId: VEHICLE,
        organizationId: ORG,
        dimoTokenId: TOKEN,
        trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
        requestedAt: GAP_END.toISOString(),
      },
    );

    expect(splitTripAtGap).toHaveBeenCalled();
    expect(scheduleActiveTick).toHaveBeenCalledTimes(1);
    expect(logTrackingRun).toHaveBeenCalled();
    expect((svc as any).logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Trip observability'),
    );
  });
});

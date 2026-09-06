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
import { runTripObservabilitySafely } from './trip-fsm-observability-safe.util';

const VEHICLE = 'veh-r8a';
const ORG = 'org-r8a';
const TOKEN = 108;
const TRIP1 = 'trip-r8a-1';
const WORKER_NOW = new Date('2026-09-06T15:00:00.000Z');

function activeTickJob(): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    dimoTokenId: TOKEN,
    trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
    requestedAt: WORKER_NOW.toISOString(),
  };
}

function finalizeJob(): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    dimoTokenId: TOKEN,
    trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
    requestedAt: WORKER_NOW.toISOString(),
  };
}

function attachObservabilitySafe(svc: Record<string, unknown>) {
  const logger = svc.logger as { warn: (msg: string) => void };
  (svc as any).runObservabilitySafely = (name: string, fn: () => void) =>
    runTripObservabilitySafely(logger, name, fn);
  return svc;
}

function throwingMetrics() {
  const throwErr = () => {
    throw new Error('prometheus down');
  };
  return {
    tripEndCandidateLatency: { observe: jest.fn(throwErr) },
    tripEvidencePaths: { inc: jest.fn(throwErr) },
    tripStartCandidateLatency: { observe: jest.fn(throwErr) },
    tripStartRecognitionLatency: { observe: jest.fn(throwErr) },
    tripStartBoundaryAdjustment: { observe: jest.fn(throwErr) },
    tripEndRecognitionLatency: { observe: jest.fn(throwErr) },
    tripEndBoundaryAdjustment: { observe: jest.fn(throwErr) },
    tripDuration: { observe: jest.fn(throwErr) },
    tripFinalizeLatency: { observe: jest.fn(throwErr) },
    tripEndLatencyFromMovement: { observe: jest.fn(throwErr) },
    tripTimingSampleRejected: { inc: jest.fn() },
    tripFinalized: { inc: jest.fn() },
    tripContinuity: { inc: jest.fn() },
  };
}

function buildEmptyCoreHarness() {
  const movementAt = new Date(WORKER_NOW.getTime() - 150_000);
  const det = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.ACTIVE_TRIP,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: TRIP1,
    possibleStartAt: new Date(WORKER_NOW.getTime() - 600_000),
    lastMeaningfulMovementAt: movementAt,
    lastActivityAt: movementAt,
    lastCoreProcessedAt: movementAt,
    lastRouteProcessedAt: movementAt,
    lastDrivingProcessedAt: movementAt,
    lastEvidenceSummary: {},
  };
  const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
  const transitionState = jest.fn().mockResolvedValue({});
  const svc = {
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    BACKFILL_MS: 60_000,
    OVERLAP_CORE_MS: 30_000,
    OVERLAP_ROUTE_MS: 15_000,
    OVERLAP_PERF_MS: 30_000,
    TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS: 120_000,
    TRIP_CONTINUITY_CORE_WINDOW_MS: 120_000,
    TRIP_CONTINUITY_PERF_WINDOW_MS: 120_000,
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    transitionState,
    schedulePossibleEndCheck,
    scheduleActiveTick: jest.fn().mockResolvedValue(undefined),
    logTrackingRun: jest.fn().mockResolvedValue(undefined),
    tripMetrics: throwingMetrics(),
    segments: {
      fetchRawTripCoreData: jest.fn().mockResolvedValue([]),
      fetchRouteEnrichment: jest.fn().mockResolvedValue([
        { latitude: 1, longitude: 2, speedKmh: 0, timestamp: WORKER_NOW.toISOString() },
      ]),
      fetchPerformance: jest.fn().mockResolvedValue([]),
    },
    prisma: {
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue({
          isIgnitionOn: false,
          speedKmh: 0,
          engineLoad: 0,
          sourceTimestamp: WORKER_NOW,
          updatedAt: WORKER_NOW,
        }),
      },
    },
    dimoProviderContext: jest.fn().mockReturnValue({}),
    tryApplyClickHouseAssistedEnd: jest.fn().mockResolvedValue(false),
  };

  return { svc: attachObservabilitySafe(svc), schedulePossibleEndCheck, transitionState };
}

function buildContinuityHarness() {
  const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
  const transitionState = jest.fn().mockResolvedValue({});
  const det = {
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
  };

  const svc = {
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
    BACKFILL_MS: 60_000,
    OVERLAP_CORE_MS: 30_000,
    OVERLAP_ROUTE_MS: 15_000,
    OVERLAP_PERF_MS: 30_000,
    TRIP_CONTINUITY_CORE_WINDOW_MS: 900_000,
    TRIP_CONTINUITY_PERF_WINDOW_MS: 900_000,
    TRACKING_INTERVAL_MS: 30_000,
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    transitionState,
    schedulePossibleEndCheck,
    scheduleActiveTick: jest.fn().mockResolvedValue(undefined),
    logTrackingRun: jest.fn().mockResolvedValue(undefined),
    tripMetrics: throwingMetrics(),
    segments: {
      fetchRawTripCoreData: jest.fn().mockResolvedValue([
        { timestamp: WORKER_NOW.toISOString(), speed: 0, isIgnitionOn: false },
      ]),
      fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
      fetchPerformance: jest.fn().mockResolvedValue([]),
    },
    prisma: {
      vehicleLatestState: { findUnique: jest.fn().mockResolvedValue(null) },
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
    hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(false),
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
        detectors: ['ContinuityAssessmentDetector'],
        timeoutMs: 5000,
      }),
    },
    detectorRegistry: {
      runAll: jest.fn().mockResolvedValue([
        {
          detectorName: 'ContinuityAssessmentDetector',
          verdict: 'TRIGGERED',
          evidence: { summary: { reason: 'stopped' } },
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
  };

  return { svc: attachObservabilitySafe(svc), schedulePossibleEndCheck, transitionState };
}

describe('R8A — observability failure containment', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('EMPTY_CORE — metric/timeline failures still schedule PEC', async () => {
    const h = buildEmptyCoreHarness();

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      activeTickJob(),
    );

    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.any(Object),
    );
    expect(h.schedulePossibleEndCheck).toHaveBeenCalledWith(
      VEHICLE,
      ORG,
      TOKEN,
      0,
    );
    expect((h.svc as any).logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Trip observability'),
    );
  });

  it('EMPTY_CORE — timeline logger failure still schedules PEC', async () => {
    const h = buildEmptyCoreHarness();
    (h.svc as any).logger.log.mockImplementation((msg: string) => {
      if (String(msg).includes('TRIP_END_TIMELINE')) {
        throw new Error('timeline logger down');
      }
    });

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      activeTickJob(),
    );

    expect(h.schedulePossibleEndCheck).toHaveBeenCalledWith(
      VEHICLE,
      ORG,
      TOKEN,
      0,
    );
  });

  it('CONTINUITY — observability failures still schedule PEC', async () => {
    const h = buildContinuityHarness();

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      activeTickJob(),
    );

    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_END,
      expect.any(Object),
    );
    expect(h.schedulePossibleEndCheck).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });

  it('CLICKHOUSE HIGH — metric failure preserves FINALIZE scheduling', async () => {
    const endAt = new Date(WORKER_NOW.getTime() - 60_000);
    const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
    const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
    const transitionState = jest.fn().mockResolvedValue({});
    const checkDimoActivityResumed = jest.fn().mockResolvedValue(false);

    jest.spyOn(tripEvidence, 'resolveAnalyticsAssistedEndDecision').mockReturnValue({
      confirmed: true,
      detectedEndAt: endAt,
      confidence: 'HIGH',
      evidencePath: 'CLICKHOUSE_ONLY',
      summary: { reason: 'stationary' },
    } as any);

    const svc = attachObservabilitySafe({
      logger: { log: jest.fn(), warn: jest.fn() },
      TRIP_END_CH_ASSIST_MIN_STATIONARY_MS: 30_000,
      TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS: 60_000,
      TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS: 120_000,
      hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(true),
      policyResolver: { resolve: jest.fn().mockReturnValue({ detectors: [], timeoutMs: 1000 }) },
      detectorRegistry: {
        runAll: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockReturnValue({}),
      },
      resolveContinuityFindingForEndAssist: jest.fn().mockResolvedValue(undefined),
      checkDimoActivityResumed,
      transitionState,
      scheduleFinalize,
      schedulePossibleEndCheck,
      tripMetrics: throwingMetrics(),
    });

    const result = await (
      TripDetectionOrchestrationService.prototype as any
    ).tryApplyClickHouseAssistedEnd.call(svc, {
      vehicleId: VEHICLE,
      organizationId: ORG,
      dimoTokenId: TOKEN,
      tripId: TRIP1,
      det: {
        state: TripDetectionState.ACTIVE_TRIP,
        detectionProfile: VehicleDetectionProfile.ICE,
      },
      profile: 'ICE',
      tripStartAt: new Date(WORKER_NOW.getTime() - 600_000),
      now: WORKER_NOW,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 0,
        updatedAt: WORKER_NOW,
      },
      corePoints: [],
    });

    expect(result).toBe(true);
    expect(scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
    expect(schedulePossibleEndCheck).not.toHaveBeenCalled();
    expect((svc as any).logger.warn).toHaveBeenCalled();
  });

  it('CLICKHOUSE MEDIUM — metric failure preserves PEC scheduling', async () => {
    const endAt = new Date(WORKER_NOW.getTime() - 60_000);
    const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
    const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
    const transitionState = jest.fn().mockResolvedValue({});

    jest.spyOn(tripEvidence, 'resolveAnalyticsAssistedEndDecision').mockReturnValue({
      confirmed: true,
      detectedEndAt: endAt,
      confidence: 'MEDIUM',
      evidencePath: 'DIMO_PLUS_CLICKHOUSE',
      summary: { reason: 'stationary' },
    } as any);

    const svc = attachObservabilitySafe({
      logger: { log: jest.fn(), warn: jest.fn() },
      TRIP_END_CH_ASSIST_MIN_STATIONARY_MS: 30_000,
      TRIP_END_CH_ASSIST_MIN_TRIP_DURATION_MS: 60_000,
      TRIP_END_CH_ASSIST_HIGH_STATIONARY_MS: 120_000,
      hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(true),
      policyResolver: { resolve: jest.fn().mockReturnValue({ detectors: [], timeoutMs: 1000 }) },
      detectorRegistry: {
        runAll: jest.fn().mockResolvedValue([]),
        get: jest.fn().mockReturnValue({}),
      },
      resolveContinuityFindingForEndAssist: jest.fn().mockResolvedValue(undefined),
      checkDimoActivityResumed: jest.fn().mockResolvedValue(false),
      transitionState,
      scheduleFinalize,
      schedulePossibleEndCheck,
      tripMetrics: throwingMetrics(),
    });

    const result = await (
      TripDetectionOrchestrationService.prototype as any
    ).tryApplyClickHouseAssistedEnd.call(svc, {
      vehicleId: VEHICLE,
      organizationId: ORG,
      dimoTokenId: TOKEN,
      tripId: TRIP1,
      det: {
        state: TripDetectionState.ACTIVE_TRIP,
        detectionProfile: VehicleDetectionProfile.ICE,
      },
      profile: 'ICE',
      tripStartAt: new Date(WORKER_NOW.getTime() - 600_000),
      now: WORKER_NOW,
      telemetry: {
        isIgnitionOn: false,
        speedKmh: 0,
        engineLoad: 0,
        updatedAt: WORKER_NOW,
      },
      corePoints: [],
    });

    expect(result).toBe(true);
    expect(schedulePossibleEndCheck).toHaveBeenCalledWith(
      VEHICLE,
      ORG,
      TOKEN,
      0,
    );
    expect(scheduleFinalize).not.toHaveBeenCalled();
  });
});

describe('R8A — finalize start forensic provenance orchestration', () => {
  const candidateAt = new Date('2026-09-06T14:00:00.000Z');
  const candidateEnteredAt = new Date('2026-09-06T14:00:20.000Z');
  const canonicalStartAt = new Date('2026-09-06T13:59:50.000Z');
  const startRecognizedAt = new Date('2026-09-06T14:00:35.000Z');
  const endTime = new Date('2026-09-06T14:58:00.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('perserves refined start episode in tripFsmForensics and flat fields', async () => {
    const finalizeTrip = jest.fn().mockResolvedValue({});
    const det = {
      vehicleId: VEHICLE,
      organizationId: ORG,
      state: TripDetectionState.POSSIBLE_END,
      detectionProfile: VehicleDetectionProfile.ICE,
      activeTripId: TRIP1,
      possibleEndAt: endTime,
      possibleEndEnteredAt: new Date(WORKER_NOW.getTime() - 100_000),
      possibleStartAt: canonicalStartAt,
      possibleStartEnteredAt: null,
      lastActivityAt: endTime,
      lastMeaningfulMovementAt: endTime,
      endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
      endConfidence: DetectionConfidence.MEDIUM,
      endValidationAttempts: 1,
      cusumSegmentEnd: endTime,
      lastEvidenceSummary: {
        startCandidateAt: candidateAt.toISOString(),
        startCandidateEnteredAt: candidateEnteredAt.toISOString(),
        startRecognizedAt: startRecognizedAt.toISOString(),
        startBoundaryAdjustedMs: -10_000,
        confirmedStartSource: 'core_refined',
        startEvidencePath: 'DIMO_ONLY',
      },
    };
    const trip = {
      id: TRIP1,
      startTime: canonicalStartAt,
      distanceKm: 5,
      tripStatus: TripStatus.ONGOING,
      endTime: null,
      rawDetectionMeta: { lifecycleRecovery: { preserved: true } },
    };
    const svc = {
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      prisma: {
        vehicleTrip: { findUnique: jest.fn().mockResolvedValue(trip) },
        vehicleTripWaypoint: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(5),
        },
        vehicleTripTrackingRun: { create: jest.fn().mockResolvedValue({}) },
      },
      decisionEngine: { finalizeTrip, discardTrip: jest.fn() },
      tripMetrics: {
        tripFinalized: { inc: jest.fn() },
        tripFinalizeLatency: { observe: jest.fn() },
        tripEndLatencyFromMovement: { observe: jest.fn() },
        tripDuration: { observe: jest.fn() },
        tripEndRecognitionLatency: { observe: jest.fn() },
        tripEndBoundaryAdjustment: { observe: jest.fn() },
        tripEvidencePaths: { inc: jest.fn() },
        tripTimingSampleRejected: { inc: jest.fn() },
      },
      transitionState: jest.fn().mockResolvedValue({}),
      scheduleFinalize: jest.fn(),
      postFinalizeAnalysisProducer: {
        produceAfterPersistedCompletion: jest.fn().mockResolvedValue(undefined),
      },
      enrichmentOrchestrator: {
        enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined),
      },
      batteryLvRestSessionProducer: {
        enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue(undefined),
      },
      logTrackingRun: jest.fn().mockResolvedValue(undefined),
      parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
    };

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      attachObservabilitySafe(svc) as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    const meta = finalizeTrip.mock.calls[0][1].rawDetectionMeta as Record<string, unknown>;
    const forensics = meta.tripFsmForensics as any;
    expect(forensics.start.candidateAt).toBe(candidateAt.toISOString());
    expect(forensics.start.candidateEnteredAt).toBe(candidateEnteredAt.toISOString());
    expect(forensics.start.recognizedAt).toBe(startRecognizedAt.toISOString());
    expect(forensics.start.canonicalBoundaryAt).toBe(canonicalStartAt.toISOString());
    expect(forensics.start.boundaryAdjustmentMs).toBe(-10_000);
    expect(meta.startCandidateAt).toBe(candidateAt.toISOString());
    expect(meta.startBoundaryAdjustedMs).toBe(-10_000);
    expect((meta.lifecycleRecovery as any).preserved).toBe(true);
  });

  it('FINALIZE metric/timeline failures still reach RESTING without orphan recovery', async () => {
    const finalizeTrip = jest.fn().mockResolvedValue({});
    const transitionState = jest.fn().mockResolvedValue({});
    const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
    const det = {
      vehicleId: VEHICLE,
      organizationId: ORG,
      state: TripDetectionState.POSSIBLE_END,
      detectionProfile: VehicleDetectionProfile.ICE,
      activeTripId: TRIP1,
      possibleEndAt: endTime,
      possibleEndEnteredAt: new Date(WORKER_NOW.getTime() - 100_000),
      possibleStartAt: canonicalStartAt,
      lastActivityAt: endTime,
      lastMeaningfulMovementAt: endTime,
      endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
      endConfidence: DetectionConfidence.MEDIUM,
      endValidationAttempts: 1,
      cusumSegmentEnd: endTime,
      lastEvidenceSummary: {},
    };
    const svc = {
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      prisma: {
        vehicleTrip: {
          findUnique: jest.fn().mockResolvedValue({
            id: TRIP1,
            startTime: canonicalStartAt,
            distanceKm: 5,
            tripStatus: TripStatus.ONGOING,
            endTime: null,
            rawDetectionMeta: {},
          }),
        },
        vehicleTripWaypoint: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(5),
        },
        vehicleTripTrackingRun: { create: jest.fn().mockResolvedValue({}) },
      },
      decisionEngine: { finalizeTrip, discardTrip: jest.fn() },
      tripMetrics: throwingMetrics(),
      transitionState,
      scheduleFinalize,
      postFinalizeAnalysisProducer: {
        produceAfterPersistedCompletion: jest.fn().mockResolvedValue(undefined),
      },
      enrichmentOrchestrator: {
        enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined),
      },
      batteryLvRestSessionProducer: {
        enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue(undefined),
      },
      logTrackingRun: jest.fn().mockResolvedValue(undefined),
      parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
      logTripEndTimeline: jest.fn(),
    };

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      attachObservabilitySafe(svc) as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(finalizeTrip).toHaveBeenCalled();
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect(scheduleFinalize).not.toHaveBeenCalled();
  });

  it('R7A durable recognition metric failure still schedules recovery wake', async () => {
    const END_TIME = endTime;
    const finalizeTrip = jest.fn().mockRejectedValue(new Error('logger poison'));
    const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
    const transitionState = jest.fn().mockResolvedValue({});
    let findCalls = 0;
    const findUnique = jest.fn().mockImplementation(() => {
      findCalls += 1;
      if (findCalls === 1) {
        return Promise.resolve({
          id: TRIP1,
          startTime: canonicalStartAt,
          distanceKm: 5,
          tripStatus: TripStatus.ONGOING,
          endTime: null,
          rawDetectionMeta: { endRecognizedAt: WORKER_NOW.toISOString() },
        });
      }
      return Promise.resolve({
        id: TRIP1,
        tripStatus: TripStatus.COMPLETED,
        endTime: END_TIME,
        startTime: canonicalStartAt,
        rawDetectionMeta: { endRecognizedAt: WORKER_NOW.toISOString() },
      });
    });
    const det = {
      vehicleId: VEHICLE,
      organizationId: ORG,
      state: TripDetectionState.POSSIBLE_END,
      detectionProfile: VehicleDetectionProfile.ICE,
      activeTripId: TRIP1,
      possibleEndAt: END_TIME,
      possibleStartAt: canonicalStartAt,
      lastActivityAt: END_TIME,
      lastMeaningfulMovementAt: END_TIME,
      endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
      endConfidence: DetectionConfidence.MEDIUM,
      endValidationAttempts: 1,
      cusumSegmentEnd: END_TIME,
      lastEvidenceSummary: {},
    };
    const svc = {
      logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
      getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      prisma: {
        vehicleTrip: { findUnique },
        vehicleTripWaypoint: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(5),
        },
        vehicleTripTrackingRun: { create: jest.fn().mockResolvedValue({}) },
      },
      decisionEngine: { finalizeTrip, discardTrip: jest.fn() },
      tripMetrics: {
        ...throwingMetrics(),
        tripEndRecognitionLatency: {
          observe: jest.fn().mockImplementation(() => {
            throw new Error('durable metric down');
          }),
        },
      },
      transitionState,
      scheduleFinalize,
      postFinalizeAnalysisProducer: {
        produceAfterPersistedCompletion: jest.fn().mockResolvedValue(undefined),
      },
      enrichmentOrchestrator: {
        enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined),
      },
      batteryLvRestSessionProducer: {
        enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue(undefined),
      },
      logTrackingRun: jest.fn().mockResolvedValue(undefined),
      parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
      logTripEndTimeline: jest.fn(),
    };

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      attachObservabilitySafe(svc) as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });
});

describe('R8A — start liveness observability', () => {
  const T0 = new Date('2026-09-06T10:00:00.000Z');
  const T0_ENTERED = new Date('2026-09-06T10:00:01.000Z');

  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-06T10:00:30.000Z') });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('POSSIBLE_START live path schedules successor before throwing start candidate metric', async () => {
    const schedulePossibleStart = jest.fn().mockResolvedValue(undefined);
    const transitionState = jest.fn().mockResolvedValue({});
    const order: string[] = [];
    schedulePossibleStart.mockImplementation(async () => {
      order.push('possible_start');
    });
    const metrics = throwingMetrics();
    metrics.tripStartCandidateLatency.observe.mockImplementation(() => {
      order.push('metric');
      throw new Error('prometheus down');
    });

    const runAll = jest.fn().mockResolvedValue([
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
    ]);

    const svc = attachObservabilitySafe({
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
      COOLDOWN_AFTER_COMPLETE_MS: 120_000,
      COOLDOWN_AFTER_DISCARD_MS: 30_000,
      COOLDOWN_AFTER_TIMEOUT_MS: 60_000,
      transitionState,
      schedulePossibleStart,
      tripMetrics: {
        ...metrics,
        tripStartCandidates: { inc: jest.fn() },
      },
      getOrCreateDetectionState: jest.fn().mockResolvedValue({
        vehicleId: VEHICLE,
        organizationId: ORG,
        state: TripDetectionState.RESTING,
        detectionProfile: VehicleDetectionProfile.ICE,
        updatedAt: new Date('2020-01-01T00:00:00.000Z'),
        lastEvidenceSummary: null,
      }),
      policyResolver: new TripDetectionPolicyResolver(),
      detectorRegistry: { runAll },
      decisionEngine: {
        evaluateStartCandidate: jest.fn().mockReturnValue({
          shouldStart: true,
          confidence: 'HIGH',
          mode: 'ignition_primary',
          reason: 'movement',
        }),
      },
    });

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

    expect(schedulePossibleStart).toHaveBeenCalled();
    expect(order.indexOf('possible_start')).toBeLessThan(order.indexOf('metric'));
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_START,
      expect.any(Object),
    );
  });

  it('ACTIVE confirmation schedules ACTIVE_TICK when start recognition metric throws', async () => {
    const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
    const transitionState = jest.fn().mockResolvedValue({});
    const svc = attachObservabilitySafe({
      logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn() },
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
      decisionEngine: {
        createTrip: jest.fn().mockResolvedValue({ id: TRIP1, startTime: T0 }),
        reopenTripForMerge: jest.fn(),
      },
      batteryTripStartProducer: { enqueueStartProxy: jest.fn().mockResolvedValue('job') },
      fetchAndStoreStartTemperature: jest.fn().mockReturnValue(Promise.resolve()),
      fetchAndStoreInitialRoute: jest.fn().mockReturnValue(Promise.resolve()),
      segments: {
        fetchRawTripCoreData: jest.fn().mockResolvedValue([
          { timestamp: T0, speedKmh: 10 },
        ]),
      },
      prisma: {
        vehicleLatestState: { findUnique: jest.fn().mockResolvedValue({ speedKmh: 10 }) },
        vehicleTrip: { findFirst: jest.fn().mockResolvedValue(null) },
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
      resolveConfirmedStartBoundary: jest.fn().mockResolvedValue({
        startAt: T0,
        source: 'core',
        adjustedMs: 0,
      }),
      tripMetrics: {
        ...throwingMetrics(),
        tripStartsConfirmed: { inc: jest.fn() },
        tripEvidencePaths: { inc: jest.fn() },
      },
      dimoProviderContext: jest.fn().mockReturnValue({}),
      hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(false),
      logTripStartTimeline: jest.fn(),
    });

    await TripDetectionOrchestrationService.prototype.processPossibleStart.call(
      svc as unknown as TripDetectionOrchestrationService,
      {
        vehicleId: VEHICLE,
        organizationId: ORG,
        dimoTokenId: TOKEN,
        trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
        requestedAt: new Date().toISOString(),
      },
    );

    expect(scheduleActiveTick).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.any(Object),
    );
    expect((svc as any).logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Trip observability'),
    );
  });
});

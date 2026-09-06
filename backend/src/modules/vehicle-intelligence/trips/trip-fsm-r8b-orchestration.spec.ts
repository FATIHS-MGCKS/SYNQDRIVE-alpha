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
import {
  buildMergeReopenRecoveryMeta,
  mergeLifecycleRecoveryMeta,
} from './trip-lifecycle-recovery-meta';
import { runTripObservabilitySafely } from './trip-fsm-observability-safe.util';

const VEHICLE = 'veh-r8b';
const ORG = 'org-r8b';
const TOKEN = 208;
const TRIP1 = 'trip-r8b-1';
const WORKER_NOW = new Date('2026-09-06T17:00:00.000Z');

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

function baseMetrics(overrides: Record<string, unknown> = {}) {
  return {
    tripFinalized: { inc: jest.fn() },
    tripDiscarded: { inc: jest.fn() },
    tripQualityAnomalies: { inc: jest.fn() },
    tripFinalizeLatency: { observe: jest.fn() },
    tripEndLatencyFromMovement: { observe: jest.fn() },
    tripDuration: { observe: jest.fn() },
    tripEndRecognitionLatency: { observe: jest.fn() },
    tripEndBoundaryAdjustment: { observe: jest.fn() },
    tripEvidencePaths: { inc: jest.fn() },
    tripTimingSampleRejected: { inc: jest.fn() },
    ...overrides,
  };
}

function buildFinalizeHarness(options: {
  trip: Record<string, unknown>;
  det?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  logger?: Record<string, unknown>;
  transitionState?: jest.Mock;
  scheduleFinalize?: jest.Mock;
  finalizeTrip?: jest.Mock;
  discardTrip?: jest.Mock;
}) {
  const finalizeTrip = options.finalizeTrip ?? jest.fn().mockResolvedValue({});
  const discardTrip = options.discardTrip ?? jest.fn().mockResolvedValue({});
  const transitionState = options.transitionState ?? jest.fn().mockResolvedValue({});
  const scheduleFinalize = options.scheduleFinalize ?? jest.fn().mockResolvedValue(undefined);
  const endTime = new Date('2026-09-06T16:58:00.000Z');
  const det = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_END,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: TRIP1,
    possibleEndAt: endTime,
    possibleEndEnteredAt: new Date(WORKER_NOW.getTime() - 100_000),
    possibleStartAt: new Date('2026-09-06T16:09:55.000Z'),
    possibleStartEnteredAt: null,
    lastActivityAt: endTime,
    lastMeaningfulMovementAt: endTime,
    endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
    endConfidence: DetectionConfidence.MEDIUM,
    endValidationAttempts: 1,
    cusumSegmentEnd: endTime,
    lastEvidenceSummary: {},
    ...options.det,
  };

  const svc = {
    logger: {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      ...(options.logger ?? {}),
    },
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    prisma: {
      vehicleTrip: { findUnique: jest.fn().mockResolvedValue(options.trip) },
      vehicleTripWaypoint: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(5),
      },
      vehicleTripTrackingRun: { create: jest.fn().mockResolvedValue({}) },
    },
    decisionEngine: { finalizeTrip, discardTrip },
    tripMetrics: baseMetrics(options.metrics),
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

  return {
    svc: attachObservabilitySafe(svc),
    finalizeTrip,
    discardTrip,
    transitionState,
    scheduleFinalize,
    det,
  };
}

describe('R8B — processFinalize merge/reopen forensic regression', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('R8B.6 — merge episode forensics stay separate from historical trip.startTime', async () => {
    const historicalStart = new Date('2026-09-06T10:00:00.000Z');
    const candidateAt = new Date('2026-09-06T16:10:00.000Z');
    const candidateEnteredAt = new Date('2026-09-06T16:10:15.000Z');
    const effectiveStartAt = new Date('2026-09-06T16:09:55.000Z');
    const recognizedAt = new Date('2026-09-06T16:10:40.000Z');
    const priorRaw = mergeLifecycleRecoveryMeta({}, {
      mergeReopen: buildMergeReopenRecoveryMeta({
        candidateStartAt: candidateAt,
        effectiveStartAt,
      }),
    });

    const { svc, finalizeTrip } = buildFinalizeHarness({
      trip: {
        id: TRIP1,
        startTime: historicalStart,
        distanceKm: 8,
        tripStatus: TripStatus.ONGOING,
        endTime: null,
        rawDetectionMeta: priorRaw,
      },
      det: {
        lastEvidenceSummary: {
          startCandidateAt: candidateAt.toISOString(),
          startCandidateEnteredAt: candidateEnteredAt.toISOString(),
          startRecognizedAt: recognizedAt.toISOString(),
          confirmedStartAt: effectiveStartAt.toISOString(),
          confirmedStartSource: 'merge_reopen',
          startBoundaryAdjustedMs: -5_000,
        },
      },
    });

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    const meta = finalizeTrip.mock.calls[0][1].rawDetectionMeta as Record<string, unknown>;
    const forensics = meta.tripFsmForensics as any;

    expect(finalizeTrip).toHaveBeenCalled();
    expect(forensics.start.candidateAt).toBe(candidateAt.toISOString());
    expect(forensics.start.candidateEnteredAt).toBe(candidateEnteredAt.toISOString());
    expect(forensics.start.recognizedAt).toBe(recognizedAt.toISOString());
    expect(forensics.start.canonicalBoundaryAt).toBe(effectiveStartAt.toISOString());
    expect(forensics.start.tripCanonicalStartAt).toBe(historicalStart.toISOString());
    expect(forensics.start.boundaryAdjustmentMs).toBe(-5_000);
    expect(meta.startCandidateAt).toBe(candidateAt.toISOString());
    expect(meta.startBoundaryAdjustedMs).toBe(-5_000);
    expect(forensics.start.canonicalBoundaryAt).not.toBe(historicalStart.toISOString());
  });

  it('R8B.7 — normal create forensic non-regression through processFinalize', async () => {
    const candidateAt = new Date('2026-09-06T14:00:00.000Z');
    const candidateEnteredAt = new Date('2026-09-06T14:00:20.000Z');
    const canonicalStartAt = new Date('2026-09-06T13:59:50.000Z');
    const startRecognizedAt = new Date('2026-09-06T14:00:35.000Z');

    const { svc, finalizeTrip } = buildFinalizeHarness({
      trip: {
        id: TRIP1,
        startTime: canonicalStartAt,
        distanceKm: 5,
        tripStatus: TripStatus.ONGOING,
        endTime: null,
        rawDetectionMeta: {},
      },
      det: {
        possibleStartAt: canonicalStartAt,
        lastEvidenceSummary: {
          startCandidateAt: candidateAt.toISOString(),
          startCandidateEnteredAt: candidateEnteredAt.toISOString(),
          startRecognizedAt: startRecognizedAt.toISOString(),
          confirmedStartAt: canonicalStartAt.toISOString(),
          startBoundaryAdjustedMs: -10_000,
        },
      },
    });

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    const meta = finalizeTrip.mock.calls[0][1].rawDetectionMeta as Record<string, unknown>;
    const forensics = meta.tripFsmForensics as any;
    expect(forensics.start.canonicalBoundaryAt).toBe(canonicalStartAt.toISOString());
    expect(forensics.start.boundaryAdjustmentMs).toBe(-10_000);
    expect(meta.startBoundaryAdjustedMs).toBe(-10_000);
    expect(forensics.start.tripCanonicalStartAt).toBeNull();
  });
});

describe('R8B.13 — COMPLETED terminal observability containment', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  async function runCompletedFailureCase(
    metricsOverrides: Record<string, unknown>,
    loggerOverrides: Record<string, unknown> = {},
  ) {
    const transitionState = jest.fn().mockResolvedValue({});
    const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
    const canonicalStartAt = new Date('2026-09-06T13:59:50.000Z');
    const { svc, finalizeTrip } = buildFinalizeHarness({
      trip: {
        id: TRIP1,
        startTime: canonicalStartAt,
        distanceKm: 5,
        tripStatus: TripStatus.ONGOING,
        endTime: null,
        rawDetectionMeta: {},
      },
      metrics: metricsOverrides,
      logger: loggerOverrides,
      transitionState,
      scheduleFinalize,
    });

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    return { finalizeTrip, transitionState, scheduleFinalize, svc };
  }

  it('A — tripFinalized.inc throw still reaches RESTING without recovery', async () => {
    const { finalizeTrip, transitionState, scheduleFinalize } = await runCompletedFailureCase({
      tripFinalized: {
        inc: jest.fn().mockImplementation(() => {
          throw new Error('tripFinalized down');
        }),
      },
    });

    expect(finalizeTrip).toHaveBeenCalled();
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect(scheduleFinalize).not.toHaveBeenCalled();
  });

  it('B — informational finalize logger throw still reaches RESTING', async () => {
    const { finalizeTrip, transitionState, scheduleFinalize } = await runCompletedFailureCase(
      {},
      {
        log: jest.fn().mockImplementation((msg: string) => {
          if (String(msg).includes('finalized')) {
            throw new Error('logger down');
          }
        }),
      },
    );

    expect(finalizeTrip).toHaveBeenCalled();
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect(scheduleFinalize).not.toHaveBeenCalled();
  });

  it('C — legacy tripFinalizeLatency.observe throw still reaches RESTING', async () => {
    const { transitionState, scheduleFinalize } = await runCompletedFailureCase({
      tripFinalizeLatency: {
        observe: jest.fn().mockImplementation(() => {
          throw new Error('legacy latency down');
        }),
      },
    });

    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect(scheduleFinalize).not.toHaveBeenCalled();
  });

  it('D — tripEndRecognitionLatency.observe throw still reaches RESTING', async () => {
    const { transitionState, scheduleFinalize } = await runCompletedFailureCase({
      tripEndRecognitionLatency: {
        observe: jest.fn().mockImplementation(() => {
          throw new Error('recognition metric down');
        }),
      },
    });

    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect(scheduleFinalize).not.toHaveBeenCalled();
  });

  it('E — TRIP_END_TIMELINE logger throw still reaches RESTING', async () => {
    const transitionState = jest.fn().mockResolvedValue({});
    const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
    const canonicalStartAt = new Date('2026-09-06T13:59:50.000Z');
    const { svc, finalizeTrip } = buildFinalizeHarness({
      trip: {
        id: TRIP1,
        startTime: canonicalStartAt,
        distanceKm: 5,
        tripStatus: TripStatus.ONGOING,
        endTime: null,
        rawDetectionMeta: {},
      },
      transitionState,
      scheduleFinalize,
    });
    (svc as any).logTripEndTimeline = jest.fn().mockImplementation(() => {
      throw new Error('timeline down');
    });

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
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
});

describe('R8B.14 — CANCELLED terminal observability containment', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  async function runDiscardFailureCase(
    metricsOverrides: Record<string, unknown>,
    loggerOverrides: Record<string, unknown> = {},
  ) {
    const transitionState = jest.fn().mockResolvedValue({});
    const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
    const discardTrip = jest.fn().mockResolvedValue({});
    const canonicalStartAt = new Date('2026-09-06T13:59:50.000Z');
    const endTime = new Date('2026-09-06T16:58:00.000Z');

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

    const svc = attachObservabilitySafe({
      logger: {
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        ...(loggerOverrides ?? {}),
      },
      getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      prisma: {
        vehicleTrip: {
          findUnique: jest.fn().mockResolvedValue({
            id: TRIP1,
            startTime: canonicalStartAt,
            distanceKm: 0.01,
            tripStatus: TripStatus.ONGOING,
            endTime: null,
            rawDetectionMeta: {},
          }),
        },
        vehicleTripWaypoint: {
          findFirst: jest.fn().mockResolvedValue(null),
          count: jest.fn().mockResolvedValue(0),
        },
        vehicleTripTrackingRun: { create: jest.fn().mockResolvedValue({}) },
      },
      decisionEngine: {
        finalizeTrip: jest.fn(),
        discardTrip,
      },
      tripMetrics: baseMetrics(metricsOverrides),
      transitionState,
      scheduleFinalize,
      logTrackingRun: jest.fn().mockResolvedValue(undefined),
      parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
    });

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    return { discardTrip, transitionState, scheduleFinalize };
  }

  it('A — tripDiscarded.inc throw still reaches RESTING', async () => {
    const { discardTrip, transitionState, scheduleFinalize } = await runDiscardFailureCase({
      tripDiscarded: {
        inc: jest.fn().mockImplementation(() => {
          throw new Error('tripDiscarded down');
        }),
      },
    });

    expect(discardTrip).toHaveBeenCalledTimes(1);
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect(scheduleFinalize).not.toHaveBeenCalled();
  });

  it('B — tripQualityAnomalies.inc throw still reaches RESTING', async () => {
    const { discardTrip, transitionState, scheduleFinalize } = await runDiscardFailureCase({
      tripQualityAnomalies: {
        inc: jest.fn().mockImplementation(() => {
          throw new Error('quality metric down');
        }),
      },
    });

    expect(discardTrip).toHaveBeenCalledTimes(1);
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect(scheduleFinalize).not.toHaveBeenCalled();
  });

  it('C — discard informational logger throw still reaches RESTING', async () => {
    const { discardTrip, transitionState, scheduleFinalize } = await runDiscardFailureCase(
      {},
      {
        log: jest.fn().mockImplementation((msg: string) => {
          if (String(msg).includes('discarded')) {
            throw new Error('discard logger down');
          }
        }),
      },
    );

    expect(discardTrip).toHaveBeenCalledTimes(1);
    expect(transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect(scheduleFinalize).not.toHaveBeenCalled();
  });
});

describe('R8B.15 — R7A commit ambiguity non-regression', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('finalizeTrip rejects + durable COMPLETED still schedules recovery wake', async () => {
    const endTime = new Date('2026-09-06T16:58:00.000Z');
    const canonicalStartAt = new Date('2026-09-06T13:59:50.000Z');
    const finalizeTrip = jest.fn().mockRejectedValue(new Error('finalize logger poison'));
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
        endTime,
        startTime: canonicalStartAt,
        rawDetectionMeta: { endRecognizedAt: WORKER_NOW.toISOString() },
      });
    });

    const { svc } = buildFinalizeHarness({
      trip: {
        id: TRIP1,
        startTime: canonicalStartAt,
        distanceKm: 5,
        tripStatus: TripStatus.ONGOING,
        endTime: null,
        rawDetectionMeta: { endRecognizedAt: WORKER_NOW.toISOString() },
      },
      finalizeTrip,
      transitionState,
      scheduleFinalize,
    });
    (svc as any).prisma.vehicleTrip.findUnique = findUnique;

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });
});

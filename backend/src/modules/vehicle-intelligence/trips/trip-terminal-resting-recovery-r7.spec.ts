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
import { evaluateTripLifecycleInvariant } from './trip-lifecycle-invariant';

const VEHICLE = 'veh-r7';
const ORG = 'org-r7';
const TOKEN = 88;
const TRIP1 = 'trip-r7-1';
const WORKER_NOW = new Date('2026-09-06T14:00:00.000Z');
const END_TIME = new Date('2026-09-06T13:58:00.000Z');

function finalizeJob(): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    dimoTokenId: TOKEN,
    trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
    requestedAt: WORKER_NOW.toISOString(),
  };
}

function buildFinalizeHarness(overrides: {
  det?: Record<string, unknown>;
  trip?: Record<string, unknown> | null;
  waypointCount?: number;
  qualityDiscard?: boolean;
} = {}) {
  const det = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_END,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: TRIP1,
    possibleEndAt: new Date(WORKER_NOW.getTime() - 130_000),
    possibleStartAt: new Date(WORKER_NOW.getTime() - 600_000),
    lastActivityAt: new Date(WORKER_NOW.getTime() - 130_000),
    lastMeaningfulMovementAt: new Date(WORKER_NOW.getTime() - 130_000),
    endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
    endConfidence: DetectionConfidence.MEDIUM,
    endValidationAttempts: 1,
    cusumSegmentEnd: END_TIME,
    cusumSegmentStart: null,
    cusumValidatedAt: null,
    startDetectionMode: null,
    startConfidence: null,
    startOdometerKm: null,
    startFuelLevel: null,
    startEvSoc: null,
    lastEvidenceSummary: {},
    ...overrides.det,
  };

  const trip =
    overrides.trip === null
      ? null
      : {
          id: TRIP1,
          startTime: new Date(WORKER_NOW.getTime() - 600_000),
          distanceKm: 5,
          tripStatus: TripStatus.ONGOING,
          endTime: null,
          ...overrides.trip,
        };

  const finalizeTrip = jest.fn().mockResolvedValue({});
  const discardTrip = jest.fn().mockResolvedValue(undefined);
  const transitionState = jest.fn().mockResolvedValue({});
  const scheduleFinalize = jest.fn().mockResolvedValue(undefined);
  const maybeRecoverLifecycleInvariant = jest.fn().mockResolvedValue('continue');
  const produceAfterPersistedCompletion = jest.fn().mockResolvedValue(undefined);
  const logTrackingRun = jest.fn().mockResolvedValue(undefined);

  const svc = {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant,
    prisma: {
      vehicleTrip: {
        findUnique: jest.fn().mockResolvedValue(trip),
      },
      vehicleTripWaypoint: {
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(overrides.waypointCount ?? 5),
      },
    },
    decisionEngine: { finalizeTrip, discardTrip },
    tripMetrics: {
      tripFinalized: { inc: jest.fn() },
      tripFinalizeLatency: { observe: jest.fn() },
      tripEndLatencyFromMovement: { observe: jest.fn() },
      tripDiscarded: { inc: jest.fn() },
      tripQualityAnomalies: { inc: jest.fn() },
    },
    logTripEndTimeline: jest.fn(),
    postFinalizeAnalysisProducer: { produceAfterPersistedCompletion },
    enrichmentOrchestrator: {
      enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined),
    },
    transitionState,
    scheduleFinalize,
    scheduleActiveTick: jest.fn(),
    logTrackingRun,
    batteryLvRestSessionProducer: {
      enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue(undefined),
    },
    parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
  };

  if (overrides.qualityDiscard) {
    svc.prisma.vehicleTripWaypoint.count.mockResolvedValue(0);
  }

  return {
    svc,
    det,
    finalizeTrip,
    discardTrip,
    transitionState,
    scheduleFinalize,
    maybeRecoverLifecycleInvariant,
    produceAfterPersistedCompletion,
    logTrackingRun,
  };
}

describe('R7 — terminal resting recovery (processFinalize)', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('1 — finalizeTrip throws before terminal commit: no recovery FINALIZE', async () => {
    const h = buildFinalizeHarness();
    h.finalizeTrip.mockRejectedValue(new Error('finalize failed'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.scheduleFinalize).not.toHaveBeenCalled();
    expect(h.transitionState).not.toHaveBeenCalled();
  });

  it('2 — COMPLETED + RESTING transition throws: immediate recovery FINALIZE', async () => {
    const h = buildFinalizeHarness();
    h.transitionState.mockRejectedValue(new Error('resting failed'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.finalizeTrip).toHaveBeenCalled();
    expect(h.scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
    expect(h.svc.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('terminal orphan recovery wake scheduled'),
    );
  });

  it('3 — COMPLETED + post-terminal pre-RESTING step throws: recovery scheduled', async () => {
    const h = buildFinalizeHarness();
    h.produceAfterPersistedCompletion.mockRejectedValue(new Error('analysis failed'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.finalizeTrip).toHaveBeenCalled();
    expect(h.transitionState).not.toHaveBeenCalled();
    expect(h.scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });

  it('4 — RESTING succeeds then ancillary logging throws: no terminal recovery', async () => {
    const h = buildFinalizeHarness();
    h.logTrackingRun.mockRejectedValue(new Error('log failed'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
    expect(h.scheduleFinalize).not.toHaveBeenCalled();
  });

  it('5 — CANCELLED + RESTING throws: deterministic recovery scheduled', async () => {
    const h = buildFinalizeHarness({
      qualityDiscard: true,
      trip: { id: TRIP1, distanceKm: 0.05 },
    });
    h.transitionState.mockRejectedValue(new Error('resting failed'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.discardTrip).toHaveBeenCalled();
    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });

  it('6 — recovery enqueue failure: terminal commit preserved, periodic fallback remains', async () => {
    const h = buildFinalizeHarness();
    h.transitionState.mockRejectedValue(new Error('resting failed'));
    h.scheduleFinalize.mockRejectedValue(new Error('queue down'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.finalizeTrip).toHaveBeenCalledTimes(1);
    expect(h.svc.logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('terminal orphan recovery enqueue failed'),
    );
  });

  it('7/R7.15 — recovery FINALIZE short-circuits via RECOVERABLE_END_ORPHAN', async () => {
    const h = buildFinalizeHarness({
      det: {
        state: TripDetectionState.POSSIBLE_END,
        activeTripId: TRIP1,
      },
      trip: {
        id: TRIP1,
        tripStatus: TripStatus.COMPLETED,
        endTime: END_TIME,
      },
    });
    h.maybeRecoverLifecycleInvariant.mockResolvedValue('recovered');

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.maybeRecoverLifecycleInvariant).toHaveBeenCalled();
    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.discardTrip).not.toHaveBeenCalled();
    expect(h.produceAfterPersistedCompletion).not.toHaveBeenCalled();
  });

  it('8 — healthy recovery job after RESTING: no duplicate lifecycle mutation', async () => {
    const h = buildFinalizeHarness({
      det: {
        state: TripDetectionState.RESTING,
        activeTripId: null,
      },
      trip: null,
    });
    h.maybeRecoverLifecycleInvariant.mockResolvedValue('continue');

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.discardTrip).not.toHaveBeenCalled();
  });

  it('9 — unrelated ONGOING conflict: fail closed via blocked recovery', async () => {
    const h = buildFinalizeHarness({
      det: {
        state: TripDetectionState.POSSIBLE_END,
        activeTripId: TRIP1,
      },
      trip: {
        id: TRIP1,
        tripStatus: TripStatus.COMPLETED,
        endTime: END_TIME,
      },
    });
    h.maybeRecoverLifecycleInvariant.mockResolvedValue('blocked');

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.transitionState).not.toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.any(Object),
    );
  });
});

describe('R7 — R2 RECOVERABLE_END_ORPHAN contract preserved', () => {
  it('COMPLETED terminal + active FSM + no ONGOING → RESET_TO_RESTING', () => {
    const result = evaluateTripLifecycleInvariant({
      vehicleId: VEHICLE,
      fsmState: TripDetectionState.POSSIBLE_END,
      activeTripId: TRIP1,
      referencedTrip: {
        id: TRIP1,
        tripStatus: TripStatus.COMPLETED,
        startTime: new Date(WORKER_NOW.getTime() - 600_000),
        endTime: END_TIME,
      },
      ongoingTrips: [],
    });

    expect(result.classification).toBe('RECOVERABLE_END_ORPHAN');
    expect(result.action).toBe('RESET_TO_RESTING');
  });

  it('COMPLETED terminal + unrelated ONGOING → fail closed conflict', () => {
    const result = evaluateTripLifecycleInvariant({
      vehicleId: VEHICLE,
      fsmState: TripDetectionState.POSSIBLE_END,
      activeTripId: TRIP1,
      referencedTrip: {
        id: TRIP1,
        tripStatus: TripStatus.COMPLETED,
        startTime: new Date(WORKER_NOW.getTime() - 600_000),
        endTime: END_TIME,
      },
      ongoingTrips: [
        {
          id: 'trip-other',
          tripStatus: TripStatus.ONGOING,
          startTime: new Date(WORKER_NOW.getTime() - 60_000),
        },
      ],
    });

    expect(result.action).toBe('NO_SAFE_REPAIR');
  });
});

describe('R7 — recovery uses existing scheduleFinalize (stable FINALIZE queue)', () => {
  it('terminal orphan wake calls scheduleFinalize not ad-hoc job ids', async () => {
    const h = buildFinalizeHarness();
    h.transitionState.mockRejectedValue(new Error('resting failed'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.scheduleFinalize).toHaveBeenCalledTimes(1);
    expect(h.scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });
});

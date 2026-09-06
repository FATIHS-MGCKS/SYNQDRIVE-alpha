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

const VEHICLE = 'veh-r7a';
const ORG = 'org-r7a';
const TOKEN = 89;
const TRIP1 = 'trip-r7a-1';
const WORKER_NOW = new Date('2026-09-06T15:00:00.000Z');
const END_TIME = new Date('2026-09-06T14:58:00.000Z');

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
  durableTripAfterMutation?: Record<string, unknown> | null;
  waypointCount?: number;
  qualityDiscard?: boolean;
  tripDistanceKm?: number;
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

  const initialTrip =
    overrides.trip === null
      ? null
      : {
          id: TRIP1,
          startTime: new Date(WORKER_NOW.getTime() - 600_000),
          distanceKm: overrides.tripDistanceKm ?? 5,
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

  let findUniqueCalls = 0;
  const findUnique = jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
    findUniqueCalls += 1;
    if (findUniqueCalls === 1) {
      return Promise.resolve(initialTrip);
    }
    if (overrides.durableTripAfterMutation !== undefined) {
      return Promise.resolve(overrides.durableTripAfterMutation);
    }
    return Promise.resolve(initialTrip);
  });

  const svc = {
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant,
    prisma: {
      vehicleTrip: { findUnique },
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
    logTrackingRun: jest.fn().mockResolvedValue(undefined),
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
    finalizeTrip,
    discardTrip,
    transitionState,
    scheduleFinalize,
    maybeRecoverLifecycleInvariant,
    findUnique,
  };
}

describe('R7A — terminal mutation commit ambiguity orchestration', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('R7A.9 — finalizeTrip rejects but durable COMPLETED schedules recovery', async () => {
    const h = buildFinalizeHarness({
      durableTripAfterMutation: {
        id: TRIP1,
        tripStatus: TripStatus.COMPLETED,
        endTime: END_TIME,
      },
    });
    h.finalizeTrip.mockRejectedValue(new Error('logger poison'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.finalizeTrip).toHaveBeenCalledTimes(1);
    expect(h.transitionState).not.toHaveBeenCalled();
    expect(h.scheduleFinalize).toHaveBeenCalledTimes(1);
    expect(h.scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
    expect(h.findUnique.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('R7A.10 — discardTrip rejects but durable CANCELLED schedules recovery', async () => {
    const h = buildFinalizeHarness({
      qualityDiscard: true,
      tripDistanceKm: 0.05,
      durableTripAfterMutation: {
        id: TRIP1,
        tripStatus: TripStatus.CANCELLED,
      },
    });
    h.discardTrip.mockRejectedValue(new Error('logger poison'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.discardTrip).toHaveBeenCalledTimes(1);
    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });

  it('R7A.11A — finalizeTrip rejects + durable ONGOING: no terminal recovery', async () => {
    const h = buildFinalizeHarness({
      durableTripAfterMutation: {
        id: TRIP1,
        tripStatus: TripStatus.ONGOING,
      },
    });
    h.finalizeTrip.mockRejectedValue(new Error('split failed'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.scheduleFinalize).not.toHaveBeenCalled();
  });

  it('R7A.11B — discardTrip rejects + durable ONGOING: no terminal recovery', async () => {
    const h = buildFinalizeHarness({
      qualityDiscard: true,
      tripDistanceKm: 0.05,
      durableTripAfterMutation: {
        id: TRIP1,
        tripStatus: TripStatus.ONGOING,
      },
    });
    h.discardTrip.mockRejectedValue(new Error('discard failed'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.scheduleFinalize).not.toHaveBeenCalled();
  });

  it('R7A.12C — COMPLETE intent + CANCELLED durable row schedules recovery', async () => {
    const h = buildFinalizeHarness({
      durableTripAfterMutation: {
        id: TRIP1,
        tripStatus: TripStatus.CANCELLED,
      },
    });
    h.finalizeTrip.mockRejectedValue(new Error('ambiguous'));

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });

  it('R7A.12A — durable read throws schedules fail-closed recovery', async () => {
    const h = buildFinalizeHarness();
    h.finalizeTrip.mockRejectedValue(new Error('mutation failed'));
    h.findUnique.mockImplementation(({ where }: { where: { id: string } }) => {
      if (where.id !== TRIP1) return Promise.resolve(null);
      if (h.finalizeTrip.mock.calls.length === 0) {
        return Promise.resolve({
          id: TRIP1,
          startTime: new Date(WORKER_NOW.getTime() - 600_000),
          distanceKm: 5,
          tripStatus: TripStatus.ONGOING,
        });
      }
      return Promise.reject(new Error('db down'));
    });

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.scheduleFinalize).toHaveBeenCalledWith(VEHICLE, ORG, TOKEN);
  });

  it('recovery FINALIZE short-circuits without second finalizeTrip', async () => {
    const h = buildFinalizeHarness({
      det: { state: TripDetectionState.POSSIBLE_END, activeTripId: TRIP1 },
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

    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.discardTrip).not.toHaveBeenCalled();
  });
});

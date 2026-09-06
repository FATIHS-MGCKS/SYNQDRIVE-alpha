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

const VEHICLE = 'veh-r8';
const ORG = 'org-r8';
const TOKEN = 99;
const TRIP1 = 'trip-r8-1';
const WORKER_NOW = new Date('2026-09-06T14:34:00.000Z');
const PHYSICAL_END = new Date('2026-09-06T14:30:00.000Z');
const POSSIBLE_END_AT = new Date('2026-09-06T14:30:00.000Z');
const POSSIBLE_END_ENTERED = new Date('2026-09-06T14:32:00.000Z');
const START_TIME = new Date('2026-09-06T14:00:00.000Z');

function finalizeJob(): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    dimoTokenId: TOKEN,
    trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
    requestedAt: WORKER_NOW.toISOString(),
  };
}

function buildFinalizeHarness() {
  const tripMetrics = {
    tripFinalized: { inc: jest.fn() },
    tripFinalizeLatency: { observe: jest.fn() },
    tripEndLatencyFromMovement: { observe: jest.fn() },
    tripDuration: { observe: jest.fn() },
    tripEndRecognitionLatency: { observe: jest.fn() },
    tripEndBoundaryAdjustment: { observe: jest.fn() },
    tripEvidencePaths: { inc: jest.fn() },
    tripTimingSampleRejected: { inc: jest.fn() },
  };
  const det = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_END,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: TRIP1,
    possibleEndAt: POSSIBLE_END_AT,
    possibleEndEnteredAt: POSSIBLE_END_ENTERED,
    possibleStartAt: START_TIME,
    possibleStartEnteredAt: new Date('2026-09-06T13:59:50.000Z'),
    lastActivityAt: POSSIBLE_END_ENTERED,
    lastMeaningfulMovementAt: PHYSICAL_END,
    endDetectionMode: END_DETECTION_MODES.COMPOSITE_INACTIVITY,
    endConfidence: DetectionConfidence.MEDIUM,
    endValidationAttempts: 1,
    cusumSegmentEnd: PHYSICAL_END,
    cusumSegmentStart: null,
    cusumValidatedAt: null,
    startDetectionMode: null,
    startConfidence: null,
    startOdometerKm: null,
    startFuelLevel: null,
    startEvSoc: null,
    lastEvidenceSummary: {
      startCandidateClockSource: 'PROVIDER_EVENT_TIME',
      endCandidateClockSource: 'PROVIDER_EVENT_TIME',
    },
  };
  const trip = {
    id: TRIP1,
    startTime: START_TIME,
    distanceKm: 5,
    tripStatus: TripStatus.ONGOING,
    endTime: null,
    endLatitude: 52.99,
    endLongitude: 13.99,
    rawDetectionMeta: {
      lifecycleRecovery: { startEpisode: { candidateStartAt: START_TIME.toISOString() } },
    },
  };
  const boundaryWaypoint = {
    latitude: 52.5,
    longitude: 13.5,
    recordedAt: new Date('2026-09-06T14:29:00.000Z'),
  };
  const latestWaypoint = {
    latitude: 52.99,
    longitude: 13.99,
    recordedAt: new Date('2026-09-06T14:35:00.000Z'),
  };
  const finalizeTrip = jest.fn().mockResolvedValue({});
  const prisma = {
    vehicleTrip: {
      findUnique: jest.fn().mockResolvedValue(trip),
    },
    vehicleTripWaypoint: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(latestWaypoint)
        .mockResolvedValueOnce(boundaryWaypoint),
      count: jest.fn().mockResolvedValue(3),
    },
    vehicleTripTrackingRun: { create: jest.fn().mockResolvedValue({}) },
  };
  const svc = {
    tripMetrics,
    prisma,
    decisionEngine: { finalizeTrip, discardTrip: jest.fn() },
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    transitionState: jest.fn().mockResolvedValue({}),
    scheduleFinalize: jest.fn().mockResolvedValue(undefined),
    postFinalizeAnalysisProducer: {
      produceAfterPersistedCompletion: jest.fn().mockResolvedValue(undefined),
    },
    enrichmentOrchestrator: {
      enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined),
    },
    batteryLvRestSessionProducer: {
      enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue(undefined),
    },
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    logTrackingRun: jest.fn().mockResolvedValue(undefined),
    logTripEndTimeline: jest.fn(),
    logTripStartTimeline: jest.fn(),
    parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
    logger: { log: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
  } as unknown as TripDetectionOrchestrationService;

  return { svc, finalizeTrip, tripMetrics, prisma };
}

describe('trip-fsm R8 orchestration finalize', () => {
  it('perserves prior metadata, boundary coords, and end recognition forensics', async () => {
    const h = buildFinalizeHarness();
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.finalizeTrip).toHaveBeenCalledTimes(1);
    const meta = h.finalizeTrip.mock.calls[0][1].rawDetectionMeta as Record<string, unknown>;
    expect((meta.lifecycleRecovery as any).startEpisode).toBeDefined();
    expect(meta.endCoordinateSource).toBe('WAYPOINT_AT_OR_BEFORE_BOUNDARY');
    expect(meta.endRecognizedAt).toEqual(expect.any(String));
    expect((meta.tripFsmForensics as any).version).toBe('R8_V1');
    expect(h.finalizeTrip.mock.calls[0][1].endLatitude).toBe(52.5);
    expect(h.finalizeTrip.mock.calls[0][1].endLongitude).toBe(13.5);
    expect(h.tripMetrics.tripEndRecognitionLatency.observe).toHaveBeenCalledWith(
      expect.objectContaining({ commit_confirmation: 'direct', profile: 'ICE' }),
      expect.any(Number),
    );
    expect(h.tripMetrics.tripDuration.observe).toHaveBeenCalled();
  });

  it('clears stale provisional coords when no boundary waypoint exists', async () => {
    const h = buildFinalizeHarness();
    h.prisma.vehicleTripWaypoint.findFirst = jest
      .fn()
      .mockResolvedValueOnce({
        latitude: 52.99,
        longitude: 13.99,
        recordedAt: new Date('2026-09-06T14:35:00.000Z'),
      })
      .mockResolvedValueOnce(null);

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(h.finalizeTrip.mock.calls[0][1].endLatitude).toBeNull();
    expect(h.finalizeTrip.mock.calls[0][1].endLongitude).toBeNull();
    expect(h.finalizeTrip.mock.calls[0][1].rawDetectionMeta.endCoordinateSource).toBe('NONE');
  });
});

describe('logTrackingRun R8 resultState contract', () => {
  it('defaults resultState to stateAtRun when resultState omitted', async () => {
    const create = jest.fn().mockResolvedValue({});
    const svc = {
      prisma: { vehicleTripTrackingRun: { create } },
      logger: { warn: jest.fn() },
    } as unknown as TripDetectionOrchestrationService;

    await TripDetectionOrchestrationService.prototype.logTrackingRun.call(
      svc,
      {
        vehicleId: VEHICLE,
        stateAtRun: TripDetectionState.POSSIBLE_START,
        runType: 'POSSIBLE_START_VALIDATION' as any,
      },
    );

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resultState: TripDetectionState.POSSIBLE_START,
        }),
      }),
    );
  });
});

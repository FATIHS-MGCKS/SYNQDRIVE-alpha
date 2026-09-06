import {
  TripDetectionState,
  TripStatus,
  VehicleDetectionProfile,
} from '@prisma/client';

import { TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import type { TripTrackingJobData } from './trip-detection.types';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { evaluateTripLifecycleInvariant } from './trip-lifecycle-invariant';

const VEHICLE = 'veh-r6';
const ORG = 'org-r6';
const TOKEN = 66;
const TRIP1 = 'trip-1';
const TRIP2 = 'trip-2';
const T0 = new Date('2026-09-06T12:00:00.000Z');
const GAP_END = new Date(T0.getTime() + 190_000);
const GAP_START = new Date(T0.getTime() - 10_000);

function jobData(): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    dimoTokenId: TOKEN,
    trigger: TRIP_TRACKING_TRIGGERS.ACTIVE_TICK,
    requestedAt: GAP_END.toISOString(),
  };
}

function midGapCorePoints() {
  return [
    { timestamp: GAP_END.toISOString(), speed: 10, isIgnitionOn: true },
  ];
}

function midGapCandidate() {
  return {
    gapMs: 190_000,
    firstEndAt: GAP_START,
    firstEndLatitude: null,
    firstEndLongitude: null,
    secondStartAt: GAP_END,
    secondStartLatitude: null,
    secondStartLongitude: null,
  };
}

function buildActiveTickHarness(overrides: Record<string, unknown> = {}) {
  const det = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.ACTIVE_TRIP,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: TRIP1,
    possibleStartAt: new Date(T0.getTime() - 120_000),
    lastMeaningfulMovementAt: GAP_START,
    lastActivityAt: GAP_START,
    lastCoreProcessedAt: GAP_START,
    lastRouteProcessedAt: GAP_START,
    lastDrivingProcessedAt: GAP_START,
    ...overrides,
  };

  const vehicleTripUpdate = jest.fn().mockResolvedValue({});
  const waypointCreateMany = jest.fn().mockResolvedValue({ count: 0 });
  const splitTripAtGap = jest.fn().mockResolvedValue({
    firstTripId: TRIP1,
    secondTripId: TRIP2,
    movedWaypoints: 0,
  });
  const transitionState = jest.fn().mockResolvedValue({});
  const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
  const logTrackingRun = jest.fn().mockResolvedValue(undefined);

  const preWaypoint = {
    latitude: 52.52,
    longitude: 13.405,
  };
  const postWaypoint = {
    latitude: 52.5201,
    longitude: 13.4051,
  };

  const prisma = {
    vehicleTripWaypoint: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.recordedAt?.lte) {
          return Promise.resolve(preWaypoint);
        }
        if (where.recordedAt?.gte) {
          return Promise.resolve(postWaypoint);
        }
        return Promise.resolve(null);
      }),
      createMany: waypointCreateMany,
    },
    vehicleTrip: {
      update: vehicleTripUpdate,
    },
    vehicleLatestState: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    vehicle: {
      findUnique: jest.fn().mockResolvedValue({
        tankCapacityLiters: 50,
        fuelType: 'PETROL',
      }),
    },
  };

  const svc = {
    logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn() },
    BACKFILL_MS: 300_000,
    OVERLAP_CORE_MS: 30_000,
    OVERLAP_ROUTE_MS: 30_000,
    OVERLAP_PERF_MS: 30_000,
    TRACKING_INTERVAL_MS: 30_000,
    TRIP_MID_GAP_SPLIT_MS: 180_000,
    TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M: 200,
    TRIP_MID_GAP_MIN_PRE_DURATION_MS: 60_000,
    TRIP_CONTINUITY_WINDOW_MS: 900_000,
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    transitionState,
    scheduleActiveTick,
    schedulePossibleEndCheck: jest.fn().mockResolvedValue(undefined),
    logTrackingRun,
    logTripEndTimeline: jest.fn(),
    tripMetrics: {
      tripEvidencePaths: { inc: jest.fn() },
      tripContinuity: { inc: jest.fn() },
    },
    segments: {
      fetchRawTripCoreData: jest.fn().mockResolvedValue(midGapCorePoints()),
      fetchRouteEnrichment: jest.fn().mockResolvedValue([]),
      fetchPerformance: jest.fn().mockResolvedValue([]),
    },
    prisma,
    postFinalizeAnalysisProducer: {
      produceAfterPersistedCompletion: jest.fn().mockResolvedValue(undefined),
    },
    enrichmentOrchestrator: {
      enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined),
    },
    dimoProviderContext: jest.fn().mockReturnValue({}),
    tryApplyClickHouseAssistedEnd: jest.fn().mockResolvedValue(false),
    hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(false),
    TRIP_CONTINUITY_CORE_WINDOW_MS: 900_000,
    TRIP_CONTINUITY_PERF_WINDOW_MS: 900_000,
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
          verdict: 'CONTINUE',
          evidence: { summary: { reason: 'still_active' } },
        },
      ]),
    },
    decisionEngine: {
      splitTripAtGap,
      evaluateContinuity: jest.fn().mockReturnValue({
        verdict: 'ACTIVE',
        reason: 'still_active',
        findings: [],
      }),
    },
    findMidTripGap: jest.fn().mockReturnValue(midGapCandidate()),
    resolveLiveMidGapDriftEvidence: jest.fn().mockResolvedValue({
      state: 'WITHIN_THRESHOLD',
      driftM: 12,
      missingPreWaypoint: false,
      missingPostWaypoint: false,
    }),
  };

  return {
    svc,
    det,
    prisma,
    splitTripAtGap,
    transitionState,
    scheduleActiveTick,
    vehicleTripUpdate,
    waypointCreateMany,
    logTrackingRun,
    setDriftEvidence: (evidence: {
      state: 'WITHIN_THRESHOLD' | 'EXCEEDS_THRESHOLD' | 'UNKNOWN';
      driftM: number | null;
      missingPreWaypoint: boolean;
      missingPostWaypoint: boolean;
    }) => {
      svc.resolveLiveMidGapDriftEvidence.mockResolvedValue(evidence);
    },
    setDriftWaypoints: (pre: typeof preWaypoint | null, post: typeof postWaypoint | null) => {
      prisma.vehicleTripWaypoint.findFirst.mockImplementation(({ where }: any) => {
        if (where.recordedAt?.lte) return Promise.resolve(pre);
        if (where.recordedAt?.gte) return Promise.resolve(post);
        return Promise.resolve(null);
      });
    },
  };
}

describe('R6 — live mid-gap split orchestration', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: GAP_END });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('10/11 — UNKNOWN drift blocks splitTripAtGap and continues original trip', async () => {
    const h = buildActiveTickHarness();
    h.setDriftEvidence({
      state: 'UNKNOWN',
      driftM: null,
      missingPreWaypoint: true,
      missingPostWaypoint: true,
    });

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).not.toHaveBeenCalled();
    expect(h.vehicleTripUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TRIP1 } }),
    );
    expect(h.transitionState).not.toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.objectContaining({ activeTripId: TRIP2 }),
    );
    const rejected = h.logTrackingRun.mock.calls.find(
      (call) => call[0]?.resultSummary?.reason === 'unknown_drift',
    );
    expect(rejected).toBeDefined();
  });

  it('1 — pre-commit splitTripAtGap throw may fall through to original trip update', async () => {
    const h = buildActiveTickHarness();
    h.splitTripAtGap.mockRejectedValue(new Error('split failed'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).toHaveBeenCalled();
    expect(h.transitionState).not.toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.objectContaining({ activeTripId: TRIP2 }),
    );
    expect(h.vehicleTripUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TRIP1 } }),
    );
  });

  it('2/3 — post-commit transition failure aborts tick without old-trip writes', async () => {
    const h = buildActiveTickHarness();
    h.transitionState.mockRejectedValue(new Error('fsm repoint failed'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).toHaveBeenCalled();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
  });

  it('4 — post-commit scheduleActiveTick failure still avoids old-trip update', async () => {
    const h = buildActiveTickHarness();
    h.scheduleActiveTick.mockRejectedValue(new Error('queue failed'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).toHaveBeenCalled();
    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
  });

  it('7 — successful split repoints FSM and schedules successor tick', async () => {
    const h = buildActiveTickHarness();

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).toHaveBeenCalledWith(
      expect.objectContaining({
        tripId: TRIP1,
        triggeredBy: 'LIVE_FSM',
        splitDriftM: expect.any(Number),
      }),
    );
    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.objectContaining({ activeTripId: TRIP2 }),
    );
    expect(h.scheduleActiveTick).toHaveBeenCalled();
    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
  });

  it('D — excessive drift rejects live split', async () => {
    const h = buildActiveTickHarness();
    h.setDriftEvidence({
      state: 'EXCEEDS_THRESHOLD',
      driftM: 250,
      missingPreWaypoint: false,
      missingPostWaypoint: false,
    });

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).not.toHaveBeenCalled();
    expect(h.logTrackingRun.mock.calls.some(
      (call) => call[0]?.resultSummary?.reason === 'excessive_drift',
    )).toBe(true);
  });
});

describe('R6 — R2 RECOVERABLE_SPLIT_REPOINT after post-commit FSM failure', () => {
  it('next ACTIVE_TICK recovery adopts trip2 via splitFrom proof', () => {
    const result = evaluateTripLifecycleInvariant({
      vehicleId: VEHICLE,
      fsmState: TripDetectionState.ACTIVE_TRIP,
      activeTripId: TRIP1,
      referencedTrip: {
        id: TRIP1,
        tripStatus: TripStatus.COMPLETED,
        startTime: new Date(T0.getTime() - 120_000),
        endTime: GAP_START,
      },
      ongoingTrips: [
        {
          id: TRIP2,
          tripStatus: TripStatus.ONGOING,
          startTime: GAP_END,
          rawDetectionMeta: { splitFrom: TRIP1 },
        },
      ],
    });

    expect(result.classification).toBe('RECOVERABLE_SPLIT_REPOINT');
    expect(result.action).toBe('REPOINT_ACTIVE_TRIP');
    expect(result.tripId).toBe(TRIP2);
  });
});

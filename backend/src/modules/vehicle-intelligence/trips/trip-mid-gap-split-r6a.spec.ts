import {
  TripDetectionState,
  TripStatus,
  VehicleDetectionProfile,
} from '@prisma/client';

import { TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import type { TripTrackingJobData } from './trip-detection.types';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { evaluateTripLifecycleInvariant } from './trip-lifecycle-invariant';

const VEHICLE = 'veh-r6a';
const ORG = 'org-r6a';
const TOKEN = 67;
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

type DurableMocks = {
  originalTrip: Record<string, unknown> | null;
  ongoingTrips: Record<string, unknown>[];
};

function buildActiveTickHarness(
  overrides: Record<string, unknown> = {},
  durable: DurableMocks = {
    originalTrip: {
      id: TRIP1,
      tripStatus: TripStatus.ONGOING,
      startTime: new Date(T0.getTime() - 120_000),
      endTime: null,
      rawDetectionMeta: {},
    },
    ongoingTrips: [
      {
        id: TRIP1,
        tripStatus: TripStatus.ONGOING,
        startTime: new Date(T0.getTime() - 120_000),
        endTime: null,
        rawDetectionMeta: {},
      },
    ],
  },
) {
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

  const preWaypoint = { latitude: 52.52, longitude: 13.405 };
  const postWaypoint = { latitude: 52.5201, longitude: 13.4051 };

  const prisma = {
    vehicleTripWaypoint: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (where.recordedAt?.lte) return Promise.resolve(preWaypoint);
        if (where.recordedAt?.gte) return Promise.resolve(postWaypoint);
        return Promise.resolve(null);
      }),
      createMany: waypointCreateMany,
    },
    vehicleTrip: {
      update: vehicleTripUpdate,
      findUnique: jest.fn().mockResolvedValue(durable.originalTrip),
      findMany: jest.fn().mockResolvedValue(durable.ongoingTrips),
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
  };
}

function committedLinkedDurable() {
  return {
    originalTrip: {
      id: TRIP1,
      tripStatus: TripStatus.COMPLETED,
      startTime: new Date(T0.getTime() - 120_000),
      endTime: GAP_START,
      rawDetectionMeta: {
        splitTriggeredBy: 'LIVE_FSM',
        splitSecondStartAt: GAP_END.toISOString(),
        splitFirstEndAt: GAP_START.toISOString(),
      },
    },
    ongoingTrips: [
      {
        id: TRIP2,
        tripStatus: TripStatus.ONGOING,
        startTime: GAP_END,
        endTime: null,
        rawDetectionMeta: { splitFrom: TRIP1, splitTriggeredBy: 'LIVE_FSM' },
      },
    ],
  };
}

describe('R6A — live split commit ambiguity orchestration', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: GAP_END });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('R6A.9 — promise rejects but durable COMMITTED_LINKED: no fallthrough', async () => {
    const h = buildActiveTickHarness({}, committedLinkedDurable());
    h.splitTripAtGap.mockRejectedValue(new Error('post-commit logger poison'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).toHaveBeenCalled();
    expect(h.transitionState).not.toHaveBeenCalled();
    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
    expect(h.waypointCreateMany).not.toHaveBeenCalled();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
    const forensics = h.logTrackingRun.mock.calls.find(
      (call) => call[0]?.resultSummary?.decision === 'SPLIT_COMMIT_AMBIGUITY',
    );
    expect(forensics?.[0]?.resultSummary?.durableOutcome).toBe('COMMITTED_LINKED');
  });

  it('R6A.10 — promise rejects with durable NOT_COMMITTED: safe fallthrough', async () => {
    const h = buildActiveTickHarness();
    h.splitTripAtGap.mockRejectedValue(new Error('split failed'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).toHaveBeenCalled();
    expect(h.vehicleTripUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: TRIP1 } }),
    );
    const ambiguityLog = h.logTrackingRun.mock.calls.find(
      (call) => call[0]?.resultSummary?.decision === 'SPLIT_COMMIT_AMBIGUITY',
    );
    expect(ambiguityLog).toBeUndefined();
  });

  it('R6A.11A — trip1 COMPLETED, no continuation → fail closed', async () => {
    const h = buildActiveTickHarness(
      {},
      {
        originalTrip: {
          id: TRIP1,
          tripStatus: TripStatus.COMPLETED,
          startTime: new Date(T0.getTime() - 120_000),
          endTime: GAP_START,
          rawDetectionMeta: { splitTriggeredBy: 'LIVE_FSM' },
        },
        ongoingTrips: [],
      },
    );
    h.splitTripAtGap.mockRejectedValue(new Error('ambiguous split'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
  });

  it('R6A.11B — two ONGOING continuations → fail closed', async () => {
    const durable = committedLinkedDurable();
    durable.ongoingTrips.push({
      id: 'trip-3',
      tripStatus: TripStatus.ONGOING,
      startTime: GAP_END,
      endTime: null,
      rawDetectionMeta: { splitFrom: TRIP1, splitTriggeredBy: 'LIVE_FSM' },
    });
    const h = buildActiveTickHarness({}, durable);
    h.splitTripAtGap.mockRejectedValue(new Error('ambiguous split'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
  });

  it('R6A.11C — splitFrom mismatch → fail closed', async () => {
    const h = buildActiveTickHarness(
      {},
      {
        originalTrip: {
          id: TRIP1,
          tripStatus: TripStatus.COMPLETED,
          startTime: new Date(T0.getTime() - 120_000),
          endTime: GAP_START,
          rawDetectionMeta: { splitTriggeredBy: 'LIVE_FSM' },
        },
        ongoingTrips: [
          {
            id: TRIP2,
            tripStatus: TripStatus.ONGOING,
            startTime: GAP_END,
            endTime: null,
            rawDetectionMeta: { splitFrom: 'other-trip', splitTriggeredBy: 'LIVE_FSM' },
          },
        ],
      },
    );
    h.splitTripAtGap.mockRejectedValue(new Error('ambiguous split'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
  });

  it('R6A.11D — startTime mismatch → fail closed', async () => {
    const durable = committedLinkedDurable();
    durable.ongoingTrips[0] = {
      ...durable.ongoingTrips[0],
      startTime: new Date(GAP_END.getTime() + 60_000),
    };
    const h = buildActiveTickHarness({}, durable);
    h.splitTripAtGap.mockRejectedValue(new Error('ambiguous split'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
  });

  it('R6A.11E — durable read throws → fail closed', async () => {
    const h = buildActiveTickHarness();
    h.splitTripAtGap.mockRejectedValue(new Error('split failed'));
    h.prisma.vehicleTrip.findUnique.mockRejectedValue(new Error('db down'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
  });

  it('R6A.11F — trip1 ONGOING with linked continuation → fail closed', async () => {
    const h = buildActiveTickHarness(
      {},
      {
        originalTrip: {
          id: TRIP1,
          tripStatus: TripStatus.ONGOING,
          startTime: new Date(T0.getTime() - 120_000),
          endTime: null,
          rawDetectionMeta: {},
        },
        ongoingTrips: [
          {
            id: TRIP1,
            tripStatus: TripStatus.ONGOING,
            startTime: new Date(T0.getTime() - 120_000),
            endTime: null,
            rawDetectionMeta: {},
          },
          {
            id: TRIP2,
            tripStatus: TripStatus.ONGOING,
            startTime: GAP_END,
            endTime: null,
            rawDetectionMeta: { splitFrom: TRIP1, splitTriggeredBy: 'LIVE_FSM' },
          },
        ],
      },
    );
    h.splitTripAtGap.mockRejectedValue(new Error('partial split'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.vehicleTripUpdate).not.toHaveBeenCalled();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
  });
});

describe('R6A — committed-but-rejected next tick R2 repoint', () => {
  it('RECOVERABLE_SPLIT_REPOINT adopts trip2 without creating trip3', () => {
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

  it('second ACTIVE_TICK after COMMITTED_LINKED abort does not call splitTripAtGap again', async () => {
    const h = buildActiveTickHarness({}, committedLinkedDurable());
    h.splitTripAtGap.mockRejectedValue(new Error('post-commit poison'));

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).toHaveBeenCalledTimes(1);

    h.svc.maybeRecoverLifecycleInvariant.mockResolvedValue('recovered');
    h.svc.getOrCreateDetectionState.mockResolvedValue({
      ...h.det,
      activeTripId: TRIP2,
    });
    h.splitTripAtGap.mockClear();

    await TripDetectionOrchestrationService.prototype.processActiveTick.call(
      h.svc as unknown as TripDetectionOrchestrationService,
      jobData(),
    );

    expect(h.splitTripAtGap).not.toHaveBeenCalled();
  });
});

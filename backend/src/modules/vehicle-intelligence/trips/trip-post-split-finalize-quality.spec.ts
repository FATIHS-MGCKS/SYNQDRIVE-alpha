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
import { runTripObservabilitySafely } from './trip-fsm-observability-safe.util';

const VEHICLE = '68868291-5478-42cd-b0c4-cc77b2a78e21';
const ORG = 'org-post-split-quality';
const TOKEN = 186946;
const TRIP2 = 'a1788836-df34-48af-9945-6b1fe75ff288';
const TRIP_START = new Date('2026-09-24T13:09:29.626Z');
const STALE_LMM = new Date('2026-09-24T13:10:21.390Z');
const LATEST_WP = new Date('2026-09-24T13:12:17.168Z');
const WORKER_NOW = new Date('2026-09-24T13:13:00.000Z');

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

function waypointMocks() {
  const earliest = {
    latitude: 50.937,
    longitude: 6.96,
    recordedAt: new Date('2026-09-24T13:09:35.000Z'),
  };
  const latest = {
    latitude: 50.939,
    longitude: 6.965,
    recordedAt: LATEST_WP,
  };
  const findFirst = jest.fn(
    async (args: {
      orderBy?: { recordedAt: 'asc' | 'desc' };
      where?: { recordedAt?: { lte?: Date } };
    }) => {
      if (args.where?.recordedAt?.lte) {
        return latest;
      }
      if (args.orderBy?.recordedAt === 'asc') {
        return earliest;
      }
      return latest;
    },
  );
  return { findFirst, count: jest.fn().mockResolvedValue(15), earliest, latest };
}

function buildPostSplitFinalizeHarness(options: {
  distanceKm?: number | null;
  waypointCount?: number;
  lastMeaningfulMovementAt?: Date;
  latestWaypointAt?: Date;
}) {
  const finalizeTrip = jest.fn().mockResolvedValue({});
  const discardTrip = jest.fn().mockResolvedValue(undefined);
  const transitionState = jest.fn().mockResolvedValue({});
  const logTrackingRun = jest.fn().mockResolvedValue(undefined);
  const wp = waypointMocks();
  if (options.waypointCount != null) {
    wp.count.mockResolvedValue(options.waypointCount);
  }
  if (options.latestWaypointAt) {
    wp.latest.recordedAt = options.latestWaypointAt;
  }

  const det = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_END,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: TRIP2,
    possibleEndAt: new Date('2026-09-24T13:12:30.000Z'),
    possibleStartAt: TRIP_START,
    lastActivityAt: STALE_LMM,
    lastMeaningfulMovementAt:
      options.lastMeaningfulMovementAt ?? STALE_LMM,
    endDetectionMode: END_DETECTION_MODES.MID_TRIP_GAP_SPLIT,
    endConfidence: DetectionConfidence.MEDIUM,
    endValidationAttempts: 1,
    cusumSegmentEnd: null,
    cusumSegmentStart: null,
    lastEvidenceSummary: {},
  };

  const trip = {
    id: TRIP2,
    startTime: TRIP_START,
    distanceKm: options.distanceKm ?? null,
    tripStatus: TripStatus.ONGOING,
    endTime: null,
    rawDetectionMeta: {},
  };

  const svc = attachObservabilitySafe({
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    prisma: {
      vehicleTrip: { findUnique: jest.fn().mockResolvedValue(trip) },
      vehicleTripWaypoint: wp,
    },
    decisionEngine: { finalizeTrip, discardTrip },
    tripMetrics: {
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
    },
    transitionState,
    scheduleFinalize: jest.fn(),
    logTrackingRun,
    logTripEndTimeline: jest.fn(),
    parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
    postFinalizeAnalysisProducer: {
      produceAfterPersistedCompletion: jest.fn().mockResolvedValue(undefined),
    },
    enrichmentOrchestrator: {
      enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined),
    },
    batteryLvRestSessionProducer: {
      enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue(undefined),
    },
  });

  return { svc, finalizeTrip, discardTrip, logTrackingRun, wp };
}

describe('post-split finalize quality — processFinalize integration', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('control 7 — MID_TRIP_GAP_SPLIT short real trip completes (production repro)', async () => {
    const { svc, finalizeTrip, discardTrip, logTrackingRun } =
      buildPostSplitFinalizeHarness({});

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(discardTrip).not.toHaveBeenCalled();
    expect(finalizeTrip).toHaveBeenCalled();
    const endTime = finalizeTrip.mock.calls[0][1].endTime as Date;
    expect(endTime.getTime() - TRIP_START.getTime()).toBeGreaterThanOrEqual(60_000);
    expect(endTime.toISOString()).toBe(LATEST_WP.toISOString());

    const trackingCall = logTrackingRun.mock.calls.find(
      (c) => c[0]?.resultSummary?.QUALITY_DECISION != null,
    );
    expect(trackingCall?.[0]?.resultSummary?.QUALITY_DECISION).toBe('keep');
    expect(trackingCall?.[0]?.resultSummary?.QUALITY_WAYPOINT_COUNT).toBe(15);
    expect(trackingCall?.[0]?.resultSummary?.QUALITY_MEANINGFUL_MOVEMENT).toBe(
      true,
    );
    expect(trackingCall?.[0]?.resultSummary?.terminalLifecycleCommit).toBe(
      'COMPLETED',
    );
  });

  it('noise short start with no movement still discarded', async () => {
    const { svc, finalizeTrip, discardTrip } = buildPostSplitFinalizeHarness({
      waypointCount: 0,
      lastMeaningfulMovementAt: new Date(TRIP_START.getTime() + 20_000),
      latestWaypointAt: new Date(TRIP_START.getTime() + 20_000),
    });

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(finalizeTrip).not.toHaveBeenCalled();
    expect(discardTrip).toHaveBeenCalledWith(TRIP2, 'too_short_no_distance');
  });
});

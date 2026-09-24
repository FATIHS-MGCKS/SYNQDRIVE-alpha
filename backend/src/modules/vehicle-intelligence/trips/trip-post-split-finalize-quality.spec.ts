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
const PHYSICAL_STOP = new Date('2026-09-24T13:11:00.000Z');
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

function buildProductionWaypoints() {
  const rows = [
    { t: '2026-09-24T13:09:35.000Z', lat: 50.937, lon: 6.96, speed: 25 },
    { t: '2026-09-24T13:09:50.000Z', lat: 50.9375, lon: 6.961, speed: 30 },
    { t: '2026-09-24T13:10:05.000Z', lat: 50.938, lon: 6.962, speed: 28 },
    { t: '2026-09-24T13:10:21.390Z', lat: 50.9385, lon: 6.963, speed: 22 },
    { t: '2026-09-24T13:10:40.000Z', lat: 50.939, lon: 6.964, speed: 18 },
    { t: '2026-09-24T13:11:00.000Z', lat: 50.9395, lon: 6.965, speed: 8 },
  ];
  for (let i = 0; i < 9; i++) {
    rows.push({
      t: new Date(new Date('2026-09-24T13:12:30.000Z').getTime() - (8 - i) * 10_000).toISOString(),
      lat: 50.9395 + i * 0.00001,
      lon: 6.965 + i * 0.00001,
      speed: 0,
    });
  }
  return rows.map((r) => ({
    latitude: r.lat,
    longitude: r.lon,
    speedKmh: r.speed,
    recordedAt: new Date(r.t),
  }));
}

function waypointPrismaMock(waypoints: ReturnType<typeof buildProductionWaypoints>) {
  const findMany = jest.fn().mockResolvedValue(waypoints);
  const findFirst = jest.fn(
    async (args: { where?: { recordedAt?: { lte?: Date } } }) => {
      if (args.where?.recordedAt?.lte) {
        const lte = args.where.recordedAt.lte.getTime();
        const eligible = waypoints.filter((w) => w.recordedAt.getTime() <= lte);
        return eligible[eligible.length - 1] ?? null;
      }
      return null;
    },
  );
  const count = jest.fn().mockResolvedValue(waypoints.length);
  return { findMany, findFirst, count };
}

function buildPostSplitFinalizeHarness(options: {
  distanceKm?: number | null;
  waypoints?: ReturnType<typeof buildProductionWaypoints>;
  detectionProfile?: VehicleDetectionProfile;
  lastMeaningfulMovementAt?: Date;
}) {
  const waypoints = options.waypoints ?? buildProductionWaypoints();
  const wp = waypointPrismaMock(waypoints);
  const finalizeTrip = jest.fn().mockResolvedValue({});
  const discardTrip = jest.fn().mockResolvedValue(undefined);
  const transitionState = jest.fn().mockResolvedValue({});
  const logTrackingRun = jest.fn().mockResolvedValue(undefined);

  const det = {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_END,
    detectionProfile: options.detectionProfile ?? VehicleDetectionProfile.ICE,
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

  return { svc, finalizeTrip, discardTrip, logTrackingRun, waypoints };
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
    expect(endTime.toISOString()).toBe(PHYSICAL_STOP.toISOString());
    expect(endTime.getTime()).toBeLessThan(
      new Date('2026-09-24T13:12:30.000Z').getTime(),
    );

    const trackingCall = logTrackingRun.mock.calls.find(
      (c) => c[0]?.resultSummary?.QUALITY_DECISION != null,
    );
    expect(trackingCall?.[0]?.resultSummary?.QUALITY_DECISION).toBe('keep');
    expect(trackingCall?.[0]?.resultSummary?.QUALITY_MEANINGFUL_MOVEMENT).toBe(
      true,
    );
    expect(trackingCall?.[0]?.resultSummary?.FINALIZE_END_EVENT_AT).toBe(
      PHYSICAL_STOP.toISOString(),
    );
    expect(trackingCall?.[0]?.resultSummary?.terminalLifecycleCommit).toBe(
      'COMPLETED',
    );
  });

  it('EV profile — same credible short post-split trip completes', async () => {
    const { finalizeTrip, discardTrip, svc } = buildPostSplitFinalizeHarness({
      detectionProfile: VehicleDetectionProfile.EV,
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );
    expect(discardTrip).not.toHaveBeenCalled();
    expect(finalizeTrip).toHaveBeenCalled();
  });

  it('noise short start with no movement still discarded', async () => {
    const { svc, finalizeTrip, discardTrip } = buildPostSplitFinalizeHarness({
      waypoints: [
        {
          latitude: 50.937,
          longitude: 6.96,
          speedKmh: 0,
          recordedAt: new Date(TRIP_START.getTime() + 10_000),
        },
      ],
      lastMeaningfulMovementAt: new Date(TRIP_START.getTime() + 20_000),
    });

    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      svc as unknown as TripDetectionOrchestrationService,
      finalizeJob(),
    );

    expect(finalizeTrip).not.toHaveBeenCalled();
    expect(discardTrip).toHaveBeenCalledWith(TRIP2, 'too_short_no_distance');
  });
});

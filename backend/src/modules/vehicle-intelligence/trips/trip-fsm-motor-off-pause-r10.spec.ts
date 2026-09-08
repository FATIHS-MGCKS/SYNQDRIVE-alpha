/**
 * R10 — Motor-off pause, false resume & stale finalize guards
 *
 * Regression coverage for KS MX 2024 reference case (2026-09-08):
 * - Pre-stop motion inside the 90s fetch window must not trigger activity_resumed
 * - Fresh post-restart motion must still reopen the trip
 * - Stale FINALIZE jobs must not close a resumed ACTIVE_TRIP
 * - Pending end-cycle jobs are cancelled on resume
 */

import {
  DetectionConfidence,
  TripDetectionState,
  TripStatus,
  TripTrackingRunType,
  VehicleDetectionProfile,
} from '@prisma/client';

import { END_DETECTION_MODES, TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import type { TripTrackingJobData } from './trip-detection.types';
import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { hasActivityResumed } from './trip-evidence.helpers';
import { EndContinuityDetector } from './detectors/end-continuity.detector';
import { DETECTION_PHASES } from './detectors/detector.interfaces';
import { cancelPendingTripTrackingJobs } from './trip-tracking-queue.util';

const VEHICLE = 'veh-r10';
const ORG = 'org-r10';
const TOKEN = 187336;
const TRIP_ID = 'e830b6e6-b738-4c35-8d88-39e05f1b5aad';
const END_BOUNDARY = new Date('2026-09-08T04:47:51.000Z');

function jobData(trigger: TripTrackingJobData['trigger']): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    dimoTokenId: TOKEN,
    trigger,
    requestedAt: new Date('2026-09-08T04:48:51.000Z').toISOString(),
  };
}

function baseDet(overrides: Record<string, unknown> = {}) {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    state: TripDetectionState.POSSIBLE_END,
    detectionProfile: VehicleDetectionProfile.ICE,
    activeTripId: TRIP_ID,
    possibleEndAt: END_BOUNDARY,
    possibleEndEnteredAt: new Date('2026-09-08T04:48:50.000Z'),
    lastMeaningfulMovementAt: END_BOUNDARY,
    lastActivityAt: END_BOUNDARY,
    endValidationAttempts: 0,
    endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
    endConfidence: DetectionConfidence.MEDIUM,
    cusumValidatedAt: null,
    cusumSegmentStart: new Date('2026-09-08T04:33:00.000Z'),
    cusumSegmentEnd: END_BOUNDARY,
    lastEvidenceSummary: null,
    ...overrides,
  };
}

describe('R10 motor-off pause resume anchor', () => {
  it('hasActivityResumed ignores pre-boundary speed inside 90s window (KS MX false resume)', () => {
    const points = [
      {
        timestamp: '2026-09-08T04:47:19.000Z',
        isIgnitionOn: true,
        speed: 38,
        travelledDistance: 1000,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      },
      {
        timestamp: '2026-09-08T04:47:51.000Z',
        isIgnitionOn: false,
        speed: 0,
        travelledDistance: 1000,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      },
    ];
    expect(hasActivityResumed(points, 'ICE', END_BOUNDARY)).toBe(false);
  });

  it('EndContinuityDetector respects possibleEndAt anchor', async () => {
    const detector = new EndContinuityDetector();
    const finding = await detector.evaluate({
      vehicleId: VEHICLE,
      dimoTokenId: TOKEN,
      profile: VehicleDetectionProfile.ICE,
      phase: DETECTION_PHASES.POSSIBLE_END,
      possibleEndAt: END_BOUNDARY,
      coreDataPoints: [
        {
          timestamp: '2026-09-08T04:47:19.000Z',
          isIgnitionOn: true,
          speed: 38,
          travelledDistance: null,
          fuelAbsoluteLevel: null,
          batteryEnergy: null,
        },
      ],
    });
    expect(finding.verdict).toBe('NOT_TRIGGERED');
  });

  it('fresh post-restart motion after telemetry gap still resumes', () => {
    const points = [
      {
        timestamp: '2026-09-08T04:47:19.000Z',
        isIgnitionOn: true,
        speed: 38,
        travelledDistance: null,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      },
      {
        timestamp: '2026-09-08T04:52:02.000Z',
        isIgnitionOn: true,
        speed: 15,
        travelledDistance: null,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      },
    ];
    expect(hasActivityResumed(points, 'ICE', END_BOUNDARY)).toBe(true);
  });
});

describe('R10 processPossibleEndCheck — resume passes end boundary anchor', () => {
  it('passes endBoundaryAt into checkDimoActivityResumed', async () => {
    const det = baseDet();
    const checkDimoActivityResumed = jest.fn().mockResolvedValue(false);
    const schedulePossibleEndCheck = jest.fn().mockResolvedValue(undefined);
    const logTrackingRun = jest.fn().mockResolvedValue(undefined);

    const svc = {
      logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn() },
      TRIP_END_TIMEOUT_MS: 1_800_000,
      TRIP_END_STABILITY_WINDOW_MS: 90_000,
      TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS: 120_000,
      TRIP_END_CH_ASSIST_STABILITY_MS: 30_000,
      TRIP_END_VALIDATION_MAX_ATTEMPTS: 3,
      getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
      acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
      releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
      maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
      transitionState: jest.fn(),
      scheduleActiveTick: jest.fn(),
      schedulePossibleEndCheck,
      scheduleEndValidation: jest.fn(),
      scheduleFinalize: jest.fn(),
      cancelPendingEndCycleJobs: jest.fn(),
      logTrackingRun,
      segments: { fetchRawTripCoreData: jest.fn().mockResolvedValue([]) },
      dimoProviderContext: jest.fn().mockReturnValue({}),
      checkDimoActivityResumed,
    };

    await TripDetectionOrchestrationService.prototype.processPossibleEndCheck.call(
      svc,
      jobData(TRIP_TRACKING_TRIGGERS.POSSIBLE_END_CHECK),
    );

    expect(checkDimoActivityResumed).toHaveBeenCalledWith(
      expect.objectContaining({ resumeAfterAt: END_BOUNDARY }),
    );
  });
});

describe('R10 processFinalize — stale job guards', () => {
  function buildFinalizeHarness(detOverrides: Record<string, unknown> = {}) {
    const det = baseDet(detOverrides);
    const finalizeTrip = jest.fn().mockResolvedValue({
      id: TRIP_ID,
      tripStatus: TripStatus.COMPLETED,
    });
    const logTrackingRun = jest.fn().mockResolvedValue(undefined);

    return {
      det,
      finalizeTrip,
      logTrackingRun,
      svc: {
        logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn() },
        getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
        acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
        releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
        maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
        logTrackingRun,
        decisionEngine: { finalizeTrip, discardTrip: jest.fn() },
        prisma: {
          vehicleTrip: {
            findUnique: jest.fn().mockResolvedValue({
              id: TRIP_ID,
              startTime: new Date('2026-09-08T04:33:00.000Z'),
              distanceKm: 5,
              rawDetectionMeta: null,
            }),
          },
          vehicleTripWaypoint: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(10),
          },
        },
        transitionState: jest.fn().mockResolvedValue({}),
        postFinalizeAnalysisProducer: { produceAfterPersistedCompletion: jest.fn() },
        enrichmentOrchestrator: { enqueueBehaviorEnrichment: jest.fn() },
        batteryLvRestSessionProducer: { enqueueSessionOpenForFinalizedTrip: jest.fn() },
        tripMetrics: undefined,
        shutdownEvidenceTripContext: undefined,
        logTripEndTimeline: jest.fn(),
      },
    };
  }

  it('aborts finalize when FSM returned to ACTIVE_TRIP after real resume', async () => {
    const h = buildFinalizeHarness({
      state: TripDetectionState.ACTIVE_TRIP,
      lastMeaningfulMovementAt: new Date('2026-09-08T04:52:02.000Z'),
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE),
    );

    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.logTrackingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runType: TripTrackingRunType.FINALIZATION_CHECK,
        resultSummary: expect.objectContaining({
          reason: 'stale_finalize_aborted_active_trip',
        }),
      }),
    );
  });

  it('aborts finalize when movement anchor is after end boundary', async () => {
    const h = buildFinalizeHarness({
      state: TripDetectionState.POSSIBLE_END,
      lastMeaningfulMovementAt: new Date('2026-09-08T04:52:02.000Z'),
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE),
    );

    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.logTrackingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resultSummary: expect.objectContaining({
          reason: 'stale_finalize_aborted_movement_after_end',
        }),
      }),
    );
  });

  it('finalizes legitimately when end boundary matches last movement', async () => {
    const h = buildFinalizeHarness({
      state: TripDetectionState.POSSIBLE_END,
      lastMeaningfulMovementAt: END_BOUNDARY,
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE),
    );

    expect(h.finalizeTrip).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ endTime: END_BOUNDARY }),
    );
  });
});

describe('R10 cancelPendingTripTrackingJobs', () => {
  it('removes waiting primary and successor finalize jobs', async () => {
    const removed = new Set<string>();
    const queue = {
      getJob: jest.fn(async (id: string) => ({
        getState: async () => 'waiting',
        remove: async () => {
          removed.add(id);
        },
      })),
      add: jest.fn(),
    };

    const count = await cancelPendingTripTrackingJobs({
      queue,
      jobIds: [`trip-fin-${VEHICLE}-${TRIP_ID}`],
    });

    expect(count).toBe(2);
    expect(removed.has(`trip-fin-${VEHICLE}-${TRIP_ID}`)).toBe(true);
    expect(removed.has(`trip-fin-${VEHICLE}-${TRIP_ID}__succ`)).toBe(true);
  });
});

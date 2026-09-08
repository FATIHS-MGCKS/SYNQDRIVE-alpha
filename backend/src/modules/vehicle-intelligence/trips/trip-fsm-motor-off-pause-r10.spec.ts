/**
 * R10 — Motor-off pause, false resume, end-cycle finalize safety
 *
 * KS MX 2024 reference case (2026-09-08, tokenId 187336).
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
import {
  isEndCycleTokenStale,
  resolveEndCycleToken,
  evaluateEndCycleJobAdmission,
} from './trip-end-cycle-reset';
import {
  cancelPendingTripTrackingJobs,
  enqueueEndCycleTripTrackingJob,
} from './trip-tracking-queue.util';

const VEHICLE = 'veh-r10';
const ORG = 'org-r10';
const TOKEN = 187336;
const TRIP_ID = 'e830b6e6-b738-4c35-8d88-39e05f1b5aad';
const END_BOUNDARY = new Date('2026-09-08T04:47:51.000Z');
const CYCLE_A = '2026-09-08T04:48:50.000Z';
const CYCLE_B = '2026-09-08T05:02:20.000Z';
const TRUE_END = new Date('2026-09-08T05:02:45.000Z');

function jobData(
  trigger: TripTrackingJobData['trigger'],
  overrides: Partial<TripTrackingJobData> = {},
): TripTrackingJobData {
  return {
    vehicleId: VEHICLE,
    organizationId: ORG,
    dimoTokenId: TOKEN,
    trigger,
    requestedAt: new Date('2026-09-08T05:17:36.000Z').toISOString(),
    ...overrides,
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
    possibleEndEnteredAt: new Date(CYCLE_A),
    lastMeaningfulMovementAt: END_BOUNDARY,
    lastActivityAt: END_BOUNDARY,
    endValidationAttempts: 0,
    endDetectionMode: END_DETECTION_MODES.CLICKHOUSE_END_ASSIST,
    endConfidence: DetectionConfidence.MEDIUM,
    cusumValidatedAt: new Date('2026-09-08T05:17:36.000Z'),
    cusumSegmentStart: new Date('2026-09-08T04:33:00.000Z'),
    cusumSegmentEnd: TRUE_END,
    lastEvidenceSummary: null,
    ...overrides,
  };
}

describe('R10 A/B — resume anchor (pre-fix would false-positive)', () => {
  it('A: pre-boundary motion at 04:47:19 does not resume against boundary 04:47:51', () => {
    const points = [
      {
        timestamp: '2026-09-08T04:47:19.000Z',
        isIgnitionOn: true,
        speed: 38,
        travelledDistance: 1000,
        fuelAbsoluteLevel: null,
        batteryEnergy: null,
      },
    ];
    expect(hasActivityResumed(points, 'ICE')).toBe(true);
    expect(hasActivityResumed(points, 'ICE', END_BOUNDARY)).toBe(false);
  });

  it('90s fetch lower bound at worker now 04:48:51 excludes 04:47:19 (92s wall delta)', () => {
    const workerNow = new Date('2026-09-08T04:48:51.000Z');
    const recentFrom = new Date(workerNow.getTime() - 90_000);
    expect(recentFrom.toISOString()).toBe('2026-09-08T04:47:21.000Z');
    const pointMs = new Date('2026-09-08T04:47:19.000Z').getTime();
    expect(pointMs).toBeLessThan(recentFrom.getTime());
  });

  it('B: fresh post-boundary motion after telemetry gap resumes', () => {
    const points = [
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

  it('EndContinuityDetector uses possibleEndAt anchor', async () => {
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
});

describe('R10 C/D — end-cycle token stale guards', () => {
  it('C: stale cycle-A token blocked after resume (ACTIVE_TRIP)', () => {
    expect(
      isEndCycleTokenStale({
        jobToken: CYCLE_A,
        expectedToken: null,
        fsmState: TripDetectionState.ACTIVE_TRIP,
      }),
    ).toBe('stale_active_trip');
  });

  it('D: cycle-B finalize not blocked by stale cycle-A token mismatch', () => {
    expect(
      isEndCycleTokenStale({
        jobToken: CYCLE_A,
        expectedToken: CYCLE_B,
        fsmState: TripDetectionState.POSSIBLE_END,
      }),
    ).toBe('stale_token_mismatch');
    expect(
      isEndCycleTokenStale({
        jobToken: CYCLE_B,
        expectedToken: CYCLE_B,
        fsmState: TripDetectionState.POSSIBLE_END,
      }),
    ).toBe('ok');
  });
});

describe('R10 processFinalize — consumer guards + true end completion', () => {
  function buildFinalizeHarness(detOverrides: Record<string, unknown> = {}) {
    const det = baseDet(detOverrides);
    const finalizeTrip = jest.fn().mockResolvedValue({
      id: TRIP_ID,
      tripStatus: TripStatus.COMPLETED,
      endTime: TRUE_END,
    });
    const transitionState = jest.fn().mockResolvedValue({});
    const logTrackingRun = jest.fn().mockResolvedValue(undefined);

    return {
      det,
      finalizeTrip,
      transitionState,
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
              tripStatus: TripStatus.ONGOING,
            }),
          },
          vehicleTripWaypoint: {
            findFirst: jest.fn().mockResolvedValue(null),
            count: jest.fn().mockResolvedValue(10),
          },
        },
        transitionState,
        postFinalizeAnalysisProducer: {
          produceAfterPersistedCompletion: jest.fn().mockResolvedValue(undefined),
        },
        enrichmentOrchestrator: {
          enqueueBehaviorEnrichment: jest.fn().mockResolvedValue(undefined),
        },
        batteryLvRestSessionProducer: {
          enqueueSessionOpenForFinalizedTrip: jest.fn().mockResolvedValue(undefined),
        },
        tripMetrics: {
          tripFinalized: { inc: jest.fn() },
          tripFinalizeLatency: { observe: jest.fn() },
          tripEndLatencyFromMovement: { observe: jest.fn() },
          tripEndRecognitionLatency: { observe: jest.fn() },
          tripEndBoundaryAdjustment: { observe: jest.fn() },
          tripDuration: { observe: jest.fn() },
          tripEvidencePaths: { inc: jest.fn() },
        },
        shutdownEvidenceTripContext: undefined,
        logTripEndTimeline: jest.fn(),
        parseEvidenceTimestamp: jest.fn().mockReturnValue(null),
      },
    };
  }

  it('C: stale cycle-A FINALIZE job aborts after resume (ACTIVE_TRIP)', async () => {
    const h = buildFinalizeHarness({
      state: TripDetectionState.ACTIVE_TRIP,
      possibleEndEnteredAt: null,
      possibleEndAt: null,
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE, { endCycleToken: CYCLE_A }),
    );
    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.logTrackingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resultSummary: expect.objectContaining({
          reason: 'stale_finalize_aborted_active_trip',
        }),
      }),
    );
  });

  it('D: cycle-A job cannot finalize cycle-B episode (token mismatch)', async () => {
    const h = buildFinalizeHarness({
      possibleEndEnteredAt: new Date(CYCLE_B),
      possibleEndAt: new Date('2026-09-08T05:02:15.000Z'),
      cusumSegmentEnd: TRUE_END,
      lastMeaningfulMovementAt: TRUE_END,
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE, { endCycleToken: CYCLE_A }),
    );
    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.logTrackingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resultSummary: expect.objectContaining({
          reason: 'stale_finalize_aborted_end_cycle_mismatch',
        }),
      }),
    );
  });

  it('H: legacy tokenless cycle-A job blocked on cycle-B POSSIBLE_END', async () => {
    const h = buildFinalizeHarness({
      possibleEndEnteredAt: new Date(CYCLE_B),
      possibleEndAt: new Date('2026-09-08T05:02:15.000Z'),
      cusumSegmentEnd: TRUE_END,
      lastMeaningfulMovementAt: TRUE_END,
      lastEvidenceSummary: {
        pendingFinalizeCycleToken: CYCLE_B,
        pendingFinalizeScheduledAt: '2026-09-08T05:17:36.000Z',
      },
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE, {
        requestedAt: '2026-09-08T04:50:08.000Z',
      }),
    );
    expect(h.finalizeTrip).not.toHaveBeenCalled();
    expect(h.logTrackingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        resultSummary: expect.objectContaining({
          reason: 'stale_finalize_aborted_legacy_before_cycle',
        }),
      }),
    );
  });

  it('I: legacy tokenless same-cycle job completes without token', async () => {
    const h = buildFinalizeHarness({
      possibleEndEnteredAt: new Date(CYCLE_B),
      possibleEndAt: new Date('2026-09-08T05:02:15.000Z'),
      cusumSegmentEnd: TRUE_END,
      lastMeaningfulMovementAt: TRUE_END,
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE, {
        requestedAt: '2026-09-08T05:17:36.000Z',
      }),
    );
    expect(h.finalizeTrip).toHaveBeenCalledTimes(1);
    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.objectContaining({ activeTripId: null }),
    );
  });

  it('J: cycle-B completes after legacy cycle-A rejected (A→resume→B sequence)', async () => {
    const staleHarness = buildFinalizeHarness({
      possibleEndEnteredAt: new Date(CYCLE_B),
      possibleEndAt: new Date('2026-09-08T05:02:15.000Z'),
      cusumSegmentEnd: TRUE_END,
      lastMeaningfulMovementAt: TRUE_END,
      lastEvidenceSummary: {
        pendingFinalizeCycleToken: CYCLE_B,
        pendingFinalizeScheduledAt: '2026-09-08T05:17:36.000Z',
      },
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      staleHarness.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE, {
        requestedAt: '2026-09-08T04:50:08.000Z',
      }),
    );
    expect(staleHarness.finalizeTrip).not.toHaveBeenCalled();

    const validHarness = buildFinalizeHarness({
      possibleEndEnteredAt: new Date(CYCLE_B),
      possibleEndAt: new Date('2026-09-08T05:02:15.000Z'),
      cusumSegmentEnd: TRUE_END,
      lastMeaningfulMovementAt: TRUE_END,
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      validHarness.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE, {
        endCycleToken: CYCLE_B,
        requestedAt: '2026-09-08T05:17:36.000Z',
      }),
    );
    expect(validHarness.finalizeTrip).toHaveBeenCalledTimes(1);
  });

  it('E: true end completes with lastMeaningfulMovementAt after possibleEndAt', async () => {
    const h = buildFinalizeHarness({
      possibleEndEnteredAt: new Date(CYCLE_B),
      possibleEndAt: new Date('2026-09-08T05:02:15.000Z'),
      lastMeaningfulMovementAt: TRUE_END,
      cusumSegmentEnd: TRUE_END,
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc,
      jobData(TRIP_TRACKING_TRIGGERS.FINALIZE, { endCycleToken: CYCLE_B }),
    );
    expect(h.finalizeTrip).toHaveBeenCalledWith(
      TRIP_ID,
      expect.objectContaining({ endTime: TRUE_END }),
    );
    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.RESTING,
      expect.objectContaining({ activeTripId: null }),
    );
    expect(h.logTrackingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runType: TripTrackingRunType.FINALIZATION_CHECK,
        resultState: TripDetectionState.RESTING,
      }),
    );
  });

  it('F: duplicate finalize with matching token still commits once under lock (single call)', async () => {
    const h = buildFinalizeHarness({
      possibleEndEnteredAt: new Date(CYCLE_B),
      cusumSegmentEnd: TRUE_END,
    });
    const payload = jobData(TRIP_TRACKING_TRIGGERS.FINALIZE, {
      endCycleToken: CYCLE_B,
    });
    await TripDetectionOrchestrationService.prototype.processFinalize.call(
      h.svc,
      payload,
    );
    expect(h.finalizeTrip).toHaveBeenCalledTimes(1);
  });
});

describe('R10 queue — recycle stale waiting finalize before new cycle', () => {
  it('enqueueEndCycleTripTrackingJob replaces waiting primary job', async () => {
    const removed: string[] = [];
    const added: TripTrackingJobData[] = [];
    const stored = new Map<string, { state: string }>();
    const queue = {
      getJob: jest.fn(async (id: string) => {
        const entry = stored.get(id);
        if (!entry) return undefined;
        return {
          getState: async () => entry.state,
          remove: async () => {
            removed.push(id);
            stored.delete(id);
          },
        };
      }),
      add: jest.fn(async (_name: string, data: TripTrackingJobData, opts: { jobId: string }) => {
        added.push(data);
        stored.set(opts.jobId, { state: 'waiting' });
      }),
    };

    const jobId = `trip-fin-${VEHICLE}-${TRIP_ID}`;
    stored.set(jobId, { state: 'waiting' });
    stored.set(`${jobId}__succ`, { state: 'waiting' });

    await enqueueEndCycleTripTrackingJob({
      queue,
      jobName: 'trip-tracking',
      jobId,
      data: jobData(TRIP_TRACKING_TRIGGERS.FINALIZE, { endCycleToken: CYCLE_B }),
      trigger: TRIP_TRACKING_TRIGGERS.FINALIZE,
    });

    expect(removed).toContain(jobId);
    expect(added).toHaveLength(1);
    expect(added[0].endCycleToken).toBe(CYCLE_B);
  });

  it('G: cancelPendingEndCycleJobs only removes supplied end-cycle ids', async () => {
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

    await cancelPendingTripTrackingJobs({
      queue,
      jobIds: [`trip-fin-${VEHICLE}-${TRIP_ID}`, `trip-ev-${VEHICLE}-${TRIP_ID}`],
    });

    expect(removed.has(`trip-fin-${VEHICLE}-${TRIP_ID}`)).toBe(true);
    expect(removed.has(`trip-ev-${VEHICLE}-${TRIP_ID}`)).toBe(true);
    expect(removed.has(`trip-at-${VEHICLE}-${TRIP_ID}`)).toBe(false);
  });
});

describe('R10 resolveEndCycleToken', () => {
  it('uses possibleEndEnteredAt as stable episode identifier', () => {
    const entered = new Date(CYCLE_B);
    expect(resolveEndCycleToken({ possibleEndEnteredAt: entered })).toBe(CYCLE_B);
    expect(resolveEndCycleToken({ possibleEndEnteredAt: null })).toBeNull();
  });
});

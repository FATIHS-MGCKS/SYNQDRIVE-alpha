import {
  DetectionConfidence,
  TripDetectionState,
  TripStatus,
  TripTrackingRunType,
  VehicleDetectionProfile,
} from '@prisma/client';

import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { TRIP_TRACKING_TRIGGERS } from './trip-detection.types';
import * as tripEvidence from './trip-evidence.helpers';
import {
  resolvePossibleStartConfirmationAnchor,
} from './trip-fsm-clock-contract';
import { buildStartEpisodeRecoveryMeta } from './trip-lifecycle-recovery-meta';

const VEHICLE = 'veh-r3';
const T0 = new Date('2026-09-06T10:00:00.000Z');
const T0_ENTERED = new Date('2026-09-06T10:00:01.000Z');

type Harness = ReturnType<typeof buildPossibleStartHarness>;

function buildPossibleStartHarness(overrides: Record<string, unknown> = {}) {
  const scheduleActiveTick = jest.fn().mockResolvedValue(undefined);
  const schedulePossibleStart = jest.fn().mockResolvedValue(undefined);
  const transitionState = jest.fn().mockResolvedValue({});
  const logTrackingRun = jest.fn().mockResolvedValue(undefined);
  const decisionEngine = {
    createTrip: jest.fn().mockResolvedValue({
      id: 'trip-new',
      startTime: T0,
    }),
    reopenTripForMerge: jest.fn().mockResolvedValue(undefined),
  };
  const batteryTripStartProducer = {
    enqueueStartProxy: jest.fn().mockResolvedValue('battery-job'),
  };

  const det = {
    vehicleId: VEHICLE,
    organizationId: 'org',
    state: TripDetectionState.POSSIBLE_START,
    detectionProfile: VehicleDetectionProfile.ICE,
    possibleStartAt: T0,
    possibleStartEnteredAt: T0_ENTERED,
    activeTripId: null,
    lastEvidenceSummary: {},
    ...((overrides.det as object) ?? {}),
  };

  const svc = {
    logger: { warn: jest.fn(), log: jest.fn(), debug: jest.fn() },
    CONFIRM_MAX_WAIT_MS: 180_000,
    BACKFILL_MS: 60_000,
    tripStartBoundaryMaxLookbackMs: 180_000,
    acquireWorkerLock: jest.fn().mockResolvedValue({ acquired: true, runToken: 'tok' }),
    releaseWorkerLock: jest.fn().mockResolvedValue(undefined),
    getOrCreateDetectionState: jest.fn().mockResolvedValue(det),
    maybeRecoverLifecycleInvariant: jest.fn().mockResolvedValue('continue'),
    logTrackingRun,
    scheduleActiveTick,
    schedulePossibleStart,
    transitionState,
    decisionEngine,
    batteryTripStartProducer,
    fetchAndStoreStartTemperature: jest.fn().mockReturnValue(Promise.resolve()),
    fetchAndStoreInitialRoute: jest.fn().mockReturnValue(Promise.resolve()),
    segments: {
      fetchRawTripCoreData: jest.fn().mockResolvedValue([
        { timestamp: T0, speedKmh: 10 },
        { timestamp: new Date(T0.getTime() + 1000), speedKmh: 12 },
      ]),
    },
    prisma: {
      vehicleLatestState: {
        findUnique: jest.fn().mockResolvedValue({
          isIgnitionOn: true,
          speedKmh: 10,
          updatedAt: T0,
        }),
      },
      vehicleTrip: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    },
    policyResolver: {
      resolve: jest.fn().mockReturnValue({
        detectors: ['StartConfirmationDetector'],
        timeoutMs: 5000,
      }),
    },
    detectorRegistry: {
      runAll: jest.fn().mockResolvedValue([
        {
          detectorName: 'StartConfirmationDetector',
          verdict: 'TRIGGERED',
          confidence: 'HIGH',
          evidence: { mode: 'IGNITION_PRIMARY', summary: { confirmed: true } },
        },
      ]),
    },
    hasClickHouseAnalyticsDetectors: jest.fn().mockReturnValue(false),
    resolveConfirmedStartBoundary: jest.fn().mockResolvedValue({
      startAt: T0,
      source: 'core',
      adjustedMs: 0,
      dimoSegmentId: `v2-${VEHICLE}-${T0.getTime()}`,
    }),
    tripMetrics: {
      tripEvidencePaths: { inc: jest.fn() },
      tripStartsConfirmed: { inc: jest.fn() },
    },
    dimoProviderContext: jest.fn().mockReturnValue({}),
    ...overrides,
  };

  const jobData = {
    vehicleId: VEHICLE,
    organizationId: 'org',
    dimoTokenId: 9,
    trigger: TRIP_TRACKING_TRIGGERS.POSSIBLE_START,
    requestedAt: new Date().toISOString(),
  };

  return {
    svc: svc as unknown as TripDetectionOrchestrationService,
    jobData,
    det,
    scheduleActiveTick,
    schedulePossibleStart,
    transitionState,
    logTrackingRun,
    decisionEngine,
    batteryTripStartProducer,
  };
}

async function runPossibleStart(h: Harness) {
  return TripDetectionOrchestrationService.prototype.processPossibleStart.call(
    h.svc,
    h.jobData,
  );
}

describe('R3 — start liveness ordering', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: new Date('2026-09-06T10:00:30.000Z') });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rethrows provider/runtime exceptions after diagnostic logging', async () => {
    const h = buildPossibleStartHarness();
    (h.svc as any).segments.fetchRawTripCoreData.mockRejectedValue(
      new Error('provider down'),
    );

    await expect(runPossibleStart(h)).rejects.toThrow('provider down');
    expect(h.logTrackingRun).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: 'provider down',
        runType: TripTrackingRunType.POSSIBLE_START_VALIDATION,
      }),
    );
    expect((h.svc as any).releaseWorkerLock).toHaveBeenCalled();
  });

  it('does not mask the original exception when diagnostic logging fails', async () => {
    const h = buildPossibleStartHarness();
    (h.svc as any).segments.fetchRawTripCoreData.mockRejectedValue(
      new Error('provider down'),
    );
    h.logTrackingRun.mockRejectedValue(new Error('audit db unavailable'));

    await expect(runPossibleStart(h)).rejects.toThrow('provider down');
  });

  it('schedules ACTIVE_TICK before Battery start proxy on confirmed new trip', async () => {
    const h = buildPossibleStartHarness();
    const order: string[] = [];
    h.scheduleActiveTick.mockImplementation(async () => {
      order.push('active_tick');
    });
    h.batteryTripStartProducer.enqueueStartProxy.mockImplementation(async () => {
      order.push('battery');
      return 'battery-job';
    });

    await runPossibleStart(h);

    expect(order.indexOf('active_tick')).toBeLessThan(order.indexOf('battery'));
    expect(h.scheduleActiveTick).toHaveBeenCalled();
    expect(h.batteryTripStartProducer.enqueueStartProxy).toHaveBeenCalled();
  });

  it('contains Battery enqueue failure without failing POSSIBLE_START', async () => {
    const h = buildPossibleStartHarness();
    h.batteryTripStartProducer.enqueueStartProxy.mockRejectedValue(
      new Error('battery redis down'),
    );

    await expect(runPossibleStart(h)).resolves.toBeUndefined();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.any(Object),
    );
  });

  it('does not block ACTIVE_TICK when temperature bootstrap rejects', async () => {
    const h = buildPossibleStartHarness();
    (h.svc as any).fetchAndStoreStartTemperature.mockImplementation(() =>
      Promise.reject(new Error('temp provider fail')),
    );

    await runPossibleStart(h);
    expect(h.scheduleActiveTick).toHaveBeenCalled();
  });

  it('does not block ACTIVE_TICK when initial route bootstrap rejects', async () => {
    const h = buildPossibleStartHarness();
    (h.svc as any).fetchAndStoreInitialRoute.mockImplementation(() =>
      Promise.reject(new Error('route provider fail')),
    );

    await runPossibleStart(h);
    expect(h.scheduleActiveTick).toHaveBeenCalled();
  });

  it('merge path schedules ACTIVE_TICK without Battery proxy', async () => {
    const h = buildPossibleStartHarness();
    (h.svc as any).prisma.vehicleTrip.findFirst.mockResolvedValue({
      id: 'trip-merge',
      endTime: new Date(T0.getTime() - 120_000),
    });
    jest.spyOn(tripEvidence, 'checkTripQuality').mockReturnValue({
      shouldDiscard: false,
      shouldMergeWithPrevious: true,
      reason: 'small_gap_merge',
    });

    await runPossibleStart(h);

    expect(h.decisionEngine.reopenTripForMerge).toHaveBeenCalled();
    expect(h.scheduleActiveTick).toHaveBeenCalled();
    expect(h.batteryTripStartProducer.enqueueStartProxy).not.toHaveBeenCalled();
    expect(h.decisionEngine.createTrip).not.toHaveBeenCalled();

    jest.restoreAllMocks();
  });

  it('retains original possibleStartEnteredAt confirmation anchor across retry execution', () => {
    const enteredAt = new Date('2026-09-06T10:00:00.000Z');
    const retryNow = new Date('2026-09-06T10:00:05.000Z');
    const anchor = resolvePossibleStartConfirmationAnchor(
      {
        possibleStartAt: T0,
        possibleStartEnteredAt: enteredAt,
      },
      retryNow,
    );
    expect(anchor).toEqual(enteredAt);
    expect(retryNow.getTime() - anchor.getTime()).toBe(5_000);
  });

  it('invokes R2 early recovery before confirmation on retry after createTrip orphan', async () => {
    const orphanTrip = {
      id: 'trip-orphan',
      tripStatus: TripStatus.ONGOING,
      startTime: T0,
      rawDetectionMeta: {
        lifecycleRecovery: {
          startEpisode: buildStartEpisodeRecoveryMeta({
            vehicleId: VEHICLE,
            candidateStartAt: T0,
            effectiveStartAt: T0,
          }),
        },
      },
    };
    const h = buildPossibleStartHarness();
    const maybeRecover = jest
      .fn()
      .mockResolvedValueOnce('continue')
      .mockResolvedValueOnce('continue')
      .mockResolvedValueOnce('recovered');
    (h.svc as any).maybeRecoverLifecycleInvariant = maybeRecover;
    h.decisionEngine.createTrip.mockResolvedValue({
      id: 'trip-orphan',
      startTime: T0,
    });
    h.transitionState.mockRejectedValueOnce(
      new Error('fsm transition failed after create'),
    );

    await expect(runPossibleStart(h)).rejects.toThrow('fsm transition failed');
    expect(maybeRecover).toHaveBeenCalled();
    expect(h.decisionEngine.createTrip).toHaveBeenCalledTimes(1);

    await runPossibleStart(h);
    expect(maybeRecover.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(h.decisionEngine.createTrip).toHaveBeenCalledTimes(1);
  });

  it('ensures ACTIVE_TICK when retried POSSIBLE_START arrives in ACTIVE_TRIP', async () => {
    const h = buildPossibleStartHarness({
      det: {
        state: TripDetectionState.ACTIVE_TRIP,
        activeTripId: 'trip-live',
        possibleStartAt: T0,
      },
    });

    await runPossibleStart(h);

    expect(h.scheduleActiveTick).toHaveBeenCalledWith(VEHICLE, 'org', 9);
    expect(h.decisionEngine.createTrip).not.toHaveBeenCalled();
    expect(h.transitionState).not.toHaveBeenCalled();
  });

  it('ensures ACTIVE_TICK when retried POSSIBLE_START arrives in IDLE_WITHIN_TRIP', async () => {
    const h = buildPossibleStartHarness({
      det: {
        state: TripDetectionState.IDLE_WITHIN_TRIP,
        activeTripId: 'trip-idle',
      },
    });

    await runPossibleStart(h);

    expect(h.scheduleActiveTick).toHaveBeenCalled();
    expect(h.decisionEngine.createTrip).not.toHaveBeenCalled();
  });

  it('does not handoff ACTIVE_TICK for ACTIVE without activeTripId', async () => {
    const h = buildPossibleStartHarness({
      det: {
        state: TripDetectionState.ACTIVE_TRIP,
        activeTripId: null,
      },
    });

    await runPossibleStart(h);
    expect(h.scheduleActiveTick).not.toHaveBeenCalled();
  });

  it('propagates scheduleActiveTick failure for BullMQ retry', async () => {
    const h = buildPossibleStartHarness();
    h.scheduleActiveTick.mockRejectedValue(new Error('redis enqueue failed'));

    await expect(runPossibleStart(h)).rejects.toThrow('redis enqueue failed');
    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.ACTIVE_TRIP,
      expect.any(Object),
    );
  });

  it('not-confirmed path remains success and schedules delayed follow-up', async () => {
    const h = buildPossibleStartHarness();
    (h.svc as any).detectorRegistry.runAll.mockResolvedValue([
      {
        detectorName: 'StartConfirmationDetector',
        evidence: { summary: { confirmed: false } },
      },
    ]);

    await expect(runPossibleStart(h)).resolves.toBeUndefined();
    expect(h.schedulePossibleStart).toHaveBeenCalledWith(
      VEHICLE,
      'org',
      9,
      30_000,
    );
    expect(h.transitionState).not.toHaveBeenCalled();
  });
});

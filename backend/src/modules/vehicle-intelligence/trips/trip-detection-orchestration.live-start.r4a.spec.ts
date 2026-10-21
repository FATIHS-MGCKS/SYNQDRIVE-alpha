import {
  DetectionConfidence,
  TripDetectionState,
  VehicleDetectionProfile,
} from '@prisma/client';

import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { TripDetectionPolicyResolver } from './policy/trip-detection-policy.resolver';
import { DETECTION_PHASES } from './detectors/detector.interfaces';
import { TRIP_FSM_MAX_FUTURE_SKEW_MS } from './trip-fsm-clock-contract';
import type { SnapshotEvidenceSignals } from './trip-detection.types';

const VEHICLE = 'veh-live-start';
const WORKER_NOW = new Date('2026-09-06T12:00:00.000Z');
const PROVIDER_EVENT = new Date('2026-09-06T11:59:30.000Z');

function buildSignals(
  sourceTimestamp: Date | null | undefined,
  overrides: Partial<SnapshotEvidenceSignals> = {},
): SnapshotEvidenceSignals {
  return {
    isIgnitionOn: true,
    speedKmh: 10,
    engineLoad: 20,
    latitude: 48.1,
    longitude: 11.5,
    odometerKm: 100,
    fuelLevelAbsolute: null,
    evSoc: null,
    tractionBatteryPowerKw: null,
    sourceTimestamp: sourceTimestamp ?? null,
    ...overrides,
  };
}

function buildHarness() {
  const transitionState = jest.fn().mockResolvedValue({});
  const schedulePossibleStart = jest.fn().mockResolvedValue(undefined);
  const runAll = jest.fn().mockResolvedValue([
    {
      detectorName: 'SnapshotEvidenceEvaluator',
      verdict: 'TRIGGERED',
      confidence: 'HIGH',
      evidence: {
        strong: 2,
        weak: 0,
        hasMovement: true,
        reasons: ['ignition ON'],
        mode: 'ignition_primary',
      },
    },
  ]);
  const evaluateStartCandidate = jest.fn().mockReturnValue({
    shouldStart: true,
    confidence: 'HIGH',
    mode: 'ignition_primary',
    reason: 'Candidate evidence: ignition ON',
    findings: [],
  });

  const detState = {
    vehicleId: VEHICLE,
    organizationId: 'org',
    state: TripDetectionState.RESTING,
    detectionProfile: VehicleDetectionProfile.ICE,
    updatedAt: new Date('2020-01-01T00:00:00.000Z'),
    lastEvidenceSummary: null,
  };

  const svc = {
    logger: { log: jest.fn(), debug: jest.fn(), warn: jest.fn() },
    COOLDOWN_AFTER_COMPLETE_MS: 120_000,
    COOLDOWN_AFTER_DISCARD_MS: 30_000,
    COOLDOWN_AFTER_TIMEOUT_MS: 60_000,
    getOrCreateDetectionState: jest.fn().mockResolvedValue(detState),
    policyResolver: new TripDetectionPolicyResolver(),
    detectorRegistry: { runAll },
    decisionEngine: { evaluateStartCandidate },
    transitionState,
    schedulePossibleStart,
    tripMetrics: { tripStartCandidates: { inc: jest.fn() } },
  };

  return {
    svc: svc as unknown as TripDetectionOrchestrationService,
    transitionState,
    schedulePossibleStart,
    runAll,
    evaluateStartCandidate,
  };
}

async function runEvaluate(
  h: ReturnType<typeof buildHarness>,
  current: SnapshotEvidenceSignals,
) {
  return TripDetectionOrchestrationService.prototype.evaluateSnapshotForTripStart.call(
    h.svc,
    VEHICLE,
    42,
    null,
    current,
  );
}

describe('R4A — evaluateSnapshotForTripStart orchestration safety', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('Scenario A — FRESH qualifying snapshot transitions and schedules PS', async () => {
    const h = buildHarness();
    const current = buildSignals(PROVIDER_EVENT);

    const result = await runEvaluate(h, current);

    expect(result.shouldStartTracking).toBe(true);
    expect(h.transitionState).toHaveBeenCalledTimes(1);
    expect(h.transitionState).toHaveBeenCalledWith(
      VEHICLE,
      TripDetectionState.POSSIBLE_START,
      expect.objectContaining({
        possibleStartAt: PROVIDER_EVENT,
        possibleStartEnteredAt: WORKER_NOW,
        lastEvidenceSummary: expect.objectContaining({
          candidateFreshnessState: 'FRESH',
          candidateTimestampSource: 'PROVIDER_EVENT_TIME',
          candidateProviderObservedAt: PROVIDER_EVENT.toISOString(),
        }),
        startConfidence: DetectionConfidence.HIGH,
      }),
    );
    expect(h.schedulePossibleStart).toHaveBeenCalledTimes(1);
    expect(h.schedulePossibleStart).toHaveBeenCalledWith(VEHICLE, 'org', 42);
    expect(h.runAll).toHaveBeenCalledTimes(1);
  });

  it('Scenario B — STALE timestamp blocks transition and queue', async () => {
    const h = buildHarness();
    const staleTs = new Date(WORKER_NOW.getTime() - 120_000);
    const result = await runEvaluate(h, buildSignals(staleTs));

    expect(result.shouldStartTracking).toBe(false);
    expect(h.transitionState).not.toHaveBeenCalled();
    expect(h.schedulePossibleStart).not.toHaveBeenCalled();
    expect(h.runAll).not.toHaveBeenCalled();
  });

  it('Scenario C — MISSING timestamp blocks transition and queue', async () => {
    const h = buildHarness();
    const result = await runEvaluate(h, buildSignals(null));

    expect(result.shouldStartTracking).toBe(false);
    expect(h.transitionState).not.toHaveBeenCalled();
    expect(h.schedulePossibleStart).not.toHaveBeenCalled();
    expect(h.runAll).not.toHaveBeenCalled();
  });

  it('Scenario D — INVALID timestamp beyond future skew blocks with explicit reason', async () => {
    const h = buildHarness();
    const beyondSkew = new Date(
      WORKER_NOW.getTime() + TRIP_FSM_MAX_FUTURE_SKEW_MS + 1,
    );
    const resolveSpy = jest.spyOn(
      (h.svc as any).policyResolver,
      'resolve',
    );
    const result = await runEvaluate(h, buildSignals(beyondSkew));

    expect(result.shouldStartTracking).toBe(false);
    expect(h.transitionState).not.toHaveBeenCalled();
    expect(h.schedulePossibleStart).not.toHaveBeenCalled();
    expect(h.runAll).not.toHaveBeenCalled();
    expect(resolveSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: DETECTION_PHASES.LIVE_START,
        liveStartFreshnessState: 'INVALID_TIMESTAMP',
      }),
    );
    expect(resolveSpy.mock.results[0]?.value.skipReason).toBe(
      'live_start_invalid_provider_timestamp',
    );
    resolveSpy.mockRestore();
  });

  it('Scenario E — future timestamp within R1 skew allows candidate path', async () => {
    const h = buildHarness();
    const withinSkew = new Date(WORKER_NOW.getTime() + 30_000);
    const result = await runEvaluate(h, buildSignals(withinSkew));

    expect(result.shouldStartTracking).toBe(true);
    expect(h.transitionState).toHaveBeenCalledTimes(1);
    expect(h.schedulePossibleStart).toHaveBeenCalledTimes(1);
    expect(h.runAll).toHaveBeenCalledTimes(1);
    expect(h.transitionState.mock.calls[0][2].possibleStartAt).toEqual(
      withinSkew,
    );
    expect(h.transitionState.mock.calls[0][2].possibleStartEnteredAt).toEqual(
      WORKER_NOW,
    );
    expect(
      h.transitionState.mock.calls[0][2].lastEvidenceSummary
        .candidateFreshnessState,
    ).toBe('FRESH');
  });
});

import { TripDetectionState, VehicleDetectionProfile } from '@prisma/client';

import { TripDetectionOrchestrationService } from './trip-detection-orchestration.service';
import { TripDetectionPolicyResolver } from './policy/trip-detection-policy.resolver';
import { buildSnapshotWakeContext } from '@workers/snapshot-wake/snapshot-wake.util';

const VEHICLE = 'veh-r9a-cooldown';
const WORKER_NOW = new Date('2026-09-07T14:01:00.000Z');
const REST_ANCHOR = new Date('2026-09-07T14:00:00.000Z');
const WAKE_AT = new Date('2026-09-07T14:00:20.000Z');
const SNAPSHOT_AT = new Date('2026-09-07T14:00:21.000Z');

function buildHarness(lastRestingReason: string) {
  const transitionState = jest.fn().mockResolvedValue({});
  const schedulePossibleStart = jest.fn().mockResolvedValue(undefined);
  const runAll = jest.fn().mockResolvedValue([
    {
      detectorName: 'SnapshotEvidenceEvaluator',
      verdict: 'TRIGGERED',
      confidence: 'HIGH',
      evidence: { strong: 2, weak: 0, hasMovement: true, reasons: ['speed'], mode: 'speed_primary' },
    },
  ]);
  const evaluateStartCandidate = jest.fn().mockReturnValue({
    shouldStart: true,
    confidence: 'HIGH',
    mode: 'speed_primary',
    reason: 'Candidate evidence',
    findings: [],
  });

  const detState = {
    vehicleId: VEHICLE,
    organizationId: 'org',
    state: TripDetectionState.RESTING,
    detectionProfile: VehicleDetectionProfile.ICE,
    updatedAt: REST_ANCHOR,
    lastActivityAt: REST_ANCHOR,
    lastEvidenceSummary: { lastRestingReason },
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
  };
}

describe('R9A — trusted complete cooldown bypass orchestration', () => {
  beforeEach(() => {
    jest.useFakeTimers({ now: WORKER_NOW });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const wakeContext = buildSnapshotWakeContext({
    reason: 'SPEED_MOVEMENT',
    signalName: 'speed',
    providerObservedAt: WAKE_AT,
    receivedAt: WORKER_NOW,
  });

  it('blocks complete RESTING cooldown on ordinary scheduled snapshot', async () => {
    const h = buildHarness('complete');
    const result = await TripDetectionOrchestrationService.prototype.evaluateSnapshotForTripStart.call(
      h.svc,
      VEHICLE,
      42,
      null,
      {
        isIgnitionOn: true,
        speedKmh: 10,
        engineLoad: 20,
        latitude: 48.1,
        longitude: 11.5,
        odometerKm: 100,
        fuelLevelAbsolute: null,
        evSoc: null,
        tractionBatteryPowerKw: null,
        sourceTimestamp: SNAPSHOT_AT,
      },
    );

    expect(result.shouldStartTracking).toBe(false);
    expect(h.transitionState).not.toHaveBeenCalled();
  });

  it('bypasses complete cooldown for fresh DIMO wake with caught-up snapshot', async () => {
    const h = buildHarness('complete');
    const result = await TripDetectionOrchestrationService.prototype.evaluateSnapshotForTripStart.call(
      h.svc,
      VEHICLE,
      42,
      null,
      {
        isIgnitionOn: true,
        speedKmh: 10,
        engineLoad: 20,
        latitude: 48.1,
        longitude: 11.5,
        odometerKm: 100,
        fuelLevelAbsolute: null,
        evSoc: null,
        tractionBatteryPowerKw: null,
        sourceTimestamp: SNAPSHOT_AT,
      },
      { wakeContext, snapshotFetchedAt: WORKER_NOW },
    );

    expect(result.shouldStartTracking).toBe(true);
    expect(h.transitionState).toHaveBeenCalled();
    expect(h.runAll).toHaveBeenCalled();
  });

  it('does not bypass when snapshot is behind wake event', async () => {
    const h = buildHarness('complete');
    const result = await TripDetectionOrchestrationService.prototype.evaluateSnapshotForTripStart.call(
      h.svc,
      VEHICLE,
      42,
      null,
      {
        isIgnitionOn: true,
        speedKmh: 10,
        engineLoad: 20,
        latitude: 48.1,
        longitude: 11.5,
        odometerKm: 100,
        fuelLevelAbsolute: null,
        evSoc: null,
        tractionBatteryPowerKw: null,
        sourceTimestamp: new Date('2026-09-07T14:00:10.000Z'),
      },
      { wakeContext, snapshotFetchedAt: WORKER_NOW },
    );

    expect(result.shouldStartTracking).toBe(false);
    expect(h.transitionState).not.toHaveBeenCalled();
  });

  it('never bypasses discard cooldown', async () => {
    const h = buildHarness('discard');
    (h.svc as unknown as { getOrCreateDetectionState: jest.Mock }).getOrCreateDetectionState.mockResolvedValue({
      vehicleId: VEHICLE,
      organizationId: 'org',
      state: TripDetectionState.RESTING,
      detectionProfile: VehicleDetectionProfile.ICE,
      updatedAt: new Date('2026-09-07T14:00:50.000Z'),
      lastActivityAt: REST_ANCHOR,
      lastEvidenceSummary: { lastRestingReason: 'discard' },
    });

    const result = await TripDetectionOrchestrationService.prototype.evaluateSnapshotForTripStart.call(
      h.svc,
      VEHICLE,
      42,
      null,
      {
        isIgnitionOn: true,
        speedKmh: 10,
        engineLoad: 20,
        latitude: 48.1,
        longitude: 11.5,
        odometerKm: 100,
        fuelLevelAbsolute: null,
        evSoc: null,
        tractionBatteryPowerKw: null,
        sourceTimestamp: SNAPSHOT_AT,
      },
      { wakeContext, snapshotFetchedAt: WORKER_NOW },
    );

    expect(result.shouldStartTracking).toBe(false);
    expect(h.transitionState).not.toHaveBeenCalled();
  });
});

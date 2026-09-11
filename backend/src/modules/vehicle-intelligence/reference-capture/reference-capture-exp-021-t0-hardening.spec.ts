import {
  assertCandidateMatchesPersistedT0,
  buildExp021PhysicalAuthority,
  classifyOrchestratorFailure,
  Exp021PhaseIdentityConflictError,
  Exp021T0ConsistencyError,
  isLatePlus30MisclassifiedAsActualPlus30,
  parseExp021PhysicalAuthority,
} from './reference-capture-exp-021-physical-authority.lib';
import {
  isPhaseEligibleForPhysicalSettlement,
  reanchorPhysicalCalibrationPhaseAtT0,
  requestHfCalibrationPhase,
  switchHfCalibrationPhase,
} from './reference-capture-hf-calibration-phase.policy';
import { parseHfRecoveryPolicyV2ConfigFromEnv } from './reference-capture-hf-recovery-v2.policy';
import { EXP021_LEGACY_CADENCE_PHASE_ORDER_MS } from './reference-capture-exp021-calibration-plan.lib';
import {
  PhysicalDrivePhaseTracker,
  PhysicalEndDetector,
  PhysicalStartDetector,
  parseSpeedSampleFromSignalsLatest,
} from './reference-capture-exp-021-motion.lib';

describe('EXP-021 T0 / phase / settlement hardening', () => {
  const vehicleId = 'veh-exp021';
  const tokenId = 187361;
  const t0Ms = Date.parse('2026-09-10T05:42:11.000Z');
  const HF_POLICY = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_HISTORICAL_POLL_INTERVAL_MS: '60000',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
  });

  function sample(atMs: number, speed: number) {
    return parseSpeedSampleFromSignalsLatest(
      { speed: { timestamp: new Date(atMs).toISOString(), value: speed } },
      atMs,
    );
  }

  it('scenario A: PRE_ROLL phase 60 is not physical settlement eligible', () => {
    const { series } = requestHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 60000,
      nowMs: t0Ms - 30 * 60_000,
      phaseProvenance: 'PRE_ROLL',
    });
    expect(isPhaseEligibleForPhysicalSettlement(series.activePhase)).toBe(false);
  });

  it('scenario B: stale telemetry then fresh movement confirms T0', () => {
    const detector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 4,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
      confirmationWindowMs: 300_000,
      sustainedParkingResetMs: 90_000,
    });
    detector.reset();
    const wakeAt = t0Ms;
    for (const offset of [0, 15, 30, 45]) {
      detector.record(sample(wakeAt + offset * 1000, 20), wakeAt + offset * 1000, 'MOVING');
    }
    expect(detector.isConfirmed()).toBe(true);
  });

  it('scenario C: legacy pre-roll 60s re-anchors at T0 without duplicate fatal', () => {
    const preRoll = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 60000,
      nowMs: t0Ms - 35 * 60_000,
      phaseProvenance: 'PRE_ROLL',
    }).series;
    const reanchored = reanchorPhysicalCalibrationPhaseAtT0({
      existing: preRoll,
      vehicleId,
      tokenId,
      canonicalT0Ms: t0Ms,
      effectivePollIntervalMs: 60000,
      hfPolicy: HF_POLICY,
      nowMs: t0Ms + 1000,
    });
    expect(reanchored.reanchored).toBe(true);
    expect(reanchored.activePhase.phaseProvenance).toBe('PHYSICAL_T0');
    expect(reanchored.activePhase.phaseStartedAt).toBe(new Date(t0Ms).toISOString());
    expect(isPhaseEligibleForPhysicalSettlement(reanchored.activePhase)).toBe(true);
    expect(() =>
      requestHfCalibrationPhase({
        existing: preRoll,
        vehicleId,
        tokenId,
        effectivePollIntervalMs: 60000,
        nowMs: t0Ms,
        phaseProvenance: 'PHYSICAL_T0',
      }),
    ).toThrow(/matches current effective phase/);
  });

  it('scenario D: idempotent reanchor when physical 60 already active at T0', () => {
    const first = reanchorPhysicalCalibrationPhaseAtT0({
      existing: null,
      vehicleId,
      tokenId,
      canonicalT0Ms: t0Ms,
      effectivePollIntervalMs: 60000,
      hfPolicy: HF_POLICY,
      nowMs: t0Ms,
    });
    const second = reanchorPhysicalCalibrationPhaseAtT0({
      existing: first.series,
      vehicleId,
      tokenId,
      canonicalT0Ms: t0Ms,
      effectivePollIntervalMs: 60000,
      hfPolicy: HF_POLICY,
      nowMs: t0Ms + 1000,
    });
    expect(second.reanchored).toBe(false);
    expect(second.activePhase.calibrationPhaseId).toBe(first.activePhase.calibrationPhaseId);
  });

  it('scenario E-F: cadence 60->30->20->10 reachable after T0', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    const required = 60_000;
    let now = t0Ms;
    for (let i = 0; i < EXP021_LEGACY_CADENCE_PHASE_ORDER_MS.length; i += 1) {
      tracker.beginPhase(EXP021_LEGACY_CADENCE_PHASE_ORDER_MS[i], now, {
        mode: 'MOVING_ACCUMULATION',
        requiredMovementMs: required,
      });
      for (let tick = 0; tick < 10; tick += 1) {
        now += 10_000;
        tracker.tick(tick % 3 !== 2 ? 'MOVING' : 'PARKED_CANDIDATE', now);
      }
      for (let tick = 0; tick < 8; tick += 1) {
        now += 10_000;
        tracker.tick('MOVING', now);
      }
      if (i < EXP021_LEGACY_CADENCE_PHASE_ORDER_MS.length - 1) {
        tracker.advancePhaseAtEffectiveBoundary(now, EXP021_LEGACY_CADENCE_PHASE_ORDER_MS[i + 1], {
          mode: 'MOVING_ACCUMULATION',
          requiredMovementMs: required,
        });
      }
    }
    tracker.markPhysicalDriveEnded(now);
    expect(tracker.computeRunCompleteness(4)).toBe('FULL');
  });

  it('scenario G-H: late +30 execution is not scientific +30 actual-age bucket', () => {
    expect(
      isLatePlus30MisclassifiedAsActualPlus30({
        scheduledAgeMs: 30_000,
        actualAgeMs: 231_000,
      }),
    ).toBe(true);
    expect(
      isLatePlus30MisclassifiedAsActualPlus30({
        scheduledAgeMs: 30_000,
        actualAgeMs: 32_000,
      }),
    ).toBe(false);
  });

  it('scenario I: orchestration failure classified separately from lock loss', () => {
    expect(
      classifyOrchestratorFailure(new Error('Requested calibration phase 60000ms matches current effective phase')),
    ).toBe('recoverable_orchestration');
    expect(classifyOrchestratorFailure(new Error('orchestrator lock lease lost — fail closed'))).toBe(
      'integrity_fatal',
    );
  });

  it('scenario J: lock loss is integrity fail-closed', () => {
    expect(classifyOrchestratorFailure(new Error('competing orchestrator instance holds lock'))).toBe(
      'integrity_fatal',
    );
  });

  it('unknown errors default to integrity_fatal (fail closed)', () => {
    expect(classifyOrchestratorFailure(new Error('unexpected internal state'))).toBe('integrity_fatal');
  });

  it('transient provider errors are classified separately', () => {
    expect(classifyOrchestratorFailure(new Error('fetch failed with status code 503'))).toBe(
      'transient_provider',
    );
  });

  it('canonical T0 is immutable once persisted', () => {
    const persisted = buildExp021PhysicalAuthority({
      firstQualifyingMovementAt: new Date(t0Ms),
      startConfirmedAt: new Date(t0Ms + 1000),
      persistedAtMs: t0Ms + 1000,
    });
    expect(() =>
      assertCandidateMatchesPersistedT0({
        persistedCanonicalT0At: persisted.canonicalT0At,
        candidateFirstQualifyingMovementAt: new Date(t0Ms + 60_000),
      }),
    ).toThrow(Exp021T0ConsistencyError);
  });

  it('reanchor rejects PHYSICAL_T0 with different canonical T0', () => {
    const first = reanchorPhysicalCalibrationPhaseAtT0({
      existing: null,
      vehicleId,
      tokenId,
      canonicalT0Ms: t0Ms,
      effectivePollIntervalMs: 60000,
      hfPolicy: HF_POLICY,
      nowMs: t0Ms,
    });
    expect(() =>
      reanchorPhysicalCalibrationPhaseAtT0({
        existing: first.series,
        vehicleId,
        tokenId,
        canonicalT0Ms: t0Ms + 60_000,
        effectivePollIntervalMs: 60000,
        hfPolicy: HF_POLICY,
        nowMs: t0Ms + 60_000,
      }),
    ).toThrow(Exp021PhaseIdentityConflictError);
  });

  it('reanchor rejects PRE_ROLL phaseStartedAt after canonical T0', () => {
    const preRoll = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 60000,
      nowMs: t0Ms + 60_000,
      phaseProvenance: 'PRE_ROLL',
    }).series;
    expect(() =>
      reanchorPhysicalCalibrationPhaseAtT0({
        existing: preRoll,
        vehicleId,
        tokenId,
        canonicalT0Ms: t0Ms,
        effectivePollIntervalMs: 60000,
        hfPolicy: HF_POLICY,
        nowMs: t0Ms + 120_000,
      }),
    ).toThrow(Exp021PhaseIdentityConflictError);
  });

  it('T0 authority persists in preflight and survives parse round-trip', () => {
    const authority = buildExp021PhysicalAuthority({
      firstQualifyingMovementAt: new Date(t0Ms),
      startConfirmedAt: new Date(t0Ms + 1000),
      persistedAtMs: t0Ms + 1000,
    });
    const preflight = { exp021PhysicalAuthority: authority };
    const parsed = parseExp021PhysicalAuthority(preflight);
    expect(parsed?.canonicalT0At).toBe(authority.canonicalT0At);
    expect(parsed?.orchestrationState).toBe('T0_CONFIRMED');
  });

  it('full operator journey simulation', () => {
    const deployAt = Date.parse('2026-09-10T05:03:51.152Z');
    const detector = new PhysicalStartDetector({
      movementSpeedKmh: 8,
      minDistinctFreshSamples: 4,
      minDistinctTimestamps: 3,
      maxSampleAgeMs: 120_000,
      confirmationWindowMs: 300_000,
      sustainedParkingResetMs: 90_000,
    });
    detector.reset();

    let series = switchHfCalibrationPhase({
      existing: null,
      vehicleId,
      tokenId,
      effectivePollIntervalMs: 60000,
      nowMs: deployAt + 3 * 60_000,
      phaseProvenance: 'PRE_ROLL',
    }).series;

    const wakeAt = deployAt + 38 * 60_000;
    for (const offset of [0, 15, 30, 45]) {
      const at = wakeAt + offset * 1000;
      detector.record(sample(at, 20), at, 'MOVING');
    }
    expect(detector.isConfirmed()).toBe(true);
    const confirmation = detector.getConfirmation()!;

    const authority = buildExp021PhysicalAuthority({
      firstQualifyingMovementAt: confirmation.firstQualifyingMovementAt,
      startConfirmedAt: confirmation.startConfirmedAt,
      persistedAtMs: confirmation.startConfirmedAt.getTime(),
    });
    expect(parseExp021PhysicalAuthority({ exp021PhysicalAuthority: authority })).not.toBeNull();

    series = reanchorPhysicalCalibrationPhaseAtT0({
      existing: series,
      vehicleId,
      tokenId,
      canonicalT0Ms: confirmation.firstQualifyingMovementAt.getTime(),
      effectivePollIntervalMs: 60000,
      hfPolicy: HF_POLICY,
      nowMs: confirmation.startConfirmedAt.getTime(),
    }).series;

    const tracker = new PhysicalDrivePhaseTracker();
    const endDetector = new PhysicalEndDetector({
      parkedSpeedKmh: 3,
      movementSpeedKmh: 8,
      provisionalConfirmMs: 2_000,
      finalParkedMs: 10_000,
      maxSampleAgeMs: 120_000,
      minDistinctParkedSamples: 2,
    });
    let now = confirmation.startConfirmedAt.getTime();
    for (let i = 0; i < EXP021_LEGACY_CADENCE_PHASE_ORDER_MS.length; i += 1) {
      tracker.beginPhase(EXP021_LEGACY_CADENCE_PHASE_ORDER_MS[i], now, {
        mode: 'MOVING_ACCUMULATION',
        requiredMovementMs: 60_000,
      });
      for (let tick = 0; tick < 10; tick += 1) {
        now += 10_000;
        tracker.tick(tick % 3 !== 2 ? 'MOVING' : 'PARKED_CANDIDATE', now);
      }
      for (let tick = 0; tick < 8; tick += 1) {
        now += 10_000;
        tracker.tick('MOVING', now);
      }
      if (i < EXP021_LEGACY_CADENCE_PHASE_ORDER_MS.length - 1) {
        tracker.advancePhaseAtEffectiveBoundary(now, EXP021_LEGACY_CADENCE_PHASE_ORDER_MS[i + 1], {
          mode: 'MOVING_ACCUMULATION',
          requiredMovementMs: 60_000,
        });
      }
    }
    tracker.markPhysicalDriveEnded(now);
    endDetector.observe(sample(now + 5_000, 0), 'PARKED_CANDIDATE', now + 5_000);
    endDetector.observe(sample(now + 20_000, 0), 'PARKED_CANDIDATE', now + 20_000);
    const end = endDetector.observe(sample(now + 25_000, 0), 'UNKNOWN', now + 30_000);

    expect(series.activePhase?.phaseProvenance).toBe('PHYSICAL_T0');
    expect(tracker.computeRunCompleteness(4)).toBe('FULL');
    expect(end.shouldAutoStop).toBe(true);
    expect(confirmation.firstQualifyingMovementAt.getTime()).toBeGreaterThanOrEqual(deployAt);
  });
});

/**
 * EXP-021 false physical-end correction — deterministic fake-clock reproductions.
 */
import {
  finalizeCalibrationOnPhysicalEndEarly,
  finalizePhaseSummary,
  emptyPhaseCounters,
} from './reference-capture-hf-calibration-phase.policy';
import {
  buildPhaseAdvancementConfig,
  EXP021_UPPER_BOUND_V2,
} from './reference-capture-exp021-calibration-plan.lib';
import {
  parseSpeedSampleFromSignalsLatest,
  PhysicalDrivePhaseTracker,
  PhysicalEndDetector,
} from './reference-capture-exp-021-motion.lib';
import {
  resolvePhysicalEndSealMs,
  shouldSkipActivePhaseOnPhysicalEndEarly,
} from './reference-capture-exp-021-physical-authority.lib';
import {
  buildExp021RequestSlotsForPhase,
  markRequestSlotIssued,
} from './reference-capture-exp021-request-slots.lib';
import { REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS } from './reference-capture-settlement-shadow.constants';

function speedSample(speedKmh: number, atMs: number, ts?: string) {
  const timestamp = ts ?? new Date(atMs).toISOString();
  return parseSpeedSampleFromSignalsLatest(
    { speed: { timestamp, value: speedKmh } },
    atMs,
  );
}

describe('EXP-021 false physical-end correction', () => {
  const pdiBoundaryMs = Date.parse('2026-09-11T20:05:08.000Z');
  const phase60StartMs = Date.parse('2026-09-11T20:07:32.719Z');
  const confirmMs = Date.parse('2026-09-11T20:07:34.929Z');

  function makeDetector() {
    return new PhysicalEndDetector({
      parkedSpeedKmh: 3,
      movementSpeedKmh: 8,
      provisionalConfirmMs: 120_000,
      finalParkedMs: 600_000,
      maxSampleAgeMs: 120_000,
      minDistinctParkedSamples: 2,
    });
  }

  it('BASE_FALSE_END_REPRODUCED: provisional CONFIRMED alone does not hard-end', () => {
    const detector = makeDetector();
    let now = pdiBoundaryMs + 15_000;
    detector.observe(speedSample(0, now, '2026-09-11T20:05:08.000Z'), 'PARKED_CANDIDATE', now);
    detector.observe(speedSample(0, now + 15_000, '2026-09-11T20:05:23.000Z'), 'PARKED_CANDIDATE', now + 15_000);

    now = confirmMs;
    const parked = speedSample(0, now, '2026-09-11T20:07:14.000Z');
    const obs = detector.observe(parked, 'PARKED_CANDIDATE', now);
    expect(detector.getCandidate()?.candidateStatus).toBe('CONFIRMED');
    expect(obs.candidateConfirmed).toBe(true);
    expect(obs.shouldAutoStop).toBe(false);
    expect(detector.hardPhysicalEndEligible(now, 'PARKED_CANDIDATE')).toBe(false);

    const physicalEndEarlyWouldTrigger =
      detector.getCandidate()?.candidateStatus === 'CONFIRMED' &&
      (detector.getCandidate()?.candidateBoundaryAt.getTime() ?? 0) <= now;
    expect(physicalEndEarlyWouldTrigger).toBe(true);
    expect(obs.shouldAutoStop).toBe(false);
  });

  it('NEGATIVE_WALL_DURATION_REPRODUCED: boundary race sealed without negative duration', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    tracker.beginPhase(60_000, phase60StartMs, {
      mode: 'WALL_CLOCK',
      targetWallDurationMs: 10 * 60_000,
    });

    const naiveSeal = tracker.markPhysicalDriveEnded(pdiBoundaryMs);
    expect(naiveSeal).not.toBeNull();
    expect(naiveSeal!.phaseStartedAtMs).toBe(phase60StartMs);
    expect(naiveSeal!.phaseEndedAtMs).toBeGreaterThanOrEqual(naiveSeal!.phaseStartedAtMs);
    expect(naiveSeal!.wallDurationMs).toBeGreaterThanOrEqual(0);

    expect(
      shouldSkipActivePhaseOnPhysicalEndEarly({
        physicalEndMs: pdiBoundaryMs,
        activePhaseStartedAtMs: phase60StartMs,
      }),
    ).toBe(true);

    const result = finalizeCalibrationOnPhysicalEndEarly({
      series: {
        calibrationSeriesId: 'series',
        vehicleId: 'vehicle',
        tokenId: 187361,
        phaseOrder: [180_000, 120_000, 60_000, 30_000],
        activePhase: {
          calibrationPhaseId: 'phase-60',
          phaseSequence: 3,
          effectivePollIntervalMs: 60_000,
          phaseStartedAt: new Date(phase60StartMs).toISOString(),
          phaseEndedAt: null,
          phaseProvenance: 'PHYSICAL_TRANSITION',
          canonicalT0At: new Date(Date.parse('2026-09-11T19:42:19.000Z')).toISOString(),
        },
        completedPhases: [],
        completedPhaseSummaries: [],
        pendingPhaseRequest: null,
        cancelledPhaseRequests: [],
        terminalFinalizationAt: null,
        lastPhaseBoundaryAt: null,
        seriesStartedAt: new Date(Date.parse('2026-09-11T19:42:19.000Z')).toISOString(),
        controlPlaneRevision: 1,
      },
      counters: emptyPhaseCounters('phase-60'),
      physicalEndMs: pdiBoundaryMs,
      plan: EXP021_UPPER_BOUND_V2,
    });

    expect(result.applied).toBe(true);
    const sealed60 = result.series?.completedPhases.find((p) => p.effectivePollIntervalMs === 60_000);
    expect(sealed60).toBeUndefined();
    expect(result.series?.skippedPhasePlans?.map((p) => p.cadenceMs)).toContain(60_000);
    expect(result.series?.skippedPhasePlans?.map((p) => p.cadenceMs)).toContain(30_000);
  });

  it('150s temporary urban stop then movement resumes => NO run terminalization', () => {
    const detector = makeDetector();
    let now = pdiBoundaryMs;
    detector.observe(speedSample(0, now, '2026-09-11T20:05:08.000Z'), 'PARKED_CANDIDATE', now);
    detector.observe(speedSample(0, now + 22_000, '2026-09-11T20:05:30.000Z'), 'PARKED_CANDIDATE', now + 22_000);

    now += 150_000;
    const confirmed = detector.observe(
      speedSample(0, now, '2026-09-11T20:07:14.000Z'),
      'PARKED_CANDIDATE',
      now,
    );
    expect(confirmed.candidateConfirmed).toBe(true);
    expect(confirmed.shouldAutoStop).toBe(false);

    const resumed = detector.observe(
      speedSample(25, now + 10_000, '2026-09-11T20:07:40.000Z'),
      'MOVING',
      now + 10_000,
    );
    expect(resumed.candidateInvalidated).toBe(true);
    expect(detector.getCandidate()?.candidateStatus).toBe('INVALIDATED');
    expect(detector.hardPhysicalEndEligible(now + 10_000, 'MOVING')).toBe(false);
  });

  it('UNKNOWN telemetry after short parked period => NO premature early terminalization', () => {
    const detector = makeDetector();
    const now = pdiBoundaryMs;
    detector.observe(speedSample(0, now, '2026-09-11T20:05:08.000Z'), 'PARKED_CANDIDATE', now);
    const unknownStop = detector.observe(speedSample(0, now + 30_000), 'UNKNOWN', now + 30_000);
    expect(unknownStop.shouldAutoStop).toBe(false);
    expect(detector.hardPhysicalEndEligible(now + 30_000, 'UNKNOWN')).toBe(false);
  });

  it('STRONG_PARKED_THEN_UNKNOWN_TERMINATES: CONFIRMED + UNKNOWN never hard-ends', () => {
    const detector = makeDetector();
    const t0 = Date.parse('2026-09-11T12:00:00.000Z');

    detector.observe(speedSample(25, t0 - 60_000, '2026-09-11T11:59:00.000Z'), 'MOVING', t0 - 60_000);
    detector.observe(speedSample(0, t0, '2026-09-11T12:00:00.000Z'), 'PARKED_CANDIDATE', t0);
    detector.observe(
      speedSample(0, t0 + 20_000, '2026-09-11T12:00:20.000Z'),
      'PARKED_CANDIDATE',
      t0 + 20_000,
    );

    const confirmedAt = t0 + 150_000;
    const confirmed = detector.observe(
      speedSample(0, confirmedAt, '2026-09-11T12:02:30.000Z'),
      'PARKED_CANDIDATE',
      confirmedAt,
    );
    expect(confirmed.candidateConfirmed).toBe(true);
    expect(detector.getCandidate()?.candidateStatus).toBe('CONFIRMED');

    const unknownStart = t0 + 160_000;
    detector.observe(speedSample(0, unknownStart), 'UNKNOWN', unknownStart);

    for (const offsetMs of [200_000, 400_000, 600_000, 700_000]) {
      const at = t0 + offsetMs;
      const obs = detector.observe(speedSample(0, at), 'UNKNOWN', at);
      expect(detector.hardPhysicalEndEligible(at, 'UNKNOWN')).toBe(false);
      expect(obs.shouldAutoStop).toBe(true);
    }

    const movingAt = t0 + 710_000;
    const resumed = detector.observe(
      speedSample(25, movingAt, '2026-09-11T12:11:50.000Z'),
      'MOVING',
      movingAt,
    );
    expect(resumed.candidateInvalidated).toBe(true);
    expect(detector.getCandidate()?.candidateStatus).toBe('INVALIDATED');
    expect(detector.hardPhysicalEndEligible(movingAt, 'MOVING')).toBe(false);
  });

  it('genuine sustained hard parked evidence => truthful early-end terminalization', () => {
    const detector = makeDetector();
    let now = pdiBoundaryMs;
    detector.observe(speedSample(0, now, '2026-09-11T20:05:08.000Z'), 'PARKED_CANDIDATE', now);
    detector.observe(speedSample(0, now + 22_000, '2026-09-11T20:05:30.000Z'), 'PARKED_CANDIDATE', now + 22_000);

    now += 600_000;
    const hardEnd = detector.observe(
      speedSample(0, now, '2026-09-11T20:15:08.000Z'),
      'PARKED_CANDIDATE',
      now,
    );
    expect(hardEnd.shouldAutoStop).toBe(true);
    expect(detector.hardPhysicalEndEligible(now, 'PARKED_CANDIDATE')).toBe(true);
  });

  it('request slot ledger persists into phase summary', () => {
    const t0Ms = Date.parse('2026-09-11T19:42:19.000Z');
    const slots = buildExp021RequestSlotsForPhase({
      phaseEffectiveStartMs: t0Ms,
      cadenceMs: 180_000,
      phaseDurationMs: 15 * 60_000,
    });
    const issued = markRequestSlotIssued(slots, t0Ms).slots;
    const counters = {
      ...emptyPhaseCounters('phase-180'),
      exp021RequestSlots: issued,
      nativeFastLoopRequestCount: 1,
      nativeFastLoopProviderSuccessCount: 1,
    };
    const summary = finalizePhaseSummary({
      phase: {
        calibrationPhaseId: 'phase-180',
        phaseSequence: 1,
        effectivePollIntervalMs: 180_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(t0Ms + 900_000).toISOString(),
        phaseProvenance: 'PHYSICAL_T0',
        canonicalT0At: new Date(t0Ms).toISOString(),
        effectiveConfig: {
          calibrationSeriesId: 'series',
          calibrationPhaseId: 'phase-180',
          phaseSequence: 1,
          vehicleId: 'vehicle',
          tokenId: 187361,
          effectivePollIntervalMs: 180_000,
          settlementDelayMs: 8000,
          recoveryOverlapMs: 6000,
          policyVersion: 'HF_RECOVERY_V2_2026-09-04',
          policyMode: 'V2',
          effectiveAt: new Date(t0Ms).toISOString(),
        },
      },
      counters,
      phaseEndedAtMs: t0Ms + 900_000,
    });
    expect(summary.exp021RequestSlots?.length).toBe(5);
    expect(summary.exp021RequestSlots?.[0]?.status).toBe('ISSUED');
  });

  it('resolvePhysicalEndSealMs avoids boundary before active phase start', () => {
    expect(
      resolvePhysicalEndSealMs({
        nowMs: confirmMs,
        physicalEndBoundaryMs: pdiBoundaryMs,
        activePhaseStartedAtMs: phase60StartMs,
      }),
    ).toBe(confirmMs);
  });

  it('settlement experiment COMPLETED status is defined', () => {
    expect(REFERENCE_CAPTURE_SETTLEMENT_SHADOW_EXPERIMENT_STATUS.COMPLETED).toBe('COMPLETED');
  });

  it('FINAL_PHASE_WALL_CLOCK_TERMINATES independently of physical-end detector', () => {
    const t0Ms = Date.parse('2026-09-11T19:42:19.000Z');
    const phase30 = EXP021_UPPER_BOUND_V2.phases[3];
    const tracker = new PhysicalDrivePhaseTracker();
    tracker.beginPhase(
      phase30.cadenceMs,
      t0Ms,
      buildPhaseAdvancementConfig(EXP021_UPPER_BOUND_V2, phase30),
    );
    const endMs = t0Ms + phase30.targetDurationMs;
    expect(tracker.shouldAdvancePhase(endMs)).toBe(true);
    const sealed = tracker.sealActivePhaseAtBoundary(endMs, 'ADVANCE');
    expect(sealed?.phaseCompletion).toBe('SATISFIED');
    expect(sealed!.wallDurationMs).toBeGreaterThanOrEqual(0);
  });

  describe('EXP-021 hard-end contract gates', () => {
    it('PROVISIONAL_CONFIRMED_ONLY_TERMINATES = NO', () => {
      const detector = makeDetector();
      let now = pdiBoundaryMs;
      detector.observe(speedSample(0, now, '2026-09-11T20:05:08.000Z'), 'PARKED_CANDIDATE', now);
      detector.observe(speedSample(0, now + 22_000, '2026-09-11T20:05:30.000Z'), 'PARKED_CANDIDATE', now + 22_000);
      now += 150_000;
      detector.observe(speedSample(0, now, '2026-09-11T20:07:38.000Z'), 'PARKED_CANDIDATE', now);
      expect(detector.getCandidate()?.candidateStatus).toBe('CONFIRMED');
      expect(detector.hardPhysicalEndEligible(now, 'PARKED_CANDIDATE')).toBe(false);
    });

    it('TEMPORARY_150S_STOP_TERMINATES = NO', () => {
      const detector = makeDetector();
      let now = pdiBoundaryMs;
      detector.observe(speedSample(0, now, '2026-09-11T20:05:08.000Z'), 'PARKED_CANDIDATE', now);
      detector.observe(speedSample(0, now + 22_000, '2026-09-11T20:05:30.000Z'), 'PARKED_CANDIDATE', now + 22_000);
      now += 150_000;
      expect(detector.hardPhysicalEndEligible(now, 'PARKED_CANDIDATE')).toBe(false);
      const resumed = detector.observe(
        speedSample(20, now + 5_000, '2026-09-11T20:07:43.000Z'),
        'MOVING',
        now + 5_000,
      );
      expect(resumed.candidateInvalidated).toBe(true);
      expect(detector.hardPhysicalEndEligible(now + 5_000, 'MOVING')).toBe(false);
    });

    it('LONG_UNKNOWN_AFTER_PARKED_TERMINATES = NO', () => {
      const detector = makeDetector();
      const t0 = Date.parse('2026-09-11T12:00:00.000Z');
      detector.observe(speedSample(0, t0, '2026-09-11T12:00:00.000Z'), 'PARKED_CANDIDATE', t0);
      detector.observe(speedSample(0, t0 + 20_000, '2026-09-11T12:00:20.000Z'), 'PARKED_CANDIDATE', t0 + 20_000);
      detector.observe(speedSample(0, t0 + 150_000, '2026-09-11T12:02:30.000Z'), 'PARKED_CANDIDATE', t0 + 150_000);
      for (const at of [t0 + 300_000, t0 + 500_000, t0 + 700_000]) {
        detector.observe(speedSample(0, at), 'UNKNOWN', at);
        expect(detector.hardPhysicalEndEligible(at, 'UNKNOWN')).toBe(false);
      }
    });

    it('MOVEMENT_AFTER_UNKNOWN_INVALIDATES_CANDIDATE = YES', () => {
      const detector = makeDetector();
      const t0 = Date.parse('2026-09-11T12:00:00.000Z');
      detector.observe(speedSample(0, t0, '2026-09-11T12:00:00.000Z'), 'PARKED_CANDIDATE', t0);
      detector.observe(speedSample(0, t0 + 20_000, '2026-09-11T12:00:20.000Z'), 'PARKED_CANDIDATE', t0 + 20_000);
      detector.observe(speedSample(0, t0 + 150_000, '2026-09-11T12:02:30.000Z'), 'PARKED_CANDIDATE', t0 + 150_000);
      detector.observe(speedSample(0, t0 + 160_000), 'UNKNOWN', t0 + 160_000);
      const movingAt = t0 + 710_000;
      const resumed = detector.observe(
        speedSample(22, movingAt, '2026-09-11T12:11:50.000Z'),
        'MOVING',
        movingAt,
      );
      expect(resumed.candidateInvalidated).toBe(true);
      expect(detector.hardPhysicalEndEligible(movingAt, 'MOVING')).toBe(false);
    });

    it('FRESH_SUSTAINED_PARKED_600S_TERMINATES = YES', () => {
      const detector = makeDetector();
      let now = pdiBoundaryMs;
      detector.observe(speedSample(0, now, '2026-09-11T20:05:08.000Z'), 'PARKED_CANDIDATE', now);
      detector.observe(speedSample(0, now + 22_000, '2026-09-11T20:05:30.000Z'), 'PARKED_CANDIDATE', now + 22_000);
      now += 600_000;
      detector.observe(speedSample(0, now, '2026-09-11T20:15:08.000Z'), 'PARKED_CANDIDATE', now);
      expect(detector.hardPhysicalEndEligible(now, 'PARKED_CANDIDATE')).toBe(true);
    });
  });
});

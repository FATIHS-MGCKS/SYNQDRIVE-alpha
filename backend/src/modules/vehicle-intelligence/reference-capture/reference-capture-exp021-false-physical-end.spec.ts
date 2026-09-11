/**
 * EXP-021 false physical-end correction — deterministic fake-clock reproductions.
 */
import {
  finalizeCalibrationOnPhysicalEndEarly,
  finalizePhaseSummary,
  emptyPhaseCounters,
} from './reference-capture-hf-calibration-phase.policy';
import { EXP021_UPPER_BOUND_V2 } from './reference-capture-exp021-calibration-plan.lib';
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
});

import {
  buildPhaseAdvancementConfig,
  EXP021_UPPER_BOUND_V2,
} from './reference-capture-exp021-calibration-plan.lib';
import {
  finalizeTerminalCalibrationSeries,
  emptyPhaseCounters,
} from './reference-capture-hf-calibration-phase.policy';
import { PhysicalDrivePhaseTracker } from './reference-capture-exp-021-motion.lib';

describe('EXP-021 final 30s CONTROL phase terminalization (orchestration semantics)', () => {
  const t0Ms = Date.parse('2026-09-11T04:37:26.000Z');
  const phase30 = EXP021_UPPER_BOUND_V2.phases[3];

  it('expires final phase on wall-clock without fresh telemetry after stale period', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    tracker.beginPhase(
      phase30.cadenceMs,
      t0Ms,
      buildPhaseAdvancementConfig(EXP021_UPPER_BOUND_V2, phase30),
    );

    tracker.tick('MOVING', t0Ms + 30_000);
    tracker.tick('MOVING', t0Ms + 60_000);
    const staleAtMs = t0Ms + 90_000;
    const expiryMs = t0Ms + phase30.targetDurationMs;

    expect(tracker.shouldAdvancePhase(staleAtMs)).toBe(false);

    const finalPhaseWallClockExpired = tracker.shouldAdvancePhase(expiryMs);
    expect(finalPhaseWallClockExpired).toBe(true);

    const sealed = tracker.sealActivePhaseAtBoundary(expiryMs, 'ADVANCE');
    expect(sealed?.phaseCompletion).toBe('SATISFIED');

    const finalized = finalizeTerminalCalibrationSeries({
      series: {
        calibrationSeriesId: 'series',
        vehicleId: 'vehicle',
        tokenId: 187361,
        phaseOrder: [30_000],
        activePhase: {
          calibrationPhaseId: 'phase-30',
          phaseSequence: 4,
          effectivePollIntervalMs: 30_000,
          phaseStartedAt: new Date(t0Ms).toISOString(),
          phaseEndedAt: null,
          phaseProvenance: 'PHYSICAL_TRANSITION',
          canonicalT0At: new Date(t0Ms).toISOString(),
        },
        completedPhases: [],
        completedPhaseSummaries: [],
        pendingPhaseRequest: null,
        cancelledPhaseRequests: [],
        terminalFinalizationAt: null,
        lastPhaseBoundaryAt: null,
        seriesStartedAt: new Date(t0Ms).toISOString(),
        controlPlaneRevision: 0,
      },
      counters: {
        ...emptyPhaseCounters('phase-30'),
        validMovementDurationMs: sealed?.validMovementDurationMs ?? 0,
      },
      terminalAtMs: expiryMs,
      reason: 'STOP',
    });

    expect(finalized.applied).toBe(true);
    expect(finalized.series?.activePhase).toBeNull();
    expect(finalized.series?.terminalFinalizationAt).toBe(new Date(expiryMs).toISOString());
    expect(finalized.series?.completedPhases.length).toBe(1);
  });

  it('FINAL_PHASE_CAN_REMAIN_ACTIVE_AFTER_EXPIRY = NO — orchestrator gate pattern', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    tracker.beginPhase(
      phase30.cadenceMs,
      t0Ms,
      buildPhaseAdvancementConfig(EXP021_UPPER_BOUND_V2, phase30),
    );
    const lastPhaseIndex = EXP021_UPPER_BOUND_V2.phases.length - 1;
    const currentPhaseIndex = lastPhaseIndex;
    const expiryMs = t0Ms + phase30.targetDurationMs;

    const finalPhaseWallClockExpired =
      currentPhaseIndex === lastPhaseIndex && tracker.shouldAdvancePhase(expiryMs);
    expect(finalPhaseWallClockExpired).toBe(true);
  });
});

import {
  buildInitialPhaseCounters,
  emptyPhaseCounters,
  finalizeCalibrationOnPhysicalEndEarly,
  finalizePhaseSummary,
  finalizeTerminalCalibrationSeries,
} from './reference-capture-hf-calibration-phase.policy';
import { EXP021_UPPER_BOUND_V2 } from './reference-capture-exp021-calibration-plan.lib';
import { PhysicalDrivePhaseTracker } from './reference-capture-exp-021-motion.lib';
import {
  buildPhaseAdvancementConfig,
  resolveNominalPhaseDurationMs,
} from './reference-capture-exp021-calibration-plan.lib';
import {
  computeUpperBoundV2SettlementQueryBudget,
  EXP021_LEGACY_FIXED_INTERVAL_QUERY_COUNT,
  buildTiledSettlementProbesForPhase,
} from './reference-capture-settlement-shadow.policy';

describe('EXP-021 post-run hardening', () => {
  const t0Ms = Date.parse('2026-09-11T04:37:26.000Z');

  it('persists validMovementDurationMs from runtime counters into phase summary', () => {
    const phaseId = 'phase-180';
    const counters = {
      ...emptyPhaseCounters(phaseId),
      nativeFastLoopRequestCount: 5,
      nativeFastLoopProviderSuccessCount: 5,
      validMovementDurationMs: 705_000,
    };
    const summary = finalizePhaseSummary({
      phase: {
        calibrationPhaseId: phaseId,
        phaseSequence: 1,
        effectivePollIntervalMs: 180_000,
        phaseStartedAt: new Date(t0Ms).toISOString(),
        phaseEndedAt: new Date(t0Ms + 900_000).toISOString(),
        phaseProvenance: 'PHYSICAL_T0',
        canonicalT0At: new Date(t0Ms).toISOString(),
        effectiveConfig: {
          calibrationSeriesId: 'series',
          calibrationPhaseId: phaseId,
          phaseSequence: 1,
          vehicleId: 'vehicle',
          tokenId: 1,
          effectivePollIntervalMs: 180_000,
          settlementDelayMs: 8000,
          recoveryOverlapMs: 6000,
          policyVersion: 'HF_RECOVERY_V2_2026-09-04',
          policyMode: 'V2' as const,
          effectiveAt: new Date(t0Ms).toISOString(),
        },
      },
      counters,
      phaseEndedAtMs: t0Ms + 900_000,
    });
    expect(summary.validMovementDurationMs).toBe(705_000);
  });

  it('terminalizes physical-end-early with NOT_RUN remaining phases', () => {
    const physicalEndMs = t0Ms + 26.2 * 60_000;
    const series = {
      calibrationSeriesId: 'series',
      vehicleId: 'vehicle',
      tokenId: 187361,
      phaseOrder: [180_000, 120_000, 60_000],
      activePhase: {
        calibrationPhaseId: 'phase-60',
        phaseSequence: 3,
        effectivePollIntervalMs: 60_000,
        phaseStartedAt: new Date(physicalEndMs - 60_000).toISOString(),
        phaseEndedAt: null,
        phaseProvenance: 'PHYSICAL_TRANSITION' as const,
        canonicalT0At: new Date(t0Ms).toISOString(),
        effectiveConfig: {
          calibrationSeriesId: 'series',
          calibrationPhaseId: 'phase-60',
          phaseSequence: 3,
          vehicleId: 'vehicle',
          tokenId: 187361,
          effectivePollIntervalMs: 60_000,
          settlementDelayMs: 8000,
          recoveryOverlapMs: 6000,
          policyVersion: 'HF_RECOVERY_V2_2026-09-04',
          policyMode: 'V2' as const,
          effectiveAt: new Date(physicalEndMs - 60_000).toISOString(),
        },
      },
      completedPhases: [],
      completedPhaseSummaries: [],
      pendingPhaseRequest: null,
      cancelledPhaseRequests: [],
      terminalFinalizationAt: null,
      lastPhaseBoundaryAt: null,
      seriesStartedAt: new Date(t0Ms).toISOString(),
      controlPlaneRevision: 1,
    };
    const result = finalizeCalibrationOnPhysicalEndEarly({
      series,
      counters: emptyPhaseCounters('phase-60'),
      physicalEndMs,
      plan: EXP021_UPPER_BOUND_V2,
    });
    expect(result.applied).toBe(true);
    expect(result.series?.terminalFinalizationAt).toBe(new Date(physicalEndMs).toISOString());
    expect(result.series?.skippedPhasePlans?.map((p) => p.cadenceMs)).toEqual([180_000, 120_000, 30_000]);
    expect(result.series?.skippedPhasePlans?.every((p) => p.skipReason === 'PHYSICAL_RUN_ENDED_EARLY')).toBe(
      true,
    );
  });

  it('seals final 30s CONTROL on wall-clock expiry via tracker + terminal series', () => {
    const tracker = new PhysicalDrivePhaseTracker();
    const phase30 = EXP021_UPPER_BOUND_V2.phases[3];
    tracker.beginPhase(
      phase30.cadenceMs,
      t0Ms,
      buildPhaseAdvancementConfig(EXP021_UPPER_BOUND_V2, phase30),
    );
    const endMs = t0Ms + phase30.targetDurationMs;
    const sealed = tracker.sealActivePhaseAtBoundary(endMs, 'ADVANCE');
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
          effectiveConfig: {
            calibrationSeriesId: 'series',
            calibrationPhaseId: 'phase-30',
            phaseSequence: 4,
            vehicleId: 'vehicle',
            tokenId: 187361,
            effectivePollIntervalMs: 30_000,
            settlementDelayMs: 8000,
            recoveryOverlapMs: 6000,
            policyVersion: 'HF_RECOVERY_V2_2026-09-04',
            policyMode: 'V2' as const,
            effectiveAt: new Date(t0Ms).toISOString(),
          },
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
      terminalAtMs: endMs,
      reason: 'STOP',
    });
    expect(finalized.applied).toBe(true);
    expect(finalized.series?.terminalFinalizationAt).toBe(new Date(endMs).toISOString());
  });

  it('initializes request slots at T0 without inheriting PRE_ROLL poll anchor', () => {
    const counters = buildInitialPhaseCounters({
      calibrationPhaseId: 'phase-180',
      phaseEffectiveStartMs: t0Ms,
      cadenceMs: 180_000,
      phaseProvenance: 'PHYSICAL_T0',
    });
    expect(counters.exp021RequestSlots?.length).toBe(5);
    expect(counters.exp021RequestSlots?.[0]?.dueAtMs).toBe(t0Ms);
  });

  it('tiled settlement coverage exceeds legacy fixed-interval budget with assessable geometry', () => {
    const budget = computeUpperBoundV2SettlementQueryBudget(EXP021_UPPER_BOUND_V2);
    expect(EXP021_LEGACY_FIXED_INTERVAL_QUERY_COUNT).toBe(48);
    expect(budget.tileCount).toBeGreaterThan(8);
    expect(budget.expectedSettlementQueryCount).toBeGreaterThan(48);

    const phase180Tiles = buildTiledSettlementProbesForPhase({
      phasePollIntervalMs: 180_000,
      phaseStartedAtMs: t0Ms,
      phaseEndMs: t0Ms + resolveNominalPhaseDurationMs(180_000),
    });
    expect(phase180Tiles.length).toBe(13);
    const gapStart = t0Ms + 120_000 + 30_000;
    const gapEnd = gapStart + 20_000;
    const covering = phase180Tiles.find(
      (probe) =>
        probe.sourceIntervalStartMs <= gapStart && probe.sourceIntervalEndMs >= gapEnd,
    );
    expect(covering).toBeDefined();
  });
});

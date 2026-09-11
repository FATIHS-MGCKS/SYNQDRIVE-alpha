import {
  buildPhaseAdvancementConfig,
  cadenceSequenceArrow,
  cadenceSequenceFromPlan,
  cadenceSequenceLabel,
  EXP021_CANDIDATE_BRACKET_V3,
  EXP021_DEFAULT_CALIBRATION_PLAN,
  EXP021_LOWER_BOUND_V1,
  EXP021_UPPER_BOUND_V2,
  nominalTotalDurationMs,
  resolveExp021CalibrationPlan,
} from './reference-capture-exp021-calibration-plan.lib';
import {
  buildExp021IntendedSlotOffsets,
  countIntendedSlotsForCadence,
} from './reference-capture-exp021-request-slots.lib';
import { isRecognizedCalibrationPollIntervalMs } from './reference-capture-hf-calibration-phase.policy';
import { HF_POLL_CALIBRATION_CANDIDATES_MS } from './reference-capture-hf-block-polling.policy';
import {
  buildFullPhaseOverlappingSettlementProbesForPhase,
  computeExp021SettlementQueryBudget,
  countFullPhaseOverlappingTilesForNominalPhase,
  usesFullPhaseOverlappingSettlementStrategy,
} from './reference-capture-settlement-shadow.policy';
import {
  extractNativeTemporalGaps,
  findSettlementProbeCoveringInterval,
  type SettlementProbeRef,
} from './reference-capture-exp021-gap-settlement-analyzer';
import { PhysicalDrivePhaseTracker } from './reference-capture-exp-021-motion.lib';
import { buildBracketReconstructionReport } from './reference-capture-exp021-reconstruction-quality-analyzer';

describe('EXP-021 CANDIDATE_BRACKET_V3 prospective plan', () => {
  const plan = EXP021_CANDIDATE_BRACKET_V3;
  const t0Ms = Date.parse('2026-09-11T10:00:00.000Z');

  it('resolves via EXP021_CALIBRATION_PLAN=CANDIDATE_BRACKET_V3', () => {
    expect(
      resolveExp021CalibrationPlan({ EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3' }),
    ).toBe(EXP021_CANDIDATE_BRACKET_V3);
    expect(EXP021_CANDIDATE_BRACKET_V3.planId).toBe('candidate_bracket_v3');
    expect(EXP021_CANDIDATE_BRACKET_V3.planVersion).toBe('EXP021_CANDIDATE_BRACKET_V3');
  });

  it('keeps UPPER_BOUND_V2 and LOWER_BOUND_V1 as default and historical respectively', () => {
    expect(EXP021_DEFAULT_CALIBRATION_PLAN).toBe(EXP021_UPPER_BOUND_V2);
    expect(resolveExp021CalibrationPlan({})).toBe(EXP021_UPPER_BOUND_V2);
    expect(resolveExp021CalibrationPlan({ EXP021_CALIBRATION_PLAN: 'LOWER_BOUND_V1' })).toBe(
      EXP021_LOWER_BOUND_V1,
    );
    expect(cadenceSequenceFromPlan(EXP021_UPPER_BOUND_V2)).toEqual([
      180_000,
      120_000,
      60_000,
      30_000,
    ]);
  });

  it('defines cadence sequence 120→90→60 with no 180s or 30s CONTROL', () => {
    expect(cadenceSequenceFromPlan(plan)).toEqual([120_000, 90_000, 60_000]);
    expect(cadenceSequenceLabel(plan)).toBe('120_90_60');
    expect(cadenceSequenceArrow(plan)).toBe('120→90→60');
    expect(plan.phases.some((p) => p.cadenceMs === 180_000)).toBe(false);
    expect(plan.phases.some((p) => p.cadenceMs === 30_000)).toBe(false);
    expect(plan.phases.every((p) => p.role === 'EXPERIMENTAL')).toBe(true);
  });

  it('uses equal 10-minute wall phases and 30/32 min nominal/max totals', () => {
    expect(plan.phases.map((p) => p.targetDurationMs)).toEqual([
      10 * 60_000,
      10 * 60_000,
      10 * 60_000,
    ]);
    expect(nominalTotalDurationMs(plan)).toBe(30 * 60_000);
    expect(plan.maxTotalDurationMs).toBe(32 * 60_000);
    expect(plan.totalGraceBudgetMs).toBe(2 * 60_000);
    expect(plan.advancementMode).toBe('WALL_CLOCK');
  });

  it('accepts 90s as first-class calibration candidate', () => {
    expect(HF_POLL_CALIBRATION_CANDIDATES_MS).toContain(90_000);
    expect(isRecognizedCalibrationPollIntervalMs(90_000)).toBe(true);
  });

  describe('deterministic request slots', () => {
    it('120s phase: 5 slots at 0/120/240/360/480s', () => {
      const offsets = buildExp021IntendedSlotOffsets({
        cadenceMs: 120_000,
        phaseDurationMs: 10 * 60_000,
      });
      expect(offsets).toEqual([0, 120_000, 240_000, 360_000, 480_000]);
      expect(countIntendedSlotsForCadence(120_000, plan)).toBe(5);
    });

    it('90s phase: 7 slots', () => {
      const offsets = buildExp021IntendedSlotOffsets({
        cadenceMs: 90_000,
        phaseDurationMs: 10 * 60_000,
      });
      expect(offsets).toEqual([
        0,
        90_000,
        180_000,
        270_000,
        360_000,
        450_000,
        540_000,
      ]);
      expect(countIntendedSlotsForCadence(90_000, plan)).toBe(7);
    });

    it('60s phase: 10 slots', () => {
      const offsets = buildExp021IntendedSlotOffsets({
        cadenceMs: 60_000,
        phaseDurationMs: 10 * 60_000,
      });
      expect(offsets.length).toBe(10);
      expect(offsets[0]).toBe(0);
      expect(offsets[9]).toBe(540_000);
      expect(countIntendedSlotsForCadence(60_000, plan)).toBe(10);
    });

    it('total request slots = 22', () => {
      const total = plan.phases.reduce(
        (sum, phase) => sum + countIntendedSlotsForCadence(phase.cadenceMs, plan),
        0,
      );
      expect(total).toBe(22);
    });
  });

  describe('phase transitions and final terminalization', () => {
    it('advances 120→90 on wall-clock expiry', () => {
      const phase120 = plan.phases[0];
      const tracker = new PhysicalDrivePhaseTracker();
      tracker.beginPhase(
        phase120.cadenceMs,
        t0Ms,
        buildPhaseAdvancementConfig(plan, phase120),
      );
      tracker.tick('MOVING', t0Ms + 5 * 60_000);
      const boundaryMs = t0Ms + phase120.targetDurationMs;
      expect(tracker.shouldAdvancePhase(boundaryMs)).toBe(true);
      const sealed = tracker.sealActivePhaseAtBoundary(boundaryMs, 'ADVANCE');
      expect(sealed?.phaseCompletion).toBe('SATISFIED');

      const phase90 = plan.phases[1];
      tracker.beginPhase(
        phase90.cadenceMs,
        boundaryMs,
        buildPhaseAdvancementConfig(plan, phase90),
      );
      expect(phase90.cadenceMs).toBe(90_000);
      expect(tracker.shouldAdvancePhase(boundaryMs + phase90.targetDurationMs)).toBe(true);
    });

    it('advances 90→60 on wall-clock expiry', () => {
      const phase90 = plan.phases[1];
      const phaseStartMs = t0Ms + 10 * 60_000;
      const tracker = new PhysicalDrivePhaseTracker();
      tracker.beginPhase(
        phase90.cadenceMs,
        phaseStartMs,
        buildPhaseAdvancementConfig(plan, phase90),
      );
      const boundaryMs = phaseStartMs + phase90.targetDurationMs;
      expect(tracker.shouldAdvancePhase(boundaryMs)).toBe(true);

      const phase60 = plan.phases[2];
      tracker.beginPhase(
        phase60.cadenceMs,
        boundaryMs,
        buildPhaseAdvancementConfig(plan, phase60),
      );
      expect(phase60.cadenceMs).toBe(60_000);
      expect(tracker.shouldAdvancePhase(boundaryMs + phase60.targetDurationMs)).toBe(true);
    });

    it('terminalizes final 60s phase on wall-clock expiry', () => {
      const phase60 = plan.phases[2];
      const phaseStartMs = t0Ms + 20 * 60_000;
      const tracker = new PhysicalDrivePhaseTracker();
      tracker.beginPhase(
        phase60.cadenceMs,
        phaseStartMs,
        buildPhaseAdvancementConfig(plan, phase60),
      );
      const expiryMs = phaseStartMs + phase60.targetDurationMs;
      const lastPhaseIndex = plan.phases.length - 1;
      const currentPhaseIndex = lastPhaseIndex;
      const finalPhaseWallClockExpired =
        currentPhaseIndex === lastPhaseIndex && tracker.shouldAdvancePhase(expiryMs);
      expect(finalPhaseWallClockExpired).toBe(true);
    });
  });

  describe('settlement geometry (full-phase overlapping)', () => {
    it('uses WALL_CLOCK full-phase overlapping strategy', () => {
      expect(usesFullPhaseOverlappingSettlementStrategy(plan)).toBe(true);
    });

    it('has 19 source windows per 10-minute phase', () => {
      for (const phase of plan.phases) {
        expect(
          countFullPhaseOverlappingTilesForNominalPhase({
            nominalPhaseDurationMs: phase.targetDurationMs,
          }),
        ).toBe(19);
      }
    });

    it('budget: 57 windows × 6 ages = 342 observations', () => {
      const budget = computeExp021SettlementQueryBudget(plan);
      expect(budget.fullPhaseTileCount).toBe(57);
      expect(budget.expectedSettlementQueryCount).toBe(342);
      expect(budget.maxSettlementQueryCount).toBe(342);
      expect(budget.nominalPhaseMinutes).toBe(30);
    });

    it('builds overlapping probes for each cadence within 10m wall', () => {
      for (const phase of plan.phases) {
        const probes = buildFullPhaseOverlappingSettlementProbesForPhase({
          phasePollIntervalMs: phase.cadenceMs,
          phaseStartedAtMs: t0Ms,
          phaseEndMs: t0Ms + phase.targetDurationMs,
        });
        expect(probes.length).toBe(19);
      }
    });
  });

  describe('synthetic gap assessability', () => {
    function buildProbes(cadenceMs: number, durationMs: number, phaseStartMs: number) {
      const plans = buildFullPhaseOverlappingSettlementProbesForPhase({
        phasePollIntervalMs: cadenceMs,
        phaseStartedAtMs: phaseStartMs,
        phaseEndMs: phaseStartMs + durationMs,
      });
      return plans.map((probe) => ({
        probeId: probe.probeId,
        phaseLabel: probe.phaseLabel,
        sourceIntervalStartIso: new Date(probe.sourceIntervalStartMs).toISOString(),
        sourceIntervalEndIso: new Date(probe.sourceIntervalEndMs).toISOString(),
      }));
    }

    function assessGap(
      probes: SettlementProbeRef[],
      phaseStartMs: number,
      gapStartOffsetMs: number,
      gapDurationMs: number,
    ): boolean {
      const gapStartMs = phaseStartMs + gapStartOffsetMs;
      const gapEndMs = gapStartMs + gapDurationMs;
      const gaps = extractNativeTemporalGaps({
        phaseLabel: 'test',
        nativeTemporalBucketStarts: [
          new Date(gapStartMs).toISOString(),
          new Date(gapEndMs).toISOString(),
        ],
        minGapMs: 10_000,
      });
      if (gaps.length !== 1) return false;
      const gap = gaps[0];
      return (
        findSettlementProbeCoveringInterval(
          probes,
          Date.parse(gap.gapStartIso),
          Date.parse(gap.gapEndIso),
        ) != null
      );
    }

    const scenarios: Array<{
      cadenceMs: number;
      durationMs: number;
      offset: number;
      duration: number;
    }> = [];
    for (const phase of plan.phases) {
      const positions = [
        { offset: 5_000, duration: 12_000 },
        { offset: 30_000, duration: 15_000 },
        { offset: 120_000, duration: 20_000 },
        { offset: Math.floor(phase.targetDurationMs * 0.5), duration: 25_000 },
        { offset: 60_000, duration: 35_000 },
        { offset: 45_000, duration: 40_000 },
        { offset: phase.targetDurationMs - 70_000, duration: 15_000 },
        { offset: phase.targetDurationMs - 25_000, duration: 12_000 },
      ];
      for (const pos of positions) {
        if (pos.offset + pos.duration < phase.targetDurationMs && pos.offset >= 0) {
          scenarios.push({
            cadenceMs: phase.cadenceMs,
            durationMs: phase.targetDurationMs,
            offset: pos.offset,
            duration: pos.duration,
          });
        }
      }
    }

    let assessable = 0;
    for (const scenario of scenarios) {
      const probes = buildProbes(scenario.cadenceMs, scenario.durationMs, t0Ms);
      if (assessGap(probes, t0Ms, scenario.offset, scenario.duration)) {
        assessable += 1;
      }
    }

    const pct = scenarios.length > 0 ? (assessable / scenarios.length) * 100 : 0;

    it('achieves >=90% synthetic native gap assessability', () => {
      expect(scenarios.length).toBeGreaterThan(0);
      expect(pct).toBeGreaterThanOrEqual(90);
    });
  });

  describe('reconstruction-quality analyzer readiness', () => {
    it('builds bracket report with bucket/gap metrics and documents map-matching gap', () => {
      const report = buildBracketReconstructionReport({
        plan,
        phaseSummaries: [],
      });
      expect(report.planVersion).toBe('EXP021_CANDIDATE_BRACKET_V3');
      expect(report.readiness).toBe('MAP_MATCHING_ADAPTER_REQUIRED');
      expect(report.mapMatchingIntegrationGap).toContain('TripRouteChunkedMatcher');
    });
  });
});

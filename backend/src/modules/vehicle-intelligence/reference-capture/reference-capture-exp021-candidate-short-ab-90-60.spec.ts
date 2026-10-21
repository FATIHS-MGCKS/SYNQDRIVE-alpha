/**
 * EXP-021 — dedicated 90→60 short A/B calibration plan (post PR #1618 forensic authority).
 */
import {
  applyPendingCalibrationPhaseAtBoundary,
  buildInitialPhaseCounters,
  emptyPhaseCounters,
  finalizePhaseSummary,
  reanchorPhysicalCalibrationPhaseAtT0,
  recomputePhaseSummaryDerivedFields,
  resolveExp021CalibrationPlanForSeries,
} from './reference-capture-hf-calibration-phase.policy';
import {
  buildPhaseAdvancementConfig,
  cadenceSequenceArrow,
  cadenceSequenceFromPlan,
  cadenceSequenceLabel,
  classifyPhaseScientificStatus,
  EXP021_CANDIDATE_BRACKET_V3,
  EXP021_CANDIDATE_SHORT_AB_90_60,
  EXP021_LOWER_BOUND_V1,
  EXP021_UPPER_BOUND_V2,
  findPhaseSpecByCadence,
  nominalTotalDurationMs,
  resolveExp021CalibrationPlan,
  resolveExp021CalibrationPlanFromAuthority,
  resolveExp021CalibrationPlanFromSources,
  resolveNominalPhaseDurationMs,
} from './reference-capture-exp021-calibration-plan.lib';
import {
  buildExp021IntendedSlotOffsets,
  countIntendedSlotsForCadence,
} from './reference-capture-exp021-request-slots.lib';
import { parseHfRecoveryPolicyV2ConfigFromEnv } from './reference-capture-hf-recovery-v2.policy';
import {
  buildFullPhaseOverlappingSettlementProbesForPhase,
  computeExp021SettlementQueryBudget,
  countFullPhaseOverlappingTilesForNominalPhase,
  usesFullPhaseOverlappingSettlementStrategy,
} from './reference-capture-settlement-shadow.policy';
import { PhysicalDrivePhaseTracker } from './reference-capture-exp-021-motion.lib';
import { buildBracketReconstructionReport } from './reference-capture-exp021-reconstruction-quality-analyzer';

describe('EXP-021 CANDIDATE_SHORT_AB_90_60 dedicated plan', () => {
  const plan = EXP021_CANDIDATE_SHORT_AB_90_60;
  const v3Plan = EXP021_CANDIDATE_BRACKET_V3;
  const t0Ms = Date.parse('2026-09-12T10:00:00.000Z');
  const HF_POLICY = parseHfRecoveryPolicyV2ConfigFromEnv({
    HF_RECOVERY_POLICY_V2_ENABLED: 'true',
    HF_HISTORICAL_POLL_INTERVAL_MS: '120000',
    HF_RECOVERY_POLICY_V2_CANARY_ONLY: 'false',
  });

  function buildEffectiveConfig(phaseId: string, cadenceMs: number, sequence: number) {
    return {
      calibrationSeriesId: 'series-short-ab',
      calibrationPhaseId: phaseId,
      phaseSequence: sequence,
      vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
      tokenId: 192922,
      effectivePollIntervalMs: cadenceMs,
      settlementDelayMs: 8000,
      recoveryOverlapMs: 6000,
      policyVersion: 'HF_RECOVERY_V2_2026-09-04',
      policyMode: 'V2' as const,
      effectiveAt: new Date(t0Ms).toISOString(),
    };
  }

  it('resolves via EXP021_CALIBRATION_PLAN=CANDIDATE_SHORT_AB_90_60', () => {
    expect(
      resolveExp021CalibrationPlan({ EXP021_CALIBRATION_PLAN: 'CANDIDATE_SHORT_AB_90_60' }),
    ).toBe(EXP021_CANDIDATE_SHORT_AB_90_60);
    expect(plan.planId).toBe('candidate_short_ab_90_60');
    expect(plan.planVersion).toBe('EXP021_CANDIDATE_SHORT_AB_90_60');
  });

  it('defines cadence sequence 90→60 only — no 120 phase', () => {
    expect(cadenceSequenceFromPlan(plan)).toEqual([90_000, 60_000]);
    expect(cadenceSequenceLabel(plan)).toBe('90_60');
    expect(cadenceSequenceArrow(plan)).toBe('90→60');
    expect(plan.phases.length).toBe(2);
    expect(plan.phases.some((p) => p.cadenceMs === 120_000)).toBe(false);
    expect(plan.phases.some((p) => p.cadenceMs === 180_000)).toBe(false);
    expect(plan.phases.every((p) => p.role === 'EXPERIMENTAL')).toBe(true);
  });

  it('uses equal 10-minute wall phases and 20/22 min nominal/max totals', () => {
    expect(plan.phases.map((p) => p.targetDurationMs)).toEqual([10 * 60_000, 10 * 60_000]);
    expect(nominalTotalDurationMs(plan)).toBe(20 * 60_000);
    expect(plan.maxTotalDurationMs).toBe(22 * 60_000);
    expect(plan.totalGraceBudgetMs).toBe(2 * 60_000);
    expect(plan.advancementMode).toBe('WALL_CLOCK');
  });

  describe('V3 90s/60s semantic parity (no scientific tuning)', () => {
    it('90s phase matches CANDIDATE_BRACKET_V3 phase[1] exactly', () => {
      expect(plan.phases[0]).toEqual(v3Plan.phases[1]);
    });

    it('60s phase matches CANDIDATE_BRACKET_V3 phase[2] exactly', () => {
      expect(plan.phases[1]).toEqual(v3Plan.phases[2]);
    });

    it('minSuccessfulRequests and advancement mode unchanged from V3 90/60', () => {
      for (const cadenceMs of [90_000, 60_000]) {
        const shortSpec = findPhaseSpecByCadence(plan, cadenceMs)!;
        const v3Spec = findPhaseSpecByCadence(v3Plan, cadenceMs)!;
        expect(shortSpec.minSuccessfulRequests).toBe(v3Spec.minSuccessfulRequests);
        expect(shortSpec.targetDurationMs).toBe(v3Spec.targetDurationMs);
        expect(shortSpec.role).toBe(v3Spec.role);
      }
    });
  });

  describe('deterministic request slots', () => {
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
      expect(countIntendedSlotsForCadence(60_000, plan)).toBe(10);
      const offsets = buildExp021IntendedSlotOffsets({
        cadenceMs: 60_000,
        phaseDurationMs: 10 * 60_000,
      });
      expect(offsets.length).toBe(10);
      expect(offsets[0]).toBe(0);
      expect(offsets[9]).toBe(540_000);
    });

    it('no 120s slot ledger is created', () => {
      expect(countIntendedSlotsForCadence(120_000, plan)).toBe(0);
      expect(plan.phases.some((p) => p.cadenceMs === 120_000)).toBe(false);
    });

    it('total request slots = 17', () => {
      const total = plan.phases.reduce(
        (sum, phase) => sum + countIntendedSlotsForCadence(phase.cadenceMs, plan),
        0,
      );
      expect(total).toBe(17);
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

    it('no 120s settlement geometry exists', () => {
      expect(findPhaseSpecByCadence(plan, 120_000)).toBeUndefined();
    });

    it('budget: 38 windows × 6 ages = 228 observations', () => {
      const budget = computeExp021SettlementQueryBudget(plan);
      expect(budget.fullPhaseTileCount).toBe(38);
      expect(budget.expectedSettlementQueryCount).toBe(228);
      expect(budget.maxSettlementQueryCount).toBe(228);
      expect(budget.nominalPhaseMinutes).toBe(20);
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

  describe('phase transitions and terminalization', () => {
    it('advances 90→60 on wall-clock expiry', () => {
      const phase90 = plan.phases[0];
      const tracker = new PhysicalDrivePhaseTracker();
      tracker.beginPhase(
        phase90.cadenceMs,
        t0Ms,
        buildPhaseAdvancementConfig(plan, phase90),
      );
      const boundaryMs = t0Ms + phase90.targetDurationMs;
      expect(tracker.shouldAdvancePhase(boundaryMs)).toBe(true);

      const phase60 = plan.phases[1];
      tracker.beginPhase(
        phase60.cadenceMs,
        boundaryMs,
        buildPhaseAdvancementConfig(plan, phase60),
      );
      expect(phase60.cadenceMs).toBe(60_000);
      expect(tracker.shouldAdvancePhase(boundaryMs + phase60.targetDurationMs)).toBe(true);
    });

    it('terminalizes final 60s phase on wall-clock expiry', () => {
      const phase60 = plan.phases[1];
      const phaseStartMs = t0Ms + 10 * 60_000;
      const tracker = new PhysicalDrivePhaseTracker();
      tracker.beginPhase(
        phase60.cadenceMs,
        phaseStartMs,
        buildPhaseAdvancementConfig(plan, phase60),
      );
      const expiryMs = phaseStartMs + phase60.targetDurationMs;
      const lastPhaseIndex = plan.phases.length - 1;
      const finalPhaseWallClockExpired =
        lastPhaseIndex === plan.phases.length - 1 && tracker.shouldAdvancePhase(expiryMs);
      expect(finalPhaseWallClockExpired).toBe(true);
    });
  });

  describe('durable arm authority and restart recovery', () => {
    it('persists calibrationPlanId and calibrationPlanVersion at physical T0 arm', () => {
      const reanchored = reanchorPhysicalCalibrationPhaseAtT0({
        existing: null,
        vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
        tokenId: 192922,
        canonicalT0Ms: t0Ms,
        effectivePollIntervalMs: 90_000,
        hfPolicy: HF_POLICY,
        nowMs: t0Ms,
        calibrationPlan: plan,
      });
      expect(reanchored.series.calibrationPlanId).toBe('candidate_short_ab_90_60');
      expect(reanchored.series.calibrationPlanVersion).toBe('EXP021_CANDIDATE_SHORT_AB_90_60');
    });

    it('recovers short plan from durable series authority even when env points to CANDIDATE_BRACKET_V3', () => {
      const series = reanchorPhysicalCalibrationPhaseAtT0({
        existing: null,
        vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
        tokenId: 192922,
        canonicalT0Ms: t0Ms,
        effectivePollIntervalMs: 90_000,
        hfPolicy: HF_POLICY,
        nowMs: t0Ms,
        calibrationPlan: plan,
      }).series;

      const recovered = resolveExp021CalibrationPlanForSeries(series, {
        EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3',
      });
      expect(recovered.planId).toBe('candidate_short_ab_90_60');
      expect(recovered.planVersion).toBe('EXP021_CANDIDATE_SHORT_AB_90_60');
    });

    it('metadata fallback resolves short plan when series authority absent', () => {
      const recovered = resolveExp021CalibrationPlanFromAuthority({
        calibrationPlanId: 'candidate_short_ab_90_60',
        calibrationPlanVersion: 'EXP021_CANDIDATE_SHORT_AB_90_60',
        env: { EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3' },
      });
      expect(recovered).toBe(plan);
    });

    it('resolveExp021CalibrationPlanFromSources: metadata short plan wins over env V3', () => {
      expect(
        resolveExp021CalibrationPlanFromSources({
          seriesPlanId: null,
          seriesPlanVersion: null,
          metadataPlanId: 'candidate_short_ab_90_60',
          metadataPlanVersion: 'EXP021_CANDIDATE_SHORT_AB_90_60',
          env: { EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3' },
        }),
      ).toBe(plan);
    });
  });

  describe('late validMovementDuration patch recomputes scientific status', () => {
    const wallDurationMs = 600_000;
    const validMovementMs = 200_000;

    for (const cadenceMs of [90_000, 60_000]) {
      it(`${cadenceMs / 1000}s phase: movement patch yields VALID`, () => {
        const phaseSpec = findPhaseSpecByCadence(plan, cadenceMs)!;
        const counters = {
          ...emptyPhaseCounters(`phase-${cadenceMs}`),
          nativeFastLoopRequestCount: 5,
          nativeFastLoopProviderSuccessCount: 5,
        };
        const initial = finalizePhaseSummary({
          phase: {
            calibrationPhaseId: `phase-${cadenceMs}`,
            phaseSequence: cadenceMs === 90_000 ? 1 : 2,
            effectivePollIntervalMs: cadenceMs,
            phaseStartedAt: new Date(t0Ms).toISOString(),
            phaseEndedAt: new Date(t0Ms + wallDurationMs).toISOString(),
            phaseProvenance: cadenceMs === 90_000 ? 'PHYSICAL_T0' : 'PHYSICAL_TRANSITION',
            canonicalT0At: new Date(t0Ms).toISOString(),
            effectiveConfig: buildEffectiveConfig(`phase-${cadenceMs}`, cadenceMs, cadenceMs === 90_000 ? 1 : 2),
          },
          counters,
          phaseEndedAtMs: t0Ms + wallDurationMs,
          calibrationPlan: plan,
        });
        expect(initial.scientificStatus).toBeNull();

        const patched = recomputePhaseSummaryDerivedFields({
          summary: initial,
          validMovementDurationMs: validMovementMs,
          calibrationPlan: plan,
        });
        expect(patched.scientificStatus).toBe('VALID');
        expect(patched.calibrationPlanVersion).toBe('EXP021_CANDIDATE_SHORT_AB_90_60');
        expect(
          classifyPhaseScientificStatus({
            plan,
            phaseSpec,
            providerSuccessCount: 5,
            validMovementDurationMs: validMovementMs,
            wallDurationMs,
          }),
        ).toBe('VALID');
      });
    }
  });

  describe('realistic lifecycle regression 90→60→terminal', () => {
    it('full short A/B transition chain with durable plan on every summary', () => {
      let series = reanchorPhysicalCalibrationPhaseAtT0({
        existing: null,
        vehicleId: '19fedd4b-c4e8-4de8-a125-dab293326e7e',
        tokenId: 192922,
        canonicalT0Ms: t0Ms,
        effectivePollIntervalMs: 90_000,
        hfPolicy: HF_POLICY,
        nowMs: t0Ms,
        calibrationPlan: plan,
      }).series;

      let counters = buildInitialPhaseCounters({
        calibrationPhaseId: series.activePhase!.calibrationPhaseId,
        phaseEffectiveStartMs: t0Ms,
        cadenceMs: 90_000,
        phaseProvenance: 'PHYSICAL_T0',
        calibrationPlan: plan,
      });
      expect(counters.exp021RequestSlots?.length).toBe(7);

      const summaries: string[] = [];

      for (let i = 1; i < plan.phases.length; i++) {
        const nextCadence = plan.phases[i].cadenceMs;
        const boundaryMs = t0Ms + i * 10 * 60_000;
        counters = {
          ...counters,
          nativeFastLoopProviderSuccessCount: 5,
          nativeFastLoopRequestCount: 5,
          validMovementDurationMs: 200_000,
        };
        const applied = applyPendingCalibrationPhaseAtBoundary({
          series: {
            ...series,
            pendingPhaseRequest: {
              requestId: `req-${nextCadence}`,
              requestedAt: new Date(boundaryMs).toISOString(),
              effectivePollIntervalMs: nextCadence,
              phaseProvenance: 'PHYSICAL_TRANSITION',
            },
          },
          pending: {
            requestId: `req-${nextCadence}`,
            requestedAt: new Date(boundaryMs).toISOString(),
            effectivePollIntervalMs: nextCadence,
            phaseProvenance: 'PHYSICAL_TRANSITION',
          },
          counters,
          hfPolicy: HF_POLICY,
          effectiveAtMs: boundaryMs,
        });
        expect(applied.applied).toBe(true);
        series = applied.series!;
        counters = applied.activePhaseCounters ?? counters;
        const lastSummary = series.completedPhaseSummaries.at(-1);
        if (lastSummary?.calibrationPlanVersion) {
          summaries.push(lastSummary.calibrationPlanVersion);
        }
      }

      expect(summaries.every((v) => v === 'EXP021_CANDIDATE_SHORT_AB_90_60')).toBe(true);
      expect(
        counters?.exp021RequestSlots?.length ??
          buildInitialPhaseCounters({
            calibrationPhaseId: 'x',
            phaseEffectiveStartMs: t0Ms + 10 * 60_000,
            cadenceMs: 60_000,
            phaseProvenance: 'PHYSICAL_TRANSITION',
            calibrationPlan: plan,
          }).exp021RequestSlots?.length,
      ).toBe(10);
      expect(series.completedPhases.some((p) => p.effectivePollIntervalMs === 120_000)).toBe(false);
    });
  });

  describe('historical plan regression unchanged', () => {
    it('CANDIDATE_BRACKET_V3 remains 5/7/10 slots and 19/19/19 settlement', () => {
      expect(countIntendedSlotsForCadence(120_000, v3Plan)).toBe(5);
      expect(countIntendedSlotsForCadence(90_000, v3Plan)).toBe(7);
      expect(countIntendedSlotsForCadence(60_000, v3Plan)).toBe(10);
      const budget = computeExp021SettlementQueryBudget(v3Plan);
      expect(budget.fullPhaseTileCount).toBe(57);
      expect(budget.expectedSettlementQueryCount).toBe(342);
    });

    it('UPPER_BOUND_V2 and LOWER_BOUND_V1 still resolve independently', () => {
      expect(resolveExp021CalibrationPlan({ EXP021_CALIBRATION_PLAN: 'UPPER_BOUND_V2' })).toBe(
        EXP021_UPPER_BOUND_V2,
      );
      expect(resolveExp021CalibrationPlan({ EXP021_CALIBRATION_PLAN: 'LOWER_BOUND_V1' })).toBe(
        EXP021_LOWER_BOUND_V1,
      );
    });
  });

  describe('reconstruction-quality analyzer readiness', () => {
    it('builds bracket report with short plan version', () => {
      const report = buildBracketReconstructionReport({
        plan,
        phaseSummaries: [],
      });
      expect(report.planVersion).toBe('EXP021_CANDIDATE_SHORT_AB_90_60');
      expect(report.readiness).toBe('MAP_MATCHING_ADAPTER_REQUIRED');
    });
  });
});

/**
 * EXP-021 — dedicated 60→90 short A/B calibration plan (order reversal of CANDIDATE_SHORT_AB_90_60).
 */
import {
  buildPhaseAdvancementConfig,
  cadenceSequenceArrow,
  cadenceSequenceFromPlan,
  cadenceSequenceLabel,
  EXP021_CANDIDATE_SHORT_AB_60_90,
  EXP021_CANDIDATE_SHORT_AB_90_60,
  EXP021_CANDIDATE_SHORT_AB_PLANS,
  EXP021_DEFAULT_CALIBRATION_PLAN,
  EXP021_UPPER_BOUND_V2,
  findPhaseSpecByCadence,
  nominalTotalDurationMs,
  resolveExp021CalibrationPlan,
  resolveExp021CalibrationPlanFromAuthority,
  type Exp021CalibrationPhaseSpec,
  type Exp021CalibrationPlan,
} from './reference-capture-exp021-calibration-plan.lib';
import {
  buildExp021IntendedSlotOffsets,
  countIntendedSlotsForCadence,
} from './reference-capture-exp021-request-slots.lib';
import {
  buildFullPhaseOverlappingSettlementProbesForPhase,
  computeExp021SettlementQueryBudget,
  countFullPhaseOverlappingTilesForNominalPhase,
  EXP021_MANDATORY_AGES_MS,
  usesFullPhaseOverlappingSettlementStrategy,
} from './reference-capture-settlement-shadow.policy';
import { PhysicalDrivePhaseTracker } from './reference-capture-exp-021-motion.lib';
import {
  expectSettlementGeometry,
  expectShortAbPlanDefinition,
  SHORT_AB_EXPECTED_SETTLEMENT_WINDOWS_PER_PHASE,
  SHORT_AB_EXPECTED_SLOT_COUNT_BY_CADENCE_MS,
  SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_OBSERVATIONS,
  SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_WINDOWS,
} from './reference-capture-exp021-short-ab-geometry.assertions';

describe('EXP-021 CANDIDATE_SHORT_AB_60_90 reversed-order plan', () => {
  const plan = EXP021_CANDIDATE_SHORT_AB_60_90;
  const plan90_60 = EXP021_CANDIDATE_SHORT_AB_90_60;
  const t0Ms = Date.parse('2026-09-12T10:00:00.000Z');

  it('resolves via EXP021_CALIBRATION_PLAN=CANDIDATE_SHORT_AB_60_90', () => {
    expect(
      resolveExp021CalibrationPlan({ EXP021_CALIBRATION_PLAN: 'CANDIDATE_SHORT_AB_60_90' }),
    ).toBe(EXP021_CANDIDATE_SHORT_AB_60_90);
    expect(plan.planId).toBe('candidate_short_ab_60_90');
    expect(plan.planVersion).toBe('EXP021_CANDIDATE_SHORT_AB_60_90');
  });

  it('defines cadence sequence 60→90 only — no 120 phase', () => {
    expect(cadenceSequenceFromPlan(plan)).toEqual([60_000, 90_000]);
    expect(cadenceSequenceLabel(plan)).toBe('60_90');
    expect(cadenceSequenceArrow(plan)).toBe('60→90');
    expect(plan.phases.length).toBe(2);
    expect(plan.phases.some((phase) => phase.cadenceMs === 120_000)).toBe(false);
    expect(plan.phases.every((phase) => phase.role === 'EXPERIMENTAL')).toBe(true);
  });

  it('is a pure order reversal of CANDIDATE_SHORT_AB_90_60 with identical phase specs', () => {
    expect(plan.phases[0]).toEqual(plan90_60.phases[1]);
    expect(plan.phases[1]).toEqual(plan90_60.phases[0]);
    expect(plan.maxTotalDurationMs).toBe(plan90_60.maxTotalDurationMs);
    expect(plan.totalGraceBudgetMs).toBe(plan90_60.totalGraceBudgetMs);
    expect(nominalTotalDurationMs(plan)).toBe(nominalTotalDurationMs(plan90_60));
    expect(plan.advancementMode).toBe(plan90_60.advancementMode);
  });

  it('default plan selection remains UPPER_BOUND_V2', () => {
    expect(resolveExp021CalibrationPlan({})).toBe(EXP021_UPPER_BOUND_V2);
    expect(EXP021_DEFAULT_CALIBRATION_PLAN).toBe(EXP021_UPPER_BOUND_V2);
    expect(resolveExp021CalibrationPlan({ EXP021_CALIBRATION_PLAN: 'CANDIDATE_SHORT_AB_90_60' })).toBe(
      plan90_60,
    );
  });

  it('resolves durable authority for 60→90 plan identity', () => {
    const resolved = resolveExp021CalibrationPlanFromAuthority({
      calibrationPlanId: 'candidate_short_ab_60_90',
      calibrationPlanVersion: 'EXP021_CANDIDATE_SHORT_AB_60_90',
    });
    expect(resolved).toBe(plan);
  });

  describe('cadence-value slot geometry (order independent)', () => {
    it('90s cadence => 7 slots for both plan orders', () => {
      expect(countIntendedSlotsForCadence(90_000, plan)).toBe(7);
      expect(countIntendedSlotsForCadence(90_000, plan90_60)).toBe(7);
      expect(SHORT_AB_EXPECTED_SLOT_COUNT_BY_CADENCE_MS[90_000]).toBe(7);
    });

    it('60s cadence => 10 slots for both plan orders', () => {
      expect(countIntendedSlotsForCadence(60_000, plan)).toBe(10);
      expect(countIntendedSlotsForCadence(60_000, plan90_60)).toBe(10);
      expect(SHORT_AB_EXPECTED_SLOT_COUNT_BY_CADENCE_MS[60_000]).toBe(10);
    });

    it('phase index 0 is 60s (10 slots) and phase index 1 is 90s (7 slots)', () => {
      const phase0Offsets = buildExp021IntendedSlotOffsets({
        cadenceMs: plan.phases[0].cadenceMs,
        phaseDurationMs: plan.phases[0].targetDurationMs,
      });
      const phase1Offsets = buildExp021IntendedSlotOffsets({
        cadenceMs: plan.phases[1].cadenceMs,
        phaseDurationMs: plan.phases[1].targetDurationMs,
      });
      expect(plan.phases[0].cadenceMs).toBe(60_000);
      expect(phase0Offsets.length).toBe(10);
      expect(plan.phases[1].cadenceMs).toBe(90_000);
      expect(phase1Offsets.length).toBe(7);
    });
  });

  describe('settlement query budget (order invariant)', () => {
    it('has 19 settlement windows per 10-minute phase for each cadence', () => {
      for (const phase of plan.phases) {
        expect(
          countFullPhaseOverlappingTilesForNominalPhase({
            nominalPhaseDurationMs: phase.targetDurationMs,
          }),
        ).toBe(19);
      }
    });

    it('budget: 38 windows × 6 ages = 228 observations for 60→90', () => {
      const budget = computeExp021SettlementQueryBudget(plan);
      expect(budget.fullPhaseTileCount).toBe(SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_WINDOWS);
      expect(budget.expectedSettlementQueryCount).toBe(SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_OBSERVATIONS);
      expectSettlementGeometry(plan);
    });

    it('total settlement budget matches 90→60 plan (order invariant)', () => {
      const budget60_90 = computeExp021SettlementQueryBudget(plan);
      const budget90_60 = computeExp021SettlementQueryBudget(plan90_60);
      expect(budget60_90.fullPhaseTileCount).toBe(budget90_60.fullPhaseTileCount);
      expect(budget60_90.expectedSettlementQueryCount).toBe(budget90_60.expectedSettlementQueryCount);
      expect(budget60_90.nominalPhaseMinutes).toBe(budget90_60.nominalPhaseMinutes);
    });

    it('mandatory ages, phase attribution, and overlapping strategy are order-invariant', () => {
      for (const shortAbPlan of EXP021_CANDIDATE_SHORT_AB_PLANS) {
        expect(usesFullPhaseOverlappingSettlementStrategy(shortAbPlan)).toBe(true);
        const budget = computeExp021SettlementQueryBudget(shortAbPlan);
        expect(budget.fullPhaseTileCount).toBe(SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_WINDOWS);
        expect(budget.expectedSettlementQueryCount).toBe(
          budget.fullPhaseTileCount * EXP021_MANDATORY_AGES_MS.length,
        );
        expect(budget.expectedSettlementQueryCount).toBe(SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_OBSERVATIONS);
        for (const phase of shortAbPlan.phases) {
          expect(
            countFullPhaseOverlappingTilesForNominalPhase({
              nominalPhaseDurationMs: phase.targetDurationMs,
            }),
          ).toBe(SHORT_AB_EXPECTED_SETTLEMENT_WINDOWS_PER_PHASE);
          const probes = buildFullPhaseOverlappingSettlementProbesForPhase({
            phasePollIntervalMs: phase.cadenceMs,
            phaseStartedAtMs: t0Ms,
            phaseEndMs: t0Ms + phase.targetDurationMs,
          });
          expect(probes.every((probe) => probe.phasePollIntervalMs === phase.cadenceMs)).toBe(true);
        }
      }
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
    it('advances 60→90 on wall-clock expiry', () => {
      const phase60 = plan.phases[0];
      const tracker = new PhysicalDrivePhaseTracker();
      tracker.beginPhase(
        phase60.cadenceMs,
        t0Ms,
        buildPhaseAdvancementConfig(plan, phase60),
      );
      const boundaryMs = t0Ms + phase60.targetDurationMs;
      expect(tracker.shouldAdvancePhase(boundaryMs)).toBe(true);

      const phase90 = plan.phases[1];
      tracker.beginPhase(
        phase90.cadenceMs,
        boundaryMs,
        buildPhaseAdvancementConfig(plan, phase90),
      );
      expect(phase90.cadenceMs).toBe(90_000);
      expect(tracker.shouldAdvancePhase(boundaryMs + phase90.targetDurationMs)).toBe(true);
    });

    it('terminalizes final phase (90s when second) on wall-clock expiry — not hardcoded 60s', () => {
      const finalPhase = plan.phases[plan.phases.length - 1];
      expect(finalPhase.cadenceMs).toBe(90_000);
      const phaseStartMs = t0Ms + plan.phases[0].targetDurationMs;
      const tracker = new PhysicalDrivePhaseTracker();
      tracker.beginPhase(
        finalPhase.cadenceMs,
        phaseStartMs,
        buildPhaseAdvancementConfig(plan, finalPhase),
      );
      const expiryMs = phaseStartMs + finalPhase.targetDurationMs;
      const lastPhaseIndex = plan.phases.length - 1;
      const finalPhaseWallClockExpired =
        lastPhaseIndex === plan.phases.length - 1 && tracker.shouldAdvancePhase(expiryMs);
      expect(finalPhaseWallClockExpired).toBe(true);
    });
  });

  describe('short A/B family geometry assertions', () => {
    it('validates both registered short A/B plans', () => {
      for (const shortAbPlan of EXP021_CANDIDATE_SHORT_AB_PLANS) {
        expectShortAbPlanDefinition(shortAbPlan);
        expect(usesFullPhaseOverlappingSettlementStrategy(shortAbPlan)).toBe(true);
        expect(findPhaseSpecByCadence(shortAbPlan, 120_000)).toBeUndefined();
      }
    });

    describe('invalid phase-order regression matrix (fail-closed)', () => {
      const phase90 = plan90_60.phases[0];
      const phase60 = plan90_60.phases[1];
      const phase120: Exp021CalibrationPhaseSpec = {
        cadenceMs: 120_000,
        targetDurationMs: 10 * 60_000,
        role: 'EXPERIMENTAL',
        minSuccessfulRequests: 5,
      };

      function mockShortAbPlanWithPhases(phases: readonly Exp021CalibrationPhaseSpec[]): Exp021CalibrationPlan {
        return { ...plan90_60, phases } as Exp021CalibrationPlan;
      }

      it('rejects [90000,90000]', () => {
        expect(() =>
          expectShortAbPlanDefinition(mockShortAbPlanWithPhases([phase90, phase90])),
        ).toThrow(/permitted cadences/);
      });

      it('rejects [60000,60000]', () => {
        expect(() =>
          expectShortAbPlanDefinition(mockShortAbPlanWithPhases([phase60, phase60])),
        ).toThrow(/permitted cadences/);
      });

      it('rejects [120000,60000]', () => {
        expect(() =>
          expectShortAbPlanDefinition(mockShortAbPlanWithPhases([phase120, phase60])),
        ).toThrow(/permitted cadences|120s phase present/);
      });

      it('rejects [60000,120000]', () => {
        expect(() =>
          expectShortAbPlanDefinition(mockShortAbPlanWithPhases([phase60, phase120])),
        ).toThrow(/permitted cadences|120s phase present/);
      });

      it('accepts only canonical [90000,60000] and [60000,90000] registered plans', () => {
        expectShortAbPlanDefinition(plan90_60);
        expectShortAbPlanDefinition(plan);
        expect(cadenceSequenceFromPlan(plan90_60)).toEqual([90_000, 60_000]);
        expect(cadenceSequenceFromPlan(plan)).toEqual([60_000, 90_000]);
        expect(EXP021_CANDIDATE_SHORT_AB_PLANS).toHaveLength(2);
      });
    });
  });
});

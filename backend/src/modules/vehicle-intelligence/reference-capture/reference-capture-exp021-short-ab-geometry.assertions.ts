/**
 * Shared scientific geometry assertions for CANDIDATE_SHORT_AB plans — no lifecycle simulation.
 * Validates by cadence value, not phase index.
 */
import {
  cadenceSequenceFromPlan,
  EXP021_CANDIDATE_SHORT_AB_60_90,
  EXP021_CANDIDATE_SHORT_AB_90_60,
  EXP021_CANDIDATE_SHORT_AB_PLANS,
  resolveExp021CalibrationPlanFromSources,
  type Exp021CalibrationPlan,
} from './reference-capture-exp021-calibration-plan.lib';
import { countIntendedSlotsForCadence } from './reference-capture-exp021-request-slots.lib';
import { resolveExp021CalibrationPlanForSeries } from './reference-capture-hf-calibration-phase.policy';
import { computeExp021SettlementQueryBudget } from './reference-capture-settlement-shadow.policy';
import type {
  HfCalibrationPhaseRuntimeCounters,
  HfCalibrationSeriesState,
} from './reference-capture-hf-calibration-phase.policy';

export const SHORT_AB_PERMITTED_CADENCES_MS = [60_000, 90_000] as const;

export const SHORT_AB_EXPECTED_SLOT_COUNT_BY_CADENCE_MS: Readonly<Record<number, number>> = {
  60_000: 10,
  90_000: 7,
};

export const SHORT_AB_EXPECTED_SETTLEMENT_WINDOWS_PER_PHASE = 19;
export const SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_WINDOWS = 38;
export const SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_OBSERVATIONS = 228;

export function isCandidateShortAbPlan(plan: Exp021CalibrationPlan): boolean {
  return EXP021_CANDIDATE_SHORT_AB_PLANS.some((candidate) => candidate.planId === plan.planId);
}

export function resolveCandidateShortAbPlanById(planId: string): Exp021CalibrationPlan | null {
  return EXP021_CANDIDATE_SHORT_AB_PLANS.find((plan) => plan.planId === planId) ?? null;
}

export function resolveCandidateShortAbPlanFromSeries(
  series: HfCalibrationSeriesState,
): Exp021CalibrationPlan {
  const plan = resolveCandidateShortAbPlanById(series.calibrationPlanId ?? '');
  if (!plan) {
    throw new Error(`unknown short A/B calibrationPlanId: ${series.calibrationPlanId ?? 'null'}`);
  }
  return plan;
}

export function expectShortAbPlanDefinition(plan: Exp021CalibrationPlan): void {
  if (!isCandidateShortAbPlan(plan)) {
    throw new Error(`not a CANDIDATE_SHORT_AB plan: ${plan.planId}`);
  }
  const cadences = cadenceSequenceFromPlan(plan);
  if (cadences.length !== 2) {
    throw new Error(`short A/B plan expected 2 phases, got ${cadences.length}`);
  }
  const sorted = [...cadences].sort((a, b) => a - b);
  if (sorted.join(',') !== '60000,90000') {
    throw new Error(
      `short A/B permitted cadences must be exactly {60000,90000}, got ${cadences.join(',')}`,
    );
  }
  if (cadences.includes(120_000)) {
    throw new Error('120s phase present in short A/B plan definition');
  }
  for (const cadence of cadences) {
    const expected = SHORT_AB_EXPECTED_SLOT_COUNT_BY_CADENCE_MS[cadence];
    if (expected === undefined) {
      throw new Error(`unsupported short A/B cadence ${cadence}`);
    }
    if (countIntendedSlotsForCadence(cadence, plan) !== expected) {
      throw new Error(`cadence ${cadence} expected ${expected} slots for plan ${plan.planId}`);
    }
  }
}

export function expectPhaseOrder(
  series: HfCalibrationSeriesState,
  plan: Exp021CalibrationPlan,
): void {
  const expected = cadenceSequenceFromPlan(plan).join(',');
  if (series.phaseOrder.join(',') !== expected) {
    throw new Error(`unexpected phaseOrder: ${series.phaseOrder.join(',')} expected ${expected}`);
  }
}

export function expectSlotGeometry(
  counters: HfCalibrationPhaseRuntimeCounters | null,
  series: HfCalibrationSeriesState,
  plan?: Exp021CalibrationPlan,
): void {
  const resolvedPlan = plan ?? resolveCandidateShortAbPlanFromSeries(series);
  const activeSlots = counters?.exp021RequestSlots?.length ?? 0;
  const activeCadence = series.activePhase?.effectivePollIntervalMs;
  if (activeCadence === 90_000 && activeSlots !== SHORT_AB_EXPECTED_SLOT_COUNT_BY_CADENCE_MS[90_000]) {
    throw new Error(`90s phase expected 7 slots, got ${activeSlots}`);
  }
  if (activeCadence === 60_000 && activeSlots !== SHORT_AB_EXPECTED_SLOT_COUNT_BY_CADENCE_MS[60_000]) {
    throw new Error(`60s phase expected 10 slots, got ${activeSlots}`);
  }
  for (const cadence of SHORT_AB_PERMITTED_CADENCES_MS) {
    const completed = series.completedPhaseSummaries?.find(
      (summary) => summary.effectivePollIntervalMs === cadence,
    );
    if (completed) {
      const expected = SHORT_AB_EXPECTED_SLOT_COUNT_BY_CADENCE_MS[cadence];
      if (countIntendedSlotsForCadence(cadence, resolvedPlan) !== expected) {
        throw new Error(`${cadence}ms slot count authority mismatch for plan ${resolvedPlan.planId}`);
      }
    }
  }
}

export function expectSettlementGeometry(
  plan: Exp021CalibrationPlan = EXP021_CANDIDATE_SHORT_AB_90_60,
): void {
  if (!isCandidateShortAbPlan(plan)) {
    throw new Error(`settlement geometry helper only for short A/B plans: ${plan.planId}`);
  }
  const budget = computeExp021SettlementQueryBudget(plan);
  if (
    budget.fullPhaseTileCount !== SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_WINDOWS ||
    budget.expectedSettlementQueryCount !== SHORT_AB_EXPECTED_TOTAL_SETTLEMENT_OBSERVATIONS
  ) {
    throw new Error(`settlement geometry mismatch for short AB plan ${plan.planId}`);
  }
}

export function expectPlanAuthority(
  series: HfCalibrationSeriesState,
  plan: Exp021CalibrationPlan,
): void {
  if (series.calibrationPlanId !== plan.planId) {
    throw new Error(`calibrationPlanId mismatch: ${series.calibrationPlanId}`);
  }
  if (series.calibrationPlanVersion !== plan.planVersion) {
    throw new Error(`calibrationPlanVersion mismatch: ${series.calibrationPlanVersion}`);
  }
  const recovered = resolveExp021CalibrationPlanForSeries(series, {
    EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3',
  });
  if (recovered.planId !== plan.planId) {
    throw new Error('series authority recovery failed');
  }
  const fromMeta = resolveExp021CalibrationPlanFromSources({
    seriesPlanId: null,
    seriesPlanVersion: null,
    metadataPlanId: plan.planId,
    metadataPlanVersion: plan.planVersion,
    env: { EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3' },
  });
  if (fromMeta.planId !== plan.planId) {
    throw new Error('metadata authority precedence failed');
  }
}

export function expectNo120Phase(series: HfCalibrationSeriesState): void {
  if (series.phaseOrder.includes(120_000)) {
    throw new Error('120s phase present');
  }
  if (series.completedPhases?.some((phase) => phase.effectivePollIntervalMs === 120_000)) {
    throw new Error('120s completed phase present');
  }
}

export { EXP021_CANDIDATE_SHORT_AB_60_90, EXP021_CANDIDATE_SHORT_AB_90_60 };

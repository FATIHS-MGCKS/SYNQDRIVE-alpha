/**
 * Shared scientific geometry assertions for candidate_short_ab_90_60 — no lifecycle simulation.
 */
import {
  resolveExp021CalibrationPlanFromSources,
} from './reference-capture-exp021-calibration-plan.lib';
import { EXP021_CANDIDATE_SHORT_AB_90_60 } from './reference-capture-exp021-calibration-plan.lib';
import { countIntendedSlotsForCadence } from './reference-capture-exp021-request-slots.lib';
import { resolveExp021CalibrationPlanForSeries } from './reference-capture-hf-calibration-phase.policy';
import { computeExp021SettlementQueryBudget } from './reference-capture-settlement-shadow.policy';
import type {
  HfCalibrationPhaseRuntimeCounters,
  HfCalibrationSeriesState,
} from './reference-capture-hf-calibration-phase.policy';

export function expectPhaseOrder(series: HfCalibrationSeriesState): void {
  if (series.phaseOrder.join(',') !== '90000,60000') {
    throw new Error(`unexpected phaseOrder: ${series.phaseOrder.join(',')}`);
  }
}

export function expectSlotGeometry(
  counters: HfCalibrationPhaseRuntimeCounters | null,
  series: HfCalibrationSeriesState,
): void {
  const activeSlots = counters?.exp021RequestSlots?.length ?? 0;
  const activeCadence = series.activePhase?.effectivePollIntervalMs;
  if (activeCadence === 90_000 && activeSlots !== 7) {
    throw new Error(`90s phase expected 7 slots, got ${activeSlots}`);
  }
  if (activeCadence === 60_000 && activeSlots !== 10) {
    throw new Error(`60s phase expected 10 slots, got ${activeSlots}`);
  }
  const completed90 = series.completedPhaseSummaries?.find(
    (s) => s.effectivePollIntervalMs === 90_000,
  );
  if (completed90 && countIntendedSlotsForCadence(90_000, EXP021_CANDIDATE_SHORT_AB_90_60) !== 7) {
    throw new Error('90s slot count authority mismatch');
  }
}

export function expectSettlementGeometry(): void {
  const budget = computeExp021SettlementQueryBudget(EXP021_CANDIDATE_SHORT_AB_90_60);
  if (budget.fullPhaseTileCount !== 38 || budget.expectedSettlementQueryCount !== 228) {
    throw new Error('settlement geometry mismatch for short AB plan');
  }
}

export function expectPlanAuthority(series: HfCalibrationSeriesState): void {
  if (series.calibrationPlanId !== 'candidate_short_ab_90_60') {
    throw new Error(`calibrationPlanId mismatch: ${series.calibrationPlanId}`);
  }
  if (series.calibrationPlanVersion !== 'EXP021_CANDIDATE_SHORT_AB_90_60') {
    throw new Error(`calibrationPlanVersion mismatch: ${series.calibrationPlanVersion}`);
  }
  const recovered = resolveExp021CalibrationPlanForSeries(series, {
    EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3',
  });
  if (recovered.planId !== 'candidate_short_ab_90_60') {
    throw new Error('series authority recovery failed');
  }
  const fromMeta = resolveExp021CalibrationPlanFromSources({
    seriesPlanId: null,
    seriesPlanVersion: null,
    metadataPlanId: 'candidate_short_ab_90_60',
    metadataPlanVersion: 'EXP021_CANDIDATE_SHORT_AB_90_60',
    env: { EXP021_CALIBRATION_PLAN: 'CANDIDATE_BRACKET_V3' },
  });
  if (fromMeta.planId !== 'candidate_short_ab_90_60') {
    throw new Error('metadata authority precedence failed');
  }
}

export function expectNo120Phase(series: HfCalibrationSeriesState): void {
  if (series.phaseOrder.includes(120_000)) {
    throw new Error('120s phase present');
  }
  if (series.completedPhases?.some((p) => p.effectivePollIntervalMs === 120_000)) {
    throw new Error('120s completed phase present');
  }
}

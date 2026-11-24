import { Logger } from '@nestjs/common';
import type { HmOnlyReadinessObservationResult } from './hm-only-canonical-readiness-observation.types';

const log = new Logger('HmOnlyCanonicalReadinessObservation');

/** Bounded labels only — no VIN/PII in metric keys. */
export type HmReadinessObservationMetricKey =
  | 'hm_observation_evaluated_total'
  | 'hm_observation_legacy_admissible_total'
  | 'hm_observation_canonical_pass_total'
  | 'hm_observation_canonical_blocked_total'
  | 'hm_observation_not_evaluable_total'
  | 'hm_observation_divergence_total'
  | 'hm_observation_error_total';

const counters = new Map<HmReadinessObservationMetricKey, number>();

export function resetHmReadinessObservationMetricsForTests(): void {
  counters.clear();
}

export function getHmReadinessObservationMetric(key: HmReadinessObservationMetricKey): number {
  return counters.get(key) ?? 0;
}

function increment(key: HmReadinessObservationMetricKey): void {
  counters.set(key, (counters.get(key) ?? 0) + 1);
}

export function recordHmReadinessObservation(result: HmOnlyReadinessObservationResult, error?: string): void {
  increment('hm_observation_evaluated_total');
  if (result.legacyAdmission === 'LEGACY_ADMISSIBLE') {
    increment('hm_observation_legacy_admissible_total');
  }
  if (result.canonicalReadiness === 'CANONICAL_READINESS_PASS') {
    increment('hm_observation_canonical_pass_total');
  } else if (result.canonicalReadiness === 'CANONICAL_READINESS_BLOCKED') {
    increment('hm_observation_canonical_blocked_total');
  } else {
    increment('hm_observation_not_evaluable_total');
  }
  if (result.divergenceLegacyOnly) {
    increment('hm_observation_divergence_total');
  }
  if (error) {
    increment('hm_observation_error_total');
  }

  log.log(
    JSON.stringify({
      op: 'hm_only_readiness_observation',
      organizationId: result.metadata.organizationId,
      hmVehicleId: result.metadata.hmVehicleId,
      selectedProduct: result.metadata.selectedProduct,
      legacyAdmission: result.legacyAdmission,
      canonicalReadiness: result.canonicalReadiness,
      expectedBillingClassification: result.expectedBillingClassification,
      powertrainClass: result.powertrainClass,
      providerMirrorFreshness: result.providerMirrorFreshness,
      divergenceLegacyOnly: result.divergenceLegacyOnly,
      evaluationCompleteness: result.evaluationCompleteness,
      legacyBlockerCount: result.legacyBlockerReasonCodes.length,
      canonicalBlockerCount: result.canonicalBlockerReasonCodes.length,
      durationMs: result.metadata.evaluationDurationMs,
      ...(error ? { observationError: error } : {}),
    }),
  );
}
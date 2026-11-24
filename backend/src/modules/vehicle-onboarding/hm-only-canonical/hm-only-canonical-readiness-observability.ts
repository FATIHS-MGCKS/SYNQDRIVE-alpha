import { Logger } from '@nestjs/common';
import { NotFoundException } from '@nestjs/common';
import { VehicleOnboardingError } from '../errors/vehicle-onboarding.errors';
import type { HmOnlyReadinessObservationResult } from './hm-only-canonical-readiness-observation.types';

const log = new Logger('HmOnlyCanonicalReadinessObservation');

/** Bounded labels only — no VIN/PII in metric keys. */
export type HmReadinessObservationMetricKey =
  | 'hm_observation_evaluated_total'
  | 'hm_observation_legacy_admissible_total'
  | 'hm_observation_canonical_admission_eligible_total'
  | 'hm_observation_canonical_readiness_pass_total'
  | 'hm_observation_canonical_readiness_blocked_total'
  | 'hm_observation_not_evaluable_total'
  | 'hm_observation_divergence_total'
  | 'hm_observation_error_total'
  | 'hm_observation_overload_total'
  | 'hm_observation_timeout_total'
  | 'hm_observation_idempotent_replay_total'
  | 'hm_observation_legacy_reconciliation_total';

const ALLOWLISTED_ERROR_CODES = new Set([
  'OBSERVATION_INTERNAL_ERROR',
  'OBSERVATION_OVERLOAD',
  'OBSERVATION_TIMEOUT',
  'OBSERVATION_SNAPSHOT_RACE',
  'NOT_FOUND',
  'ORG_SCOPE_MISMATCH',
  'HM_TENANT_ACCESS_DENIED',
]);

/**
 * Process-local counters only — not exported to Prometheus/statsd.
 * Resets on process restart; not aggregated across replicas without external sink.
 */
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

export function sanitizeObservationErrorCode(error: unknown): string {
  if (error instanceof VehicleOnboardingError) {
    return ALLOWLISTED_ERROR_CODES.has(error.code) ? error.code : 'OBSERVATION_INTERNAL_ERROR';
  }
  if (error instanceof NotFoundException) {
    return 'NOT_FOUND';
  }
  return 'OBSERVATION_INTERNAL_ERROR';
}

export function recordHmReadinessObservation(
  result: HmOnlyReadinessObservationResult,
  errorCode?: string,
): void {
  increment('hm_observation_evaluated_total');
  if (result.legacyAdmission === 'LEGACY_ADMISSIBLE') {
    increment('hm_observation_legacy_admissible_total');
  }
  if (result.canonicalAdmission === 'CANONICAL_ADMISSION_ELIGIBLE') {
    increment('hm_observation_canonical_admission_eligible_total');
  }
  if (result.canonicalAdmission === 'CANONICAL_IDEMPOTENT_REPLAY') {
    increment('hm_observation_idempotent_replay_total');
  }
  if (result.canonicalAdmission === 'CANONICAL_LEGACY_RECONCILIATION_REQUIRED') {
    increment('hm_observation_legacy_reconciliation_total');
  }
  if (result.canonicalReadiness === 'CANONICAL_READINESS_PASS') {
    increment('hm_observation_canonical_readiness_pass_total');
  } else if (result.canonicalReadiness === 'CANONICAL_READINESS_BLOCKED') {
    increment('hm_observation_canonical_readiness_blocked_total');
  } else {
    increment('hm_observation_not_evaluable_total');
  }
  if (result.divergenceLegacyOnly) {
    increment('hm_observation_divergence_total');
  }
  if (errorCode) {
    increment('hm_observation_error_total');
    if (errorCode === 'OBSERVATION_OVERLOAD') {
      increment('hm_observation_overload_total');
    }
    if (errorCode === 'OBSERVATION_TIMEOUT') {
      increment('hm_observation_timeout_total');
    }
  }

  const safeError = errorCode && ALLOWLISTED_ERROR_CODES.has(errorCode) ? errorCode : undefined;

  log.log(
    JSON.stringify({
      op: 'hm_only_readiness_observation',
      organizationId: result.metadata.organizationId,
      hmVehicleId: result.metadata.hmVehicleId,
      selectedProduct: result.metadata.selectedProduct,
      legacyAdmission: result.legacyAdmission,
      canonicalAdmission: result.canonicalAdmission,
      canonicalReadiness: result.canonicalReadiness,
      expectedBillingClassification: result.expectedBillingClassification,
      billingPredictionReasonCode: result.billingPredictionReasonCode,
      powertrainClass: result.powertrainClass,
      providerMirrorFreshness: result.providerMirrorFreshness,
      divergenceLegacyOnly: result.divergenceLegacyOnly,
      evaluationCompleteness: result.evaluationCompleteness,
      legacyBlockerCount: result.legacyBlockerReasonCodes.length,
      canonicalAdmissionBlockerCount: result.canonicalAdmissionBlockerReasonCodes.length,
      canonicalBlockerCount: result.canonicalBlockerReasonCodes.length,
      durationMs: result.metadata.evaluationDurationMs,
      metricsScope: 'PROCESS_LOCAL',
      ...(result.metadata.tenantScopeMismatch ? { tenantScopeMismatch: true } : {}),
      ...(safeError ? { observationErrorCode: safeError } : {}),
    }),
  );
}
import {
  DTC02_ACTIVE_DTC_PROPOSED_INTERVAL_MS,
  DTC02_CONFIRMED_SOURCE_FRESH_MS,
  DTC02_LEGACY_POLL_INTERVAL_MS,
  DTC02_MAX_DEFERRAL_FROM_SUCCESS_MS,
  DTC02_MIN_SHADOW_INTERVAL_MS,
  DTC02_OPERATIONAL_STALE_MS,
} from './dtc-02-adaptive-planner.constants';
import type {
  Dtc02AdaptivePlannerInput,
  Dtc02AdaptivePlannerResult,
  Dtc02PlannerEvidenceQuality,
  Dtc02WebhookEvidenceQuality,
} from './dtc-02-adaptive-planner.types';

const EXCLUDED_LIFECYCLES = new Set(['OFFBOARDED', 'ARCHIVED']);

export function computeLegacyNextCheckAtMs(input: Dtc02AdaptivePlannerInput): number {
  const anchor = input.lastSuccessfulDtcCheckAtMs ?? input.evaluatedAtMs;
  return anchor + DTC02_LEGACY_POLL_INTERVAL_MS;
}

function classifyOperationalFreshness(
  input: Dtc02AdaptivePlannerInput,
): 'fresh' | 'stale' | 'unknown' {
  if (input.lastSuccessfulDtcCheckAtMs == null) return 'unknown';
  const age = input.evaluatedAtMs - input.lastSuccessfulDtcCheckAtMs;
  if (age > DTC02_OPERATIONAL_STALE_MS) return 'stale';
  return 'fresh';
}

function resolveEvidenceQuality(
  input: Dtc02AdaptivePlannerInput,
  operational: 'fresh' | 'stale' | 'unknown',
): Dtc02PlannerEvidenceQuality {
  if (input.webhookEvidenceQuality === 'unknown' || operational === 'unknown') {
    return 'unknown';
  }
  if (input.providerCapability === 'unknown') return 'unknown';
  if (operational === 'stale' || input.webhookEvidenceQuality === 'stale') return 'low';
  if (input.webhookEvidenceQuality === 'complete' && operational === 'fresh') return 'high';
  if (input.webhookEvidenceQuality === 'partial') return 'medium';
  if (input.webhookEvidenceQuality === 'none') return 'low';
  return 'unknown';
}

function confirmedCompleteIsFresh(input: Dtc02AdaptivePlannerInput): boolean {
  if (input.lastConfirmedCompleteSourceAtMs == null) return false;
  return (
    input.evaluatedAtMs - input.lastConfirmedCompleteSourceAtMs <= DTC02_CONFIRMED_SOURCE_FRESH_MS
  );
}

function partialBlocksCompleteTrust(input: Dtc02AdaptivePlannerInput): boolean {
  if (input.lastPartialWebhookSourceAtMs == null) return false;
  if (input.lastConfirmedCompleteSourceAtMs == null) return true;
  return input.lastPartialWebhookSourceAtMs > input.lastConfirmedCompleteSourceAtMs;
}

function clampProposed(
  input: Dtc02AdaptivePlannerInput,
  legacyNext: number,
  candidateMs: number,
): number {
  const minAt = input.evaluatedAtMs + DTC02_MIN_SHADOW_INTERVAL_MS;
  const maxDeferAt =
    (input.lastSuccessfulDtcCheckAtMs ?? input.evaluatedAtMs) +
    DTC02_MAX_DEFERRAL_FROM_SUCCESS_MS;
  const cappedMax = Math.min(legacyNext, maxDeferAt);
  return Math.min(Math.max(candidateMs, minAt), cappedMax);
}

/**
 * Pure deterministic adaptive DTC poll planner (shadow only).
 * No I/O, clocks beyond provided evaluatedAtMs, or queue mutations.
 */
export function planDtc02AdaptivePollCheck(
  input: Dtc02AdaptivePlannerInput,
): Dtc02AdaptivePlannerResult {
  const legacyNextCheckAtMs = computeLegacyNextCheckAtMs(input);
  const lifecycle = (input.registryLifecycle ?? 'ACTIVE').toUpperCase();
  const safetyConstraints: string[] = ['PRESERVE_LEGACY_3H_FALLBACK'];

  if (EXCLUDED_LIFECYCLES.has(lifecycle)) {
    return {
      legacyNextCheckAtMs,
      proposedNextCheckAtMs: legacyNextCheckAtMs,
      decisionReason: 'REGISTRY_LIFECYCLE_EXCLUDED',
      evidenceQuality: 'unknown',
      requiresLegacyFallback: true,
      safetyConstraints: [...safetyConstraints, 'NO_ADAPTIVE_FOR_EXCLUDED_LIFECYCLE'],
      projectedDeferMs: legacyNextCheckAtMs - input.evaluatedAtMs,
      projectedPollReductionMs: 0,
      excluded: true,
    };
  }

  const operational = classifyOperationalFreshness(input);
  const evidenceQuality = resolveEvidenceQuality(input, operational);
  let requiresLegacyFallback = false;
  let decisionReason = 'LEGACY_CADENCE_BASELINE';
  let proposed = legacyNextCheckAtMs;

  if (input.providerCapability === 'unknown') {
    requiresLegacyFallback = true;
    decisionReason = 'UNKNOWN_PROVIDER_CAPABILITY';
    safetyConstraints.push('FAIL_CLOSED_UNKNOWN_CAPABILITY');
  } else if (input.providerErrorState === 'auth_denied') {
    requiresLegacyFallback = true;
    decisionReason = 'PROVIDER_AUTH_DENIED_USE_LEGACY';
    safetyConstraints.push('NO_DEFER_ON_AUTH_FAILURE');
    proposed = legacyNextCheckAtMs;
  } else if (input.providerErrorState === 'transient' || input.providerErrorState === 'unknown') {
    requiresLegacyFallback = true;
    decisionReason = 'PROVIDER_ERROR_ACCELERATE_SHADOW';
    safetyConstraints.push('PROVIDER_FAILURE_CANNOT_SUPPRESS_CHECKS');
    proposed = clampProposed(
      input,
      legacyNextCheckAtMs,
      input.evaluatedAtMs + DTC02_MIN_SHADOW_INTERVAL_MS,
    );
  } else if (operational === 'stale' || input.lastSuccessfulDtcCheckAtMs == null) {
    requiresLegacyFallback = true;
    decisionReason = 'STALE_OR_MISSING_SUCCESS_ACCELERATE';
    safetyConstraints.push('NO_DEFER_WITHOUT_FRESH_SUCCESS');
    proposed = clampProposed(
      input,
      legacyNextCheckAtMs,
      input.evaluatedAtMs + DTC02_MIN_SHADOW_INTERVAL_MS,
    );
  } else if (partialBlocksCompleteTrust(input)) {
    requiresLegacyFallback = true;
    decisionReason = 'PARTIAL_WEBHOOK_BLOCKS_COMPLETE_TRUST';
    safetyConstraints.push('PARTIAL_CANNOT_REPLACE_CONFIRMED_COMPLETE');
    if (input.hasActiveDtc) {
      proposed = clampProposed(
        input,
        legacyNextCheckAtMs,
        input.evaluatedAtMs + DTC02_ACTIVE_DTC_PROPOSED_INTERVAL_MS,
      );
      decisionReason = 'ACTIVE_DTC_WITH_PARTIAL_EVIDENCE';
    } else {
      proposed = legacyNextCheckAtMs;
    }
  } else if (input.hasActiveDtc) {
    decisionReason = 'ACTIVE_DTC_ACCELERATE_SHADOW';
    safetyConstraints.push('NO_FALSE_CLEAR_AUTHORIZATION');
    proposed = clampProposed(
      input,
      legacyNextCheckAtMs,
      input.evaluatedAtMs + DTC02_ACTIVE_DTC_PROPOSED_INTERVAL_MS,
    );
  } else if (
    confirmedCompleteIsFresh(input) &&
    (input.webhookEvidenceQuality === 'complete' || input.webhookEvidenceQuality === 'none')
  ) {
    decisionReason = 'FRESH_CONFIRMED_COMPLETE_DEFER_PROJECTED';
    safetyConstraints.push('BOUNDED_MAX_DEFERRAL');
    proposed = clampProposed(input, legacyNextCheckAtMs, legacyNextCheckAtMs);
  } else if (
    input.webhookEvidenceQuality === 'partial' ||
    input.webhookEvidenceQuality === 'unknown'
  ) {
    requiresLegacyFallback = true;
    decisionReason = 'UNRELIABLE_WEBHOOK_EVIDENCE_FALLBACK';
    safetyConstraints.push('UNKNOWN_EVIDENCE_NOT_RELIABLE');
    proposed = legacyNextCheckAtMs;
  } else {
    requiresLegacyFallback = true;
    decisionReason = 'CONSERVATIVE_LEGACY_FALLBACK';
    proposed = legacyNextCheckAtMs;
  }

  proposed = clampProposed(input, legacyNextCheckAtMs, proposed);

  const projectedDeferMs = proposed - input.evaluatedAtMs;
  /** Positive when shadow proposes deferring relative to legacy next tick (fewer polls). */
  const projectedPollReductionMs = proposed - legacyNextCheckAtMs;

  return {
    legacyNextCheckAtMs,
    proposedNextCheckAtMs: proposed,
    decisionReason,
    evidenceQuality,
    requiresLegacyFallback,
    safetyConstraints,
    projectedDeferMs,
    projectedPollReductionMs,
    excluded: false,
  };
}

export function deriveWebhookEvidenceQuality(input: {
  lastConfirmedCompleteSourceAtMs: number | null;
  lastPartialWebhookSourceAtMs: number | null;
  evaluatedAtMs: number;
}): Dtc02WebhookEvidenceQuality {
  const { lastConfirmedCompleteSourceAtMs, lastPartialWebhookSourceAtMs, evaluatedAtMs } =
    input;
  if (
    lastConfirmedCompleteSourceAtMs == null &&
    lastPartialWebhookSourceAtMs == null
  ) {
    return 'none';
  }
  if (
    lastPartialWebhookSourceAtMs != null &&
    (lastConfirmedCompleteSourceAtMs == null ||
      lastPartialWebhookSourceAtMs > lastConfirmedCompleteSourceAtMs)
  ) {
    const age = evaluatedAtMs - lastPartialWebhookSourceAtMs;
    if (age > DTC02_OPERATIONAL_STALE_MS) return 'stale';
    return 'partial';
  }
  if (lastConfirmedCompleteSourceAtMs != null) {
    const age = evaluatedAtMs - lastConfirmedCompleteSourceAtMs;
    if (age > DTC02_OPERATIONAL_STALE_MS) return 'stale';
    return 'complete';
  }
  return 'unknown';
}

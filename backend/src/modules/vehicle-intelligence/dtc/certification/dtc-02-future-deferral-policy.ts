import { DTC02_LEGACY_POLL_INTERVAL_MS, DTC02_OPERATIONAL_STALE_MS } from '../adaptive/dtc-02-adaptive-planner.constants';
import type { Dtc02SourceTrustReconciliationAssessment } from './dtc-02-source-trust-reconciliation';

/**
 * P4 — future controlled deferral policy (NOT ENABLED).
 * Production webhook reliability is NOT assumed.
 */

export const DTC_02_ADAPTIVE_DEFERRAL_ENABLED_ENV = 'DTC_02_ADAPTIVE_DEFERRAL_ENABLED';

/** Proposed P5 upper bound beyond legacy next tick (requires production webhook evidence). */
export const DTC02_P5_MAX_EXTRA_DEFERRAL_MS = 60 * 60_000;

/** Freshness SLO: operational success must be younger than this for deferral eligibility. */
export const DTC02_P5_FRESHNESS_SLO_MS = 2 * 60 * 60_000;

/** Hard fallback deadline: never defer past last success + legacy + extra bound. */
export function computeDtc02FallbackDeadlineMs(lastSuccessfulDtcCheckAtMs: number): number {
  return lastSuccessfulDtcCheckAtMs + DTC02_LEGACY_POLL_INTERVAL_MS + DTC02_P5_MAX_EXTRA_DEFERRAL_MS;
}

export type Dtc02FutureDeferralEligibilityInput = {
  shadowPlannerEnabled: boolean;
  deferralFlagEnabled: boolean;
  webhookCapabilityProvenInProduction: boolean;
  webhookDeliveryReliabilityProven: boolean;
  hasRecentConfirmedCompleteSource: boolean;
  providerErrorState: 'none' | 'transient' | 'auth_denied' | 'unknown';
  sourceTrust: Dtc02SourceTrustReconciliationAssessment;
  lastSuccessfulDtcCheckAtMs: number | null;
  evaluatedAtMs: number;
};

export type Dtc02FutureDeferralEligibility =
  | { eligible: false; reason: string }
  | {
      eligible: true;
      maxProposedNextCheckAtMs: number;
      freshnessSloMs: number;
      fallbackDeadlineMs: number;
    };

/**
 * P4 certification stub — always ineligible until P5 pilot gates pass.
 * Kill switch: unset DTC_02_ADAPTIVE_DEFERRAL_ENABLED or disable shadow flags.
 */
export function evaluateDtc02FutureDeferralEligibility(
  input: Dtc02FutureDeferralEligibilityInput,
): Dtc02FutureDeferralEligibility {
  if (input.deferralFlagEnabled) {
    return { eligible: false, reason: 'P4_DEFERRAL_FLAG_MUST_REMAIN_OFF' };
  }
  if (!input.shadowPlannerEnabled) {
    return { eligible: false, reason: 'SHADOW_NOT_ARMED' };
  }
  if (!input.webhookCapabilityProvenInProduction || !input.webhookDeliveryReliabilityProven) {
    return { eligible: false, reason: 'WEBHOOK_RELIABILITY_NOT_PROVEN' };
  }
  if (input.providerErrorState !== 'none') {
    return { eligible: false, reason: 'PROVIDER_ERROR_PRESENT' };
  }
  if (!input.hasRecentConfirmedCompleteSource) {
    return { eligible: false, reason: 'NO_RECENT_CONFIRMED_COMPLETE' };
  }
  if (input.sourceTrust.blocksFutureDeferral) {
    return { eligible: false, reason: 'SOURCE_TRUST_DIVERGENCE' };
  }
  if (input.lastSuccessfulDtcCheckAtMs == null) {
    return { eligible: false, reason: 'MISSING_SUCCESS_ANCHOR' };
  }
  const successAge = input.evaluatedAtMs - input.lastSuccessfulDtcCheckAtMs;
  if (successAge > DTC02_P5_FRESHNESS_SLO_MS) {
    return { eligible: false, reason: 'FRESHNESS_SLO_VIOLATION' };
  }
  if (successAge > DTC02_OPERATIONAL_STALE_MS) {
    return { eligible: false, reason: 'OPERATIONAL_STALE' };
  }

  const legacyNext = input.lastSuccessfulDtcCheckAtMs + DTC02_LEGACY_POLL_INTERVAL_MS;
  const fallbackDeadlineMs = computeDtc02FallbackDeadlineMs(input.lastSuccessfulDtcCheckAtMs);
  const maxProposedNextCheckAtMs = Math.min(
    legacyNext + DTC02_P5_MAX_EXTRA_DEFERRAL_MS,
    fallbackDeadlineMs,
  );

  return {
    eligible: true,
    maxProposedNextCheckAtMs,
    freshnessSloMs: DTC02_P5_FRESHNESS_SLO_MS,
    fallbackDeadlineMs,
  };
}

export function isDtc02AdaptiveDeferralEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[DTC_02_ADAPTIVE_DEFERRAL_ENABLED_ENV]?.trim().toLowerCase() === 'true';
}

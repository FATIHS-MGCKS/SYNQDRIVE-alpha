import {
  isApdShadowAdvancingDecision,
  isApdShadowLvBootstrapEligibleDecision,
  isApdShadowSimulatedLvSourceDecision,
} from './p25-apd-shadow-execution-versions';

export type LvProviderTimestampAdmissionInput = {
  visibleLvProviderTimestampMs: number | null | undefined;
  pollStartedAtMs: number;
  pollCompletedAtMs: number;
  reconciliation: boolean;
  prePollDecision: string;
};

export type LvProviderTimestampAdmissionResult =
  | { admit: true; usedBootstrapPath: boolean }
  | { admit: false; reason: string };

/**
 * Scientific guards for adopting a trustworthy LV provider source timestamp into
 * simulated policy LV state. Does not use fetchedAt or top-level snapshot times.
 */
export function evaluateLvProviderTimestampAdmission(
  input: LvProviderTimestampAdmissionInput,
): LvProviderTimestampAdmissionResult {
  if (!input.reconciliation) {
    return { admit: false, reason: 'NON_RECONCILIATION_POLL' };
  }
  if (!isApdShadowSimulatedLvSourceDecision(input.prePollDecision)) {
    return { admit: false, reason: 'DECISION_NOT_LV_SOURCE_ELIGIBLE' };
  }
  const visibleMs = input.visibleLvProviderTimestampMs;
  if (visibleMs == null || !Number.isFinite(visibleMs)) {
    return { admit: false, reason: 'MISSING_VISIBLE_LV_PROVIDER_TIMESTAMP' };
  }
  if (visibleMs > input.pollCompletedAtMs) {
    return { admit: false, reason: 'LV_PROVIDER_TIMESTAMP_AFTER_POLL_COMPLETION' };
  }
  const usedBootstrapPath = isApdShadowLvBootstrapEligibleDecision(input.prePollDecision);
  if (usedBootstrapPath && isApdShadowAdvancingDecision(input.prePollDecision)) {
    return { admit: false, reason: 'INVALID_DECISION_CLASSIFICATION' };
  }
  return { admit: true, usedBootstrapPath };
}

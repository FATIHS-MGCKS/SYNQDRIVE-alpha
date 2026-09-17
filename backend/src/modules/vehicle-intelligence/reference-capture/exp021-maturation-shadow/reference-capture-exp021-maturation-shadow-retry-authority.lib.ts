import type { Exp021MaturationShadowObservationAttempt } from '@prisma/client';
import { Exp021MaturationShadowProviderOutcomeClass } from '@prisma/client';
import { EXP021_MATURATION_SHADOW_MAX_TRANSPORT_RETRIES } from './reference-capture-exp021-maturation-shadow.constants';

export type Exp021MaturationShadowAttemptLike = Pick<
  Exp021MaturationShadowObservationAttempt,
  'providerRequestSucceeded' | 'providerOutcomeClass'
>;

export function isSuccessfulObservationAttempt(
  attempt: Exp021MaturationShadowAttemptLike,
): boolean {
  return (
    attempt.providerRequestSucceeded &&
    attempt.providerOutcomeClass !== Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR
  );
}

export function hasSuccessfulObservationAttempt(
  attempts: Exp021MaturationShadowAttemptLike[],
): boolean {
  return attempts.some(isSuccessfulObservationAttempt);
}

export function countDurableProviderAttempts(
  attempts: Exp021MaturationShadowAttemptLike[],
): number {
  return attempts.length;
}

export function isTransportRetryExhausted(
  attempts: Exp021MaturationShadowAttemptLike[],
  maxTransportRetries = EXP021_MATURATION_SHADOW_MAX_TRANSPORT_RETRIES,
): boolean {
  if (hasSuccessfulObservationAttempt(attempts)) {
    return true;
  }
  return attempts.length >= 1 + maxTransportRetries;
}

/**
 * Derive the next BullMQ transport retry ordinal from durable attempt ledger.
 * Primary schedule = 0; first retry after initial failure = 1; etc.
 */
export function deriveTransportRetryOrdinalFromAttempts(
  attempts: Exp021MaturationShadowAttemptLike[],
  maxTransportRetries = EXP021_MATURATION_SHADOW_MAX_TRANSPORT_RETRIES,
): number | null {
  if (hasSuccessfulObservationAttempt(attempts)) {
    return null;
  }
  if (attempts.length >= 1 + maxTransportRetries) {
    return null;
  }
  return attempts.length;
}

export function shouldScheduleTransportRetry(
  attempts: Exp021MaturationShadowAttemptLike[],
  maxTransportRetries = EXP021_MATURATION_SHADOW_MAX_TRANSPORT_RETRIES,
): boolean {
  return deriveTransportRetryOrdinalFromAttempts(attempts, maxTransportRetries) != null;
}

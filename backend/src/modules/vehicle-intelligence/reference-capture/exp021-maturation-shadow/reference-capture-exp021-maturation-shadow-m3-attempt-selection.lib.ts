import type { Exp021MaturationShadowProviderOutcomeClass } from '@prisma/client';
import type { Exp021MaturationShadowM3AttemptInput } from './reference-capture-exp021-maturation-shadow-m3.types';

type AttemptOutcomeFields = {
  providerRequestSucceeded: boolean;
  providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass;
};

/** Scientific ordering authority — actualAgeMs, never execution order. */
export function sortAttemptsByActualAge(attempts: Exp021MaturationShadowM3AttemptInput[]): Exp021MaturationShadowM3AttemptInput[] {
  return [...attempts].sort((a, b) => {
    if (a.actualAgeMs !== b.actualAgeMs) return a.actualAgeMs - b.actualAgeMs;
    return a.attemptOrdinal - b.attemptOrdinal;
  });
}

export function isProviderErrorAttempt(attempt: AttemptOutcomeFields): boolean {
  return !attempt.providerRequestSucceeded || attempt.providerOutcomeClass === 'PROVIDER_ERROR';
}

export function isProviderSuccessAttempt(attempt: AttemptOutcomeFields): boolean {
  return attempt.providerRequestSucceeded && attempt.providerOutcomeClass !== 'PROVIDER_ERROR';
}

export function isNegativeAvailabilitySuccess(attempt: AttemptOutcomeFields): boolean {
  return isProviderSuccessAttempt(attempt) && attempt.providerOutcomeClass === 'PROVIDER_SUCCESS_ZERO';
}

export function isPositiveAvailabilitySuccess(
  attempt: AttemptOutcomeFields,
  reconstructedUniqueCount: number,
): boolean {
  return isProviderSuccessAttempt(attempt) && reconstructedUniqueCount > 0;
}

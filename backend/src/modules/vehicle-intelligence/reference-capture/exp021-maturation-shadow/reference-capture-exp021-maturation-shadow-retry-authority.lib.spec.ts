import { Exp021MaturationShadowProviderOutcomeClass } from '@prisma/client';
import {
  deriveTransportRetryOrdinalFromAttempts,
  isTransportRetryExhausted,
  shouldScheduleTransportRetry,
} from './reference-capture-exp021-maturation-shadow-retry-authority.lib';

describe('retry authority from durable attempts', () => {
  const failure = {
    providerRequestSucceeded: false,
    providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_ERROR,
  };
  const success = {
    providerRequestSucceeded: true,
    providerOutcomeClass: Exp021MaturationShadowProviderOutcomeClass.PROVIDER_SUCCESS_NONZERO,
  };

  it('derives retry ordinal from attempt count', () => {
    expect(deriveTransportRetryOrdinalFromAttempts([])).toBe(0);
    expect(deriveTransportRetryOrdinalFromAttempts([failure])).toBe(1);
    expect(deriveTransportRetryOrdinalFromAttempts([failure, failure])).toBe(2);
  });

  it('exhausts after max transport retries', () => {
    const fourFailures = [failure, failure, failure, failure];
    expect(isTransportRetryExhausted(fourFailures)).toBe(true);
    expect(shouldScheduleTransportRetry(fourFailures)).toBe(false);
    expect(deriveTransportRetryOrdinalFromAttempts(fourFailures)).toBeNull();
  });

  it('does not schedule retry after success', () => {
    expect(shouldScheduleTransportRetry([failure, success])).toBe(false);
  });
});

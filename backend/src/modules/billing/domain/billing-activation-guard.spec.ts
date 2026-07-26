import { SubscriptionStatus } from './billing-domain.types';
import {
  assertActivationTransitionAllowed,
  assertNotAlreadyActive,
  BillingActivationGuardErrorCode,
  isStripeActivationConfirmed,
} from './billing-activation-guard';

describe('billing-activation-guard domain', () => {
  it('accepts confirmed Stripe activation statuses', () => {
    expect(isStripeActivationConfirmed('active')).toBe(true);
    expect(isStripeActivationConfirmed('trialing')).toBe(true);
    expect(isStripeActivationConfirmed('past_due')).toBe(true);
    expect(isStripeActivationConfirmed('canceled')).toBe(false);
    expect(isStripeActivationConfirmed(null)).toBe(false);
  });

  it('rejects duplicate activation when already ACTIVE', () => {
    expect(() => assertNotAlreadyActive(SubscriptionStatus.ACTIVE)).toThrow(
      BillingActivationGuardErrorCode.ALREADY_ACTIVE,
    );
  });

  it('allows activation transitions from draft, trial, paused', () => {
    expect(() => assertActivationTransitionAllowed(SubscriptionStatus.DRAFT)).not.toThrow();
    expect(() => assertActivationTransitionAllowed(SubscriptionStatus.TRIALING)).not.toThrow();
    expect(() => assertActivationTransitionAllowed(SubscriptionStatus.PAUSED)).not.toThrow();
  });

  it('rejects activation from cancelled', () => {
    expect(() => assertActivationTransitionAllowed(SubscriptionStatus.CANCELLED)).toThrow(
      BillingActivationGuardErrorCode.INVALID_TRANSITION,
    );
  });
});

import { BillingStatus, BillingSubscriptionItemStatus } from '@prisma/client';
import { SubscriptionStatus } from './billing-domain.types';
import {
  assertTransitionAllowed,
  isAllowedTransition,
  resolveSubscriptionDomainStatus,
  SubscriptionLifecycleTransitionError,
} from './subscription-lifecycle';

describe('subscription-lifecycle domain', () => {
  const draftContext = {
    status: BillingStatus.TRIALING,
    cancelAtPeriodEnd: false,
    trialStartAt: null,
    startedAt: null,
    endedAt: null,
    baseItemStatus: BillingSubscriptionItemStatus.DRAFT,
  };

  it('resolves draft state from subscription and base item', () => {
    expect(resolveSubscriptionDomainStatus(draftContext)).toBe(SubscriptionStatus.DRAFT);
  });

  it('allows required transitions', () => {
    expect(isAllowedTransition(SubscriptionStatus.DRAFT, SubscriptionStatus.TRIALING)).toBe(true);
    expect(isAllowedTransition(SubscriptionStatus.DRAFT, SubscriptionStatus.ACTIVE)).toBe(true);
    expect(isAllowedTransition(SubscriptionStatus.TRIALING, SubscriptionStatus.ACTIVE)).toBe(true);
    expect(isAllowedTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE)).toBe(true);
    expect(isAllowedTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED)).toBe(true);
    expect(isAllowedTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCEL_SCHEDULED)).toBe(
      true,
    );
    expect(isAllowedTransition(SubscriptionStatus.CANCEL_SCHEDULED, SubscriptionStatus.ACTIVE)).toBe(
      true,
    );
    expect(isAllowedTransition(SubscriptionStatus.CANCEL_SCHEDULED, SubscriptionStatus.CANCELLED)).toBe(
      true,
    );
    expect(isAllowedTransition(SubscriptionStatus.PAUSED, SubscriptionStatus.ACTIVE)).toBe(true);
  });

  it('rejects forbidden transitions with domain error', () => {
    expect(() =>
      assertTransitionAllowed(SubscriptionStatus.DRAFT, SubscriptionStatus.PAUSED),
    ).toThrow(SubscriptionLifecycleTransitionError);
    expect(() =>
      assertTransitionAllowed(SubscriptionStatus.CANCELLED, SubscriptionStatus.ACTIVE),
    ).toThrow(SubscriptionLifecycleTransitionError);
    expect(isAllowedTransition(SubscriptionStatus.DRAFT, SubscriptionStatus.CANCELLED)).toBe(false);
  });

  it('allows immediate cancel only with explicit permission', () => {
    expect(
      isAllowedTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED, {
        allowImmediateCancel: true,
      }),
    ).toBe(true);
    expect(isAllowedTransition(SubscriptionStatus.ACTIVE, SubscriptionStatus.CANCELLED)).toBe(
      false,
    );
  });
});

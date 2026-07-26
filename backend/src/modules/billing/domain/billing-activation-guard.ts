import { SubscriptionStatus } from './billing-domain.types';

export const BillingActivationGuardErrorCode = {
  ALREADY_ACTIVE: 'BILLING_ACTIVATION_ALREADY_ACTIVE',
  INVALID_TRANSITION: 'BILLING_ACTIVATION_INVALID_TRANSITION',
  STRIPE_NOT_CONFIGURED: 'BILLING_ACTIVATION_STRIPE_NOT_CONFIGURED',
  STRIPE_NOT_CONFIRMED: 'BILLING_ACTIVATION_STRIPE_NOT_CONFIRMED',
  STRIPE_SUBSCRIPTION_MISSING: 'BILLING_ACTIVATION_STRIPE_SUBSCRIPTION_MISSING',
  LEGACY_DIRECT_ACTIVATION_BLOCKED: 'BILLING_ACTIVATION_LEGACY_DIRECT_BLOCKED',
  CONCURRENT_ACTIVATION: 'BILLING_ACTIVATION_CONCURRENT',
} as const;

export type BillingActivationGuardErrorCode =
  (typeof BillingActivationGuardErrorCode)[keyof typeof BillingActivationGuardErrorCode];

/** Stripe subscription statuses that confirm a billable subscription exists. */
export const STRIPE_CONFIRMED_ACTIVATION_STATUSES = new Set([
  'active',
  'trialing',
  'past_due',
]);

export const ACTIVATION_SOURCE_TRANSITIONS: Readonly<
  Record<SubscriptionStatus, readonly SubscriptionStatus[]>
> = {
  [SubscriptionStatus.DRAFT]: [SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.TRIALING]: [SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.INCOMPLETE]: [SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.PAUSED]: [SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.PAST_DUE]: [SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.CANCEL_SCHEDULED]: [SubscriptionStatus.ACTIVE],
  [SubscriptionStatus.ACTIVE]: [],
  [SubscriptionStatus.CANCELLED]: [],
};

export function isStripeActivationConfirmed(stripeStatus: string | null | undefined): boolean {
  if (!stripeStatus) {
    return false;
  }
  return STRIPE_CONFIRMED_ACTIVATION_STATUSES.has(stripeStatus);
}

export function assertActivationTransitionAllowed(fromStatus: SubscriptionStatus): void {
  const allowed = ACTIVATION_SOURCE_TRANSITIONS[fromStatus] ?? [];
  if (!allowed.includes(SubscriptionStatus.ACTIVE)) {
    throw new Error(
      `${BillingActivationGuardErrorCode.INVALID_TRANSITION}:${fromStatus}->${SubscriptionStatus.ACTIVE}`,
    );
  }
}

export function assertNotAlreadyActive(domainStatus: SubscriptionStatus): void {
  if (domainStatus === SubscriptionStatus.ACTIVE) {
    throw new Error(BillingActivationGuardErrorCode.ALREADY_ACTIVE);
  }
}

export function buildActivationStripeSyncIdempotencyKey(
  subscriptionId: string,
  commandIdempotencyKey: string,
): string {
  return `billing-activation-stripe-sync:${subscriptionId}:${commandIdempotencyKey}`;
}

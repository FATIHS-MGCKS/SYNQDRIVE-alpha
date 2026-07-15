import { BillingStatus } from '@prisma/client';
import { SubscriptionStatus } from '../billing-domain.types';
import { mapExternalValue } from '../billing-domain.utils';

export type StripeBillingDisplayState =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'payment_failed'
  | 'canceled'
  | 'incomplete'
  | 'paused'
  | 'cancel_scheduled'
  | 'attention_required';

export interface MappedStripeSubscriptionStatus {
  domainStatus: SubscriptionStatus;
  /** Legacy Prisma `BillingStatus` — narrower than domain; see prisma-billing-status.mapper */
  billingStatus: BillingStatus;
  attentionRequired: boolean;
  displayState: StripeBillingDisplayState;
}

const STRIPE_TO_DOMAIN: Readonly<Record<string, SubscriptionStatus>> = {
  trialing: SubscriptionStatus.TRIALING,
  active: SubscriptionStatus.ACTIVE,
  past_due: SubscriptionStatus.PAST_DUE,
  unpaid: SubscriptionStatus.PAST_DUE,
  canceled: SubscriptionStatus.CANCELLED,
  incomplete: SubscriptionStatus.INCOMPLETE,
  incomplete_expired: SubscriptionStatus.CANCELLED,
  paused: SubscriptionStatus.PAUSED,
};

export function mapStripeSubscriptionToDomainStatus(
  stripeStatus: string | null | undefined,
  opts?: { cancelAtPeriodEnd?: boolean },
): SubscriptionStatus {
  const base = mapExternalValue({
    context: 'stripe.subscription.status',
    value: stripeStatus,
    map: STRIPE_TO_DOMAIN,
    fallback: SubscriptionStatus.INCOMPLETE,
  });
  if (
    base === SubscriptionStatus.ACTIVE &&
    opts?.cancelAtPeriodEnd === true
  ) {
    return SubscriptionStatus.CANCEL_SCHEDULED;
  }
  return base;
}

export function mapStripeSubscriptionStatus(
  stripeStatus: string | null | undefined,
  opts?: { cancelAtPeriodEnd?: boolean },
): MappedStripeSubscriptionStatus {
  const domainStatus = mapStripeSubscriptionToDomainStatus(stripeStatus, opts);
  const attentionRequired = isAttentionRequired(domainStatus, stripeStatus);
  const displayState = toDisplayState(domainStatus, stripeStatus);

  return {
    domainStatus,
    billingStatus: mapSubscriptionDomainToPrismaBillingStatus(domainStatus),
    attentionRequired,
    displayState,
  };
}

function isAttentionRequired(
  domainStatus: SubscriptionStatus,
  rawStripeStatus: string | null | undefined,
): boolean {
  if (
    domainStatus === SubscriptionStatus.PAST_DUE ||
    domainStatus === SubscriptionStatus.INCOMPLETE ||
    domainStatus === SubscriptionStatus.PAUSED
  ) {
    return true;
  }
  if (rawStripeStatus === 'incomplete_expired') {
    return true;
  }
  if (!rawStripeStatus || !STRIPE_TO_DOMAIN[rawStripeStatus]) {
    return true;
  }
  return false;
}

function toDisplayState(
  domainStatus: SubscriptionStatus,
  rawStripeStatus: string | null | undefined,
): StripeBillingDisplayState {
  switch (domainStatus) {
    case SubscriptionStatus.TRIALING:
      return 'trialing';
    case SubscriptionStatus.ACTIVE:
      return 'active';
    case SubscriptionStatus.PAST_DUE:
      return rawStripeStatus === 'unpaid' ? 'payment_failed' : 'past_due';
    case SubscriptionStatus.CANCELLED:
      return 'canceled';
    case SubscriptionStatus.INCOMPLETE:
      return 'incomplete';
    case SubscriptionStatus.PAUSED:
      return 'paused';
    case SubscriptionStatus.CANCEL_SCHEDULED:
      return 'cancel_scheduled';
    case SubscriptionStatus.DRAFT:
      return 'incomplete';
    default:
      return 'attention_required';
  }
}

/** Maps domain subscription status to legacy Prisma BillingStatus for persistence. */
export function mapSubscriptionDomainToPrismaBillingStatus(
  status: SubscriptionStatus,
): BillingStatus {
  switch (status) {
    case SubscriptionStatus.TRIALING:
    case SubscriptionStatus.DRAFT:
    case SubscriptionStatus.INCOMPLETE:
      return BillingStatus.TRIALING;
    case SubscriptionStatus.ACTIVE:
    case SubscriptionStatus.PAUSED:
    case SubscriptionStatus.CANCEL_SCHEDULED:
      return BillingStatus.ACTIVE;
    case SubscriptionStatus.PAST_DUE:
      return BillingStatus.PAST_DUE;
    case SubscriptionStatus.CANCELLED:
      return BillingStatus.CANCELLED;
    default:
      return BillingStatus.TRIALING;
  }
}

export function mapPrismaBillingStatusToDomain(
  status: BillingStatus,
  opts?: { cancelAtPeriodEnd?: boolean },
): SubscriptionStatus {
  if (opts?.cancelAtPeriodEnd && status === BillingStatus.ACTIVE) {
    return SubscriptionStatus.CANCEL_SCHEDULED;
  }
  switch (status) {
    case BillingStatus.ACTIVE:
      return SubscriptionStatus.ACTIVE;
    case BillingStatus.PAST_DUE:
      return SubscriptionStatus.PAST_DUE;
    case BillingStatus.CANCELLED:
      return SubscriptionStatus.CANCELLED;
    case BillingStatus.TRIALING:
      return SubscriptionStatus.TRIALING;
    default:
      return SubscriptionStatus.INCOMPLETE;
  }
}

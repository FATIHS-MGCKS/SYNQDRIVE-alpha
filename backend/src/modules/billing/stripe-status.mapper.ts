import { BillingStatus } from '@prisma/client';

export type StripeBillingDisplayState =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'payment_failed'
  | 'canceled'
  | 'incomplete'
  | 'attention_required';

export interface MappedStripeSubscriptionStatus {
  billingStatus: BillingStatus;
  attentionRequired: boolean;
  displayState: StripeBillingDisplayState;
}

export function mapStripeSubscriptionStatus(
  stripeStatus: string | null | undefined,
): MappedStripeSubscriptionStatus {
  switch (stripeStatus) {
    case 'trialing':
      return {
        billingStatus: BillingStatus.TRIALING,
        attentionRequired: false,
        displayState: 'trialing',
      };
    case 'active':
      return {
        billingStatus: BillingStatus.ACTIVE,
        attentionRequired: false,
        displayState: 'active',
      };
    case 'past_due':
      return {
        billingStatus: BillingStatus.PAST_DUE,
        attentionRequired: true,
        displayState: 'past_due',
      };
    case 'unpaid':
      return {
        billingStatus: BillingStatus.PAST_DUE,
        attentionRequired: true,
        displayState: 'payment_failed',
      };
    case 'canceled':
      return {
        billingStatus: BillingStatus.CANCELLED,
        attentionRequired: false,
        displayState: 'canceled',
      };
    case 'incomplete':
      return {
        billingStatus: BillingStatus.TRIALING,
        attentionRequired: true,
        displayState: 'incomplete',
      };
    case 'incomplete_expired':
      return {
        billingStatus: BillingStatus.CANCELLED,
        attentionRequired: true,
        displayState: 'incomplete',
      };
    case 'paused':
      return {
        billingStatus: BillingStatus.ACTIVE,
        attentionRequired: true,
        displayState: 'attention_required',
      };
    default:
      return {
        billingStatus: BillingStatus.ACTIVE,
        attentionRequired: true,
        displayState: 'attention_required',
      };
  }
}

export function mapStripeInvoiceStatus(
  stripeStatus: string | null | undefined,
): 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'UNCOLLECTIBLE' {
  switch (stripeStatus) {
    case 'draft':
      return 'DRAFT';
    case 'open':
      return 'OPEN';
    case 'paid':
      return 'PAID';
    case 'void':
      return 'VOID';
    case 'uncollectible':
      return 'UNCOLLECTIBLE';
    default:
      return 'DRAFT';
  }
}

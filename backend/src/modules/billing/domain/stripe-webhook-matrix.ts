/**
 * Stripe SaaS billing webhook event matrix (Prompt 24).
 */

export const StripeWebhookErrorCode = {
  NOT_CONFIGURED: 'STRIPE_WEBHOOK_NOT_CONFIGURED',
  INVALID_SIGNATURE: 'STRIPE_WEBHOOK_INVALID_SIGNATURE',
  MISSING_SIGNATURE: 'STRIPE_WEBHOOK_MISSING_SIGNATURE',
  UNRESOLVED_ORGANIZATION: 'STRIPE_WEBHOOK_UNRESOLVED_ORGANIZATION',
  UNSUPPORTED_EVENT: 'STRIPE_WEBHOOK_UNSUPPORTED_EVENT',
} as const;

export type StripeWebhookErrorCode =
  (typeof StripeWebhookErrorCode)[keyof typeof StripeWebhookErrorCode];

export const STRIPE_BILLING_WEBHOOK_EVENT_TYPES = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.created',
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.voided',
  'invoice.marked_uncollectible',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'setup_intent.succeeded',
  'setup_intent.setup_failed',
  'payment_method.attached',
  'payment_method.detached',
  'payment_method.updated',
  'payment_method.automatically_updated',
  'charge.refunded',
  'credit_note.created',
  'charge.dispute.created',
  'charge.dispute.closed',
  'customer.updated',
] as const;

export type StripeBillingWebhookEventType =
  (typeof STRIPE_BILLING_WEBHOOK_EVENT_TYPES)[number];

export const STRIPE_WEBHOOK_EVENTS_REQUIRING_ORGANIZATION = new Set<string>([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'customer.subscription.trial_will_end',
  'invoice.created',
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.voided',
  'invoice.marked_uncollectible',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'setup_intent.succeeded',
  'setup_intent.setup_failed',
  'payment_method.attached',
  'payment_method.detached',
  'payment_method.updated',
  'payment_method.automatically_updated',
  'charge.refunded',
  'credit_note.created',
  'charge.dispute.created',
  'charge.dispute.closed',
  'customer.updated',
]);

export type StripeWebhookDispatchOutcome =
  | 'processed'
  | 'ignored'
  | 'unresolved_mapping';

export interface StripeWebhookDispatchResult {
  outcome: StripeWebhookDispatchOutcome;
  organizationId: string | null;
  message?: string;
}

export function isSupportedStripeBillingWebhookEvent(
  eventType: string,
): eventType is StripeBillingWebhookEventType {
  return (STRIPE_BILLING_WEBHOOK_EVENT_TYPES as readonly string[]).includes(eventType);
}

export function requiresOrganizationMapping(eventType: string): boolean {
  return STRIPE_WEBHOOK_EVENTS_REQUIRING_ORGANIZATION.has(eventType);
}

export function shouldApplyOutOfOrderUpdate(input: {
  incomingEventCreatedAt: number | null | undefined;
  lastAppliedEventCreatedAt: number | null | undefined;
}): boolean {
  if (!input.incomingEventCreatedAt) {
    return true;
  }
  if (!input.lastAppliedEventCreatedAt) {
    return true;
  }
  return input.incomingEventCreatedAt >= input.lastAppliedEventCreatedAt;
}

export function mapStripeDisputeStatus(
  stripeStatus: string | null | undefined,
): 'WARNING_NEEDS_RESPONSE' | 'UNDER_REVIEW' | 'WON' | 'LOST' | 'CHARGE_REFUNDED' {
  switch ((stripeStatus ?? '').toLowerCase()) {
    case 'warning_needs_response':
      return 'WARNING_NEEDS_RESPONSE';
    case 'under_review':
    case 'needs_response':
      return 'UNDER_REVIEW';
    case 'won':
      return 'WON';
    case 'lost':
      return 'LOST';
    case 'charge_refunded':
      return 'CHARGE_REFUNDED';
    default:
      return 'UNDER_REVIEW';
  }
}

export function isDisputeClosedStatus(
  status: ReturnType<typeof mapStripeDisputeStatus>,
): boolean {
  return status === 'WON' || status === 'LOST' || status === 'CHARGE_REFUNDED';
}

import {
  isSupportedStripeBillingWebhookEvent,
  mapStripeDisputeStatus,
  requiresOrganizationMapping,
  shouldApplyOutOfOrderUpdate,
} from './stripe-webhook-matrix';

describe('stripe-webhook-matrix domain', () => {
  it('includes all prompt 24 minimum event types', () => {
    const required = [
      'customer.subscription.created',
      'customer.subscription.updated',
      'customer.subscription.deleted',
      'invoice.created',
      'invoice.finalized',
      'invoice.paid',
      'invoice.payment_failed',
      'invoice.voided',
      'invoice.marked_uncollectible',
      'payment_intent.succeeded',
      'payment_intent.payment_failed',
      'setup_intent.succeeded',
      'payment_method.attached',
      'payment_method.detached',
      'charge.refunded',
      'credit_note.created',
      'charge.dispute.created',
      'charge.dispute.closed',
    ];

    for (const eventType of required) {
      expect(isSupportedStripeBillingWebhookEvent(eventType)).toBe(true);
    }
  });

  it('marks subscription and invoice events as requiring organization mapping', () => {
    expect(requiresOrganizationMapping('invoice.paid')).toBe(true);
    expect(requiresOrganizationMapping('customer.subscription.updated')).toBe(true);
  });

  it('allows newer webhook events to override older ones', () => {
    expect(
      shouldApplyOutOfOrderUpdate({
        incomingEventCreatedAt: 200,
        lastAppliedEventCreatedAt: 100,
      }),
    ).toBe(true);
    expect(
      shouldApplyOutOfOrderUpdate({
        incomingEventCreatedAt: 100,
        lastAppliedEventCreatedAt: 200,
      }),
    ).toBe(false);
  });

  it('maps stripe dispute statuses to local enum values', () => {
    expect(mapStripeDisputeStatus('warning_needs_response')).toBe('WARNING_NEEDS_RESPONSE');
    expect(mapStripeDisputeStatus('won')).toBe('WON');
    expect(mapStripeDisputeStatus('charge_refunded')).toBe('CHARGE_REFUNDED');
  });
});

import type Stripe from 'stripe';
import {
  buildSafeConnectWebhookEventData,
  extractConnectedAccountId,
  isMvpConnectWebhookEventType,
} from './stripe-connect-webhook.util';

describe('stripe-connect-webhook.util', () => {
  it('recognizes MVP connect event types', () => {
    expect(isMvpConnectWebhookEventType('checkout.session.completed')).toBe(true);
    expect(isMvpConnectWebhookEventType('customer.created')).toBe(false);
  });

  it('extracts connected account from event.account', () => {
    const event = {
      account: 'acct_connected',
      data: { object: { id: 'cs_1' } },
    } as Stripe.Event;
    expect(extractConnectedAccountId(event)).toBe('acct_connected');
  });

  it('builds safe event data without customer email', () => {
    const event = {
      id: 'evt_1',
      type: 'checkout.session.completed',
      livemode: false,
      account: 'acct_1',
      data: {
        object: {
          id: 'cs_1',
          object: 'checkout.session',
          customer_email: 'secret@example.com',
          amount_total: 59_500,
          currency: 'eur',
          metadata: {
            organizationId: 'org-1',
            bookingId: 'booking-1',
            customer_email: 'should-not-appear',
          },
        },
      },
    } as unknown as Stripe.Event;

    const safe = buildSafeConnectWebhookEventData(event) as Record<string, unknown>;
    expect(safe.objectId).toBe('cs_1');
    expect(safe.amount_total).toBe(59_500);
    expect(JSON.stringify(safe)).not.toContain('secret@example.com');
    expect((safe.metadata as Record<string, string>).organizationId).toBe('org-1');
  });
});

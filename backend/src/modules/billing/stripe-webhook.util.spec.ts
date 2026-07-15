import Stripe from 'stripe';
import {
  buildSafeStripeWebhookPayload,
  extractStripeObjectId,
  isBillingWebhookMatrixEvent,
} from './stripe-webhook.util';

describe('stripe-webhook.util', () => {
  it('extracts stripe object id from event payload', () => {
    const event = {
      id: 'evt_1',
      type: 'invoice.paid',
      created: 1,
      livemode: false,
      data: { object: { id: 'in_1', object: 'invoice' } },
    } as Stripe.Event;

    expect(extractStripeObjectId(event)).toBe('in_1');
  });

  it('builds safe payload without card or bank details', () => {
    const event = {
      id: 'evt_2',
      type: 'payment_method.attached',
      created: 1,
      livemode: false,
      data: {
        object: {
          id: 'pm_1',
          object: 'payment_method',
          customer: 'cus_1',
          card: { number: '4242424242424242', last4: '4242' },
          metadata: { organizationId: 'org-1' },
        },
      },
    } as unknown as Stripe.Event;

    const safe = buildSafeStripeWebhookPayload(event, 'org-1');

    expect(safe.organizationId).toBe('org-1');
    expect(safe.customerId).toBe('cus_1');
    expect(safe).not.toHaveProperty('card');
    expect(JSON.stringify(safe)).not.toContain('4242424242424242');
  });

  it('recognizes billing webhook matrix events', () => {
    expect(isBillingWebhookMatrixEvent('invoice.paid')).toBe(true);
    expect(isBillingWebhookMatrixEvent('account.updated')).toBe(false);
  });
});

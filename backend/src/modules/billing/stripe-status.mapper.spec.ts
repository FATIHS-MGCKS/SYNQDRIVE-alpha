import { BillingStatus } from '@prisma/client';
import {
  mapStripeInvoiceStatus,
  mapStripeSubscriptionStatus,
} from './stripe-status.mapper';

describe('stripe-status.mapper', () => {
  it('maps active subscription', () => {
    expect(mapStripeSubscriptionStatus('active')).toEqual({
      billingStatus: BillingStatus.ACTIVE,
      attentionRequired: false,
      displayState: 'active',
    });
  });

  it('maps past_due with attention', () => {
    expect(mapStripeSubscriptionStatus('past_due').attentionRequired).toBe(true);
    expect(mapStripeSubscriptionStatus('past_due').displayState).toBe('past_due');
  });

  it('maps unpaid to payment_failed display', () => {
    expect(mapStripeSubscriptionStatus('unpaid').displayState).toBe('payment_failed');
  });

  it('maps invoice paid status', () => {
    expect(mapStripeInvoiceStatus('paid')).toBe('PAID');
  });
});

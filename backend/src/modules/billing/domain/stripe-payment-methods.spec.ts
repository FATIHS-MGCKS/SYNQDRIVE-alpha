import { BillingPaymentMethodStatus, BillingPaymentMethodType, BillingStripeMode } from '@prisma/client';
import {
  mapCardExpiryStatus,
  mapSepaMandateStatusToLocalStatus,
  resolveBillingPaymentState,
  toSafePaymentMethodView,
} from './stripe-payment-methods';

describe('stripe-payment-methods domain', () => {
  it('maps expired cards to EXPIRED status', () => {
    expect(mapCardExpiryStatus(1, 2020, new Date('2026-01-01T00:00:00.000Z'))).toBe(
      BillingPaymentMethodStatus.EXPIRED,
    );
  });

  it('maps sepa mandate statuses to local billing statuses', () => {
    expect(mapSepaMandateStatusToLocalStatus('active')).toBe(BillingPaymentMethodStatus.ACTIVE);
    expect(mapSepaMandateStatusToLocalStatus('pending')).toBe(
      BillingPaymentMethodStatus.REQUIRES_ACTION,
    );
    expect(mapSepaMandateStatusToLocalStatus('inactive')).toBe(BillingPaymentMethodStatus.FAILED);
  });

  it('exposes clear billing state when payment method is missing', () => {
    expect(resolveBillingPaymentState({ exists: false, status: null })).toBe('MISSING');
    expect(
      resolveBillingPaymentState({ exists: true, status: BillingPaymentMethodStatus.ACTIVE }),
    ).toBe('READY');
  });

  it('builds safe payment method views without sensitive fields', () => {
    const view = toSafePaymentMethodView({
      id: 'pm-1',
      type: BillingPaymentMethodType.SEPA_DEBIT,
      brand: null,
      last4: '3000',
      expMonth: null,
      expYear: null,
      country: 'DE',
      billingName: 'Acme GmbH',
      sepaMandateStatus: 'active',
      sepaBankCode: '37040044',
      isDefault: true,
      status: BillingPaymentMethodStatus.ACTIVE,
    });

    expect(view.last4).toBe('3000');
    expect(view.sepaBankCode).toBe('37040044');
    expect(view.billingState).toBe('READY');
    expect(view).not.toHaveProperty('iban');
  });
});

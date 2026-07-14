import { describe, expect, it } from 'vitest';
import {
  canCancelPaymentRequest,
  canCopyPaymentLink,
  canResendPaymentLink,
  paymentRequestStatusLabel,
  paymentRequestStatusTone,
  resolvePaymentSuccessScenario,
} from './booking-payment-status.utils';

describe('booking-payment-status.utils', () => {
  const t = (key: string) => key;

  it('labels key request statuses', () => {
    expect(paymentRequestStatusLabel('OPEN', t)).toBe('bookingPayment.status.open');
    expect(paymentRequestStatusLabel('LINK_SENT', t)).toBe('bookingPayment.status.linkSent');
    expect(paymentRequestStatusLabel('PAID', t)).toBe('bookingPayment.status.paid');
    expect(paymentRequestStatusLabel('DISPUTED', t)).toBe('bookingPayment.status.disputed');
  });

  it('maps status tones for accessibility', () => {
    expect(paymentRequestStatusTone('PAID')).toBe('positive');
    expect(paymentRequestStatusTone('FAILED')).toBe('negative');
    expect(paymentRequestStatusTone('LINK_SENT')).toBe('watch');
  });

  it('resolves full success scenario', () => {
    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: true,
        partialFailures: [],
        liveRequest: { status: 'LINK_SENT' } as never,
      }),
    ).toBe('full_success');
  });

  it('resolves email failed scenario', () => {
    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: true,
        partialFailures: [{ step: 'email' }],
      }),
    ).toBe('email_failed');
  });

  it('resolves request failed scenario', () => {
    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: false,
      }),
    ).toBe('request_failed');
  });

  it('permission-oriented action guards', () => {
    expect(canResendPaymentLink('LINK_SENT')).toBe(true);
    expect(canResendPaymentLink('PAID')).toBe(false);
    expect(canCancelPaymentRequest('OPEN')).toBe(true);
    expect(canCancelPaymentRequest('PAID')).toBe(false);
    expect(canCopyPaymentLink({ checkoutUrl: 'https://pay.test', status: 'LINK_SENT' })).toBe(true);
    expect(canCopyPaymentLink({ checkoutUrl: null, status: 'LINK_SENT' })).toBe(false);
  });
});

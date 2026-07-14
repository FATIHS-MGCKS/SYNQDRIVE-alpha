import { describe, expect, it } from 'vitest';
import type { BookingPaymentRequestDto } from '../../../lib/api';
import {
  canCancelPaymentRequest,
  canCopyPaymentLink,
  canResendPaymentLink,
  formatPaymentTimestamp,
  paymentRequestStatusLabel,
  paymentRequestStatusTone,
  resolvePaymentSuccessMessageKey,
  resolvePaymentSuccessScenario,
} from './booking-payment-status.utils';

const baseLiveRequest: BookingPaymentRequestDto = {
  id: 'req-1',
  status: 'LINK_SENT',
  purpose: 'BOOKING',
  amountCents: 10000,
  paidAmountCents: 0,
  openAmountCents: 10000,
  refundedAmountCents: 0,
  currency: 'EUR',
  depositInfoCents: 50000,
  recipientEmail: 'guest@example.com',
  checkoutUrl: 'https://checkout.stripe.test/session',
  checkoutExpiresAt: '2026-07-15T12:00:00.000Z',
  sendEmailOnLink: true,
  sendAttemptCount: 1,
  lastSentAt: '2026-07-14T10:00:00.000Z',
  lastEmailErrorMessage: null,
  paidAt: null,
  failedAt: null,
  cancelledAt: null,
  stripeCheckoutSessionId: 'cs_test',
  stripePaymentIntentId: null,
};

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
    expect(paymentRequestStatusTone('EXPIRED')).toBe('negative');
  });

  it('formats payment timestamps only after successful parsing', () => {
    expect(formatPaymentTimestamp('2026-07-14T10:00:00.000Z', 'de')).toContain('2026');
    expect(formatPaymentTimestamp(null, 'de')).toBeNull();
    expect(formatPaymentTimestamp('not-a-date', 'en')).toBeNull();
  });

  it('resolves full success when checkout and email are confirmed', () => {
    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: true,
        checkoutCreated: true,
        emailQueued: true,
        partialFailures: [],
        liveRequest: baseLiveRequest,
      }),
    ).toBe('full_success');
  });

  it('resolves checkout_ready when link exists but email is not confirmed', () => {
    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: true,
        checkoutCreated: true,
        partialFailures: [],
        liveRequest: {
          ...baseLiveRequest,
          lastSentAt: null,
          status: 'CHECKOUT_READY',
        },
      }),
    ).toBe('checkout_ready');
  });

  it('resolves email failed scenario', () => {
    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: true,
        checkoutCreated: true,
        partialFailures: [{ step: 'email' }],
      }),
    ).toBe('email_failed');

    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: true,
        checkoutCreated: true,
        liveRequest: {
          ...baseLiveRequest,
          lastSentAt: null,
          lastEmailErrorMessage: 'SMTP timeout',
          status: 'CHECKOUT_READY',
        },
      }),
    ).toBe('email_failed');
  });

  it('resolves request failed when only booking succeeded', () => {
    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: false,
        checkoutCreated: false,
      }),
    ).toBe('request_failed');
  });

  it('resolves non payment link and paid or expired live states', () => {
    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'pay_on_pickup',
        paymentRequestCreated: true,
      }),
    ).toBe('non_payment_link');

    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: true,
        checkoutCreated: true,
        liveRequest: { ...baseLiveRequest, status: 'PAID' },
      }),
    ).toBe('paid');

    expect(
      resolvePaymentSuccessScenario({
        paymentIntent: 'payment_link',
        paymentRequestCreated: true,
        checkoutCreated: true,
        liveRequest: { ...baseLiveRequest, status: 'EXPIRED' },
      }),
    ).toBe('expired');
  });

  it('maps scenario keys for i18n without hardcoded UI text', () => {
    expect(resolvePaymentSuccessMessageKey('full_success')).toBe('bookingPayment.success.full');
    expect(resolvePaymentSuccessMessageKey('checkout_ready')).toBe('bookingPayment.success.checkoutReady');
    expect(resolvePaymentSuccessMessageKey('email_failed')).toBe('bookingPayment.success.emailFailed');
    expect(resolvePaymentSuccessMessageKey('paid')).toBe('bookingPayment.success.paid');
    expect(resolvePaymentSuccessMessageKey('expired')).toBe('bookingPayment.success.expired');
  });

  it('permission-oriented action guards', () => {
    expect(canResendPaymentLink('LINK_SENT')).toBe(true);
    expect(canResendPaymentLink('PAID')).toBe(false);
    expect(canResendPaymentLink('EXPIRED')).toBe(true);
    expect(canCancelPaymentRequest('OPEN')).toBe(true);
    expect(canCancelPaymentRequest('PAID')).toBe(false);
    expect(canCopyPaymentLink({ checkoutUrl: 'https://pay.test', status: 'LINK_SENT' })).toBe(true);
    expect(canCopyPaymentLink({ checkoutUrl: null, status: 'LINK_SENT' })).toBe(false);
    expect(canCopyPaymentLink({ checkoutUrl: 'https://pay.test', status: 'PAID' })).toBe(false);
    expect(canCopyPaymentLink({ checkoutUrl: 'https://pay.test', status: 'EXPIRED' })).toBe(true);
  });
});

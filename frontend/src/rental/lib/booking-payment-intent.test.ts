import { describe, expect, it } from 'vitest';
import {
  BOOKING_CHECKOUT_PAYMENT_INTENTS,
  fromPrismaBookingPaymentIntent,
  isSupportedCheckoutPaymentIntent,
  normalizeBookingPaymentIntent,
  toPrismaBookingPaymentIntent,
} from './booking-payment-intent';
import { paymentIntentLabelOrUnknown } from './booking-payment-intent.labels';
import type { TranslationKey } from '../i18n/translations/en';

const EN: Partial<Record<TranslationKey, string>> = {
  'booking.paymentIntent.paymentLink': 'Payment link by email',
  'booking.paymentIntent.payOnPickup': 'Pay on pickup',
  'booking.paymentIntent.cash': 'Cash payment',
  'booking.paymentIntent.invoice': 'Invoice / bank transfer',
  'booking.paymentIntent.unknown': 'Not specified',
};

const DE: Partial<Record<TranslationKey, string>> = {
  'booking.paymentIntent.paymentLink': 'Zahlungslink per E-Mail',
  'booking.paymentIntent.payOnPickup': 'Vor Ort bezahlen',
  'booking.paymentIntent.cash': 'Barzahlung',
  'booking.paymentIntent.invoice': 'Rechnung / Überweisung',
  'booking.paymentIntent.unknown': 'Nicht angegeben',
};

function tFactory(dict: Partial<Record<TranslationKey, string>>) {
  return (key: TranslationKey) => dict[key] ?? key;
}

describe('booking-payment-intent', () => {
  it('exposes exactly four checkout intents', () => {
    expect(BOOKING_CHECKOUT_PAYMENT_INTENTS).toEqual([
      'payment_link',
      'pay_on_pickup',
      'cash',
      'invoice',
    ]);
  });

  it('normalizes prisma and legacy values', () => {
    expect(normalizeBookingPaymentIntent('PAYMENT_LINK')).toBe('payment_link');
    expect(normalizeBookingPaymentIntent('TERMINAL')).toBe('pay_on_pickup');
    expect(normalizeBookingPaymentIntent('online')).toBe('payment_link');
    expect(normalizeBookingPaymentIntent('Kreditkarte')).toBeNull();
  });

  it('round-trips wire ↔ prisma for supported intents', () => {
    for (const intent of BOOKING_CHECKOUT_PAYMENT_INTENTS) {
      expect(fromPrismaBookingPaymentIntent(toPrismaBookingPaymentIntent(intent))).toBe(intent);
    }
    expect(fromPrismaBookingPaymentIntent('TERMINAL')).toBe('pay_on_pickup');
  });

  it('rejects unsupported checkout values', () => {
    expect(isSupportedCheckoutPaymentIntent('terminal')).toBe(false);
    expect(isSupportedCheckoutPaymentIntent('TERMINAL')).toBe(false);
    expect(isSupportedCheckoutPaymentIntent('online')).toBe(false);
  });
});

describe('booking-payment-intent.labels', () => {
  it('renders DE and EN labels from stable enum values', () => {
    const tEn = tFactory(EN);
    const tDe = tFactory(DE);
    expect(paymentIntentLabelOrUnknown('payment_link', tEn)).toBe('Payment link by email');
    expect(paymentIntentLabelOrUnknown('payment_link', tDe)).toBe('Zahlungslink per E-Mail');
    expect(paymentIntentLabelOrUnknown('invoice', tDe)).toBe('Rechnung / Überweisung');
    expect(paymentIntentLabelOrUnknown(null, tEn)).toBe('Not specified');
  });
});

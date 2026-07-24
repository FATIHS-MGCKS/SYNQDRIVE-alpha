import type { TranslationKey } from '../i18n/translations/en';
import type { BookingPaymentIntent } from './booking-payment-intent';

/** Stable i18n keys for payment intent labels — separate from wire enum values. */
export const BOOKING_PAYMENT_INTENT_LABEL_KEYS: Record<BookingPaymentIntent, TranslationKey> = {
  payment_link: 'booking.paymentIntent.paymentLink',
  pay_on_pickup: 'booking.paymentIntent.payOnPickup',
  cash: 'booking.paymentIntent.cash',
  invoice: 'booking.paymentIntent.invoice',
};

export function paymentIntentLabel(
  intent: BookingPaymentIntent,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  return t(BOOKING_PAYMENT_INTENT_LABEL_KEYS[intent]);
}

export function paymentIntentLabelOrUnknown(
  intent: BookingPaymentIntent | null | undefined,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  if (!intent) return t('booking.paymentIntent.unknown');
  return paymentIntentLabel(intent, t);
}

/** @deprecated use paymentIntentLabel — kept for wizard notes builder call sites */
export function paymentIntentNotesLabel(
  intent: BookingPaymentIntent,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  return paymentIntentLabel(intent, t);
}

import type { TranslationKey } from '../../i18n/translations/en';
import type { BookingPaymentIntent } from './types';

export function paymentIntentLabel(
  intent: BookingPaymentIntent,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string {
  const keyMap: Record<BookingPaymentIntent, TranslationKey> = {
    payment_link: 'newBooking.paymentIntent.paymentLink',
    pay_on_pickup: 'newBooking.paymentIntent.payOnPickup',
    cash: 'newBooking.paymentIntent.cash',
    invoice: 'newBooking.paymentIntent.invoice',
  };
  return t(keyMap[intent]);
}

export function paymentIntentNotesLabel(intent: BookingPaymentIntent): string {
  const labels: Record<BookingPaymentIntent, string> = {
    payment_link: 'Zahlungslink',
    pay_on_pickup: 'Vor Ort bezahlen',
    cash: 'Barzahlung',
    invoice: 'Rechnung',
  };
  return labels[intent];
}

export function formatCheckoutExpiryDays(seconds: number): number {
  return Math.max(1, Math.round(seconds / (24 * 60 * 60)));
}

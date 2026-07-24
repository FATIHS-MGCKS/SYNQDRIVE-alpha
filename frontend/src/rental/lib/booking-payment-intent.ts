/**
 * Canonical booking checkout payment intent taxonomy (wire format).
 * Mirrors backend `BOOKING_CHECKOUT_PAYMENT_INTENTS` / Prisma `BookingPaymentIntent`.
 *
 * UI labels live in i18n — use `paymentIntentLabel()` from `booking-payment-intent.labels.ts`.
 */

export const BOOKING_CHECKOUT_PAYMENT_INTENTS = [
  'payment_link',
  'pay_on_pickup',
  'cash',
  'invoice',
] as const;

export type BookingPaymentIntent = (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

/** Prisma enum values (server persistence). */
export const BOOKING_PAYMENT_INTENT_PRISMA = [
  'PAYMENT_LINK',
  'PAY_ON_PICKUP',
  'CASH',
  'INVOICE',
  'TERMINAL',
] as const;

export type BookingPaymentIntentPrisma = (typeof BOOKING_PAYMENT_INTENT_PRISMA)[number];

const WIRE_TO_PRISMA: Record<BookingPaymentIntent, BookingPaymentIntentPrisma> = {
  payment_link: 'PAYMENT_LINK',
  pay_on_pickup: 'PAY_ON_PICKUP',
  cash: 'CASH',
  invoice: 'INVOICE',
};

const PRISMA_TO_WIRE: Record<BookingPaymentIntentPrisma, BookingPaymentIntent | null> = {
  PAYMENT_LINK: 'payment_link',
  PAY_ON_PICKUP: 'pay_on_pickup',
  CASH: 'cash',
  INVOICE: 'invoice',
  /** Legacy terminal intent — normalized to pay on pickup for UI/checkout. */
  TERMINAL: 'pay_on_pickup',
};

const LEGACY_ALIASES: Record<string, BookingPaymentIntent> = {
  payment_link: 'payment_link',
  pay_on_pickup: 'pay_on_pickup',
  cash: 'cash',
  invoice: 'invoice',
  terminal: 'pay_on_pickup',
  online: 'payment_link',
  paymentlink: 'payment_link',
  payonpickup: 'pay_on_pickup',
};

export function isBookingPaymentIntent(value: unknown): value is BookingPaymentIntent {
  return (
    typeof value === 'string' &&
    (BOOKING_CHECKOUT_PAYMENT_INTENTS as readonly string[]).includes(value)
  );
}

export function isSupportedCheckoutPaymentIntent(value: unknown): value is BookingPaymentIntent {
  return isBookingPaymentIntent(value);
}

/** Normalize API/Prisma/legacy strings to checkout wire intent or null. */
export function normalizeBookingPaymentIntent(value: unknown): BookingPaymentIntent | null {
  if (value == null || value === '') return null;

  if (isBookingPaymentIntent(value)) return value;

  const raw = String(value).trim();
  const upper = raw.toUpperCase() as BookingPaymentIntentPrisma;
  if (upper in PRISMA_TO_WIRE) {
    return PRISMA_TO_WIRE[upper];
  }

  const alias = LEGACY_ALIASES[raw.toLowerCase().replace(/[\s-]+/g, '_')];
  if (alias) return alias;

  return null;
}

export function toPrismaBookingPaymentIntent(
  intent: BookingPaymentIntent,
): BookingPaymentIntentPrisma {
  return WIRE_TO_PRISMA[intent];
}

export function fromPrismaBookingPaymentIntent(
  intent: BookingPaymentIntentPrisma | string | null | undefined,
): BookingPaymentIntent | null {
  if (!intent) return null;
  const upper = String(intent).toUpperCase() as BookingPaymentIntentPrisma;
  return PRISMA_TO_WIRE[upper] ?? null;
}

export const BOOKING_CHECKOUT_PAYMENT_INTENTS = [
  'payment_link',
  'pay_on_pickup',
  'cash',
  'invoice',
] as const;

export type BookingCheckoutPaymentIntent = (typeof BOOKING_CHECKOUT_PAYMENT_INTENTS)[number];

export function toPrismaBookingPaymentIntent(
  intent: BookingCheckoutPaymentIntent,
): import('@prisma/client').BookingPaymentIntent {
  const map: Record<BookingCheckoutPaymentIntent, import('@prisma/client').BookingPaymentIntent> = {
    payment_link: 'PAYMENT_LINK',
    pay_on_pickup: 'PAY_ON_PICKUP',
    cash: 'CASH',
    invoice: 'INVOICE',
  };
  return map[intent];
}

export function fromPrismaBookingPaymentIntent(
  intent: import('@prisma/client').BookingPaymentIntent | null | undefined,
): BookingCheckoutPaymentIntent | null {
  if (!intent) return null;
  const map: Record<import('@prisma/client').BookingPaymentIntent, BookingCheckoutPaymentIntent> = {
    PAYMENT_LINK: 'payment_link',
    PAY_ON_PICKUP: 'pay_on_pickup',
    CASH: 'cash',
    INVOICE: 'invoice',
    TERMINAL: 'pay_on_pickup',
  };
  return map[intent] ?? null;
}

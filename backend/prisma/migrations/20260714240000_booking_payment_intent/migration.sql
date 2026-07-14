-- Booking payment intent (wizard checkout selection)

CREATE TYPE "BookingPaymentIntent" AS ENUM (
  'PAYMENT_LINK',
  'PAY_ON_PICKUP',
  'CASH',
  'INVOICE',
  'TERMINAL'
);

ALTER TABLE "bookings"
  ADD COLUMN IF NOT EXISTS "payment_intent" "BookingPaymentIntent";

CREATE INDEX IF NOT EXISTS "bookings_payment_intent_idx" ON "bookings"("payment_intent");

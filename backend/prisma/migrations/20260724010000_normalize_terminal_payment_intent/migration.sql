-- Normalize legacy TERMINAL payment intent to PAY_ON_PICKUP (same checkout semantics).

UPDATE "bookings"
SET "payment_intent" = 'PAY_ON_PICKUP'
WHERE "payment_intent" = 'TERMINAL';

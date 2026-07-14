-- Align BookingPaymentRequestStatus with domain lifecycle (OPEN → LINK_* → PROCESSING → PAID).
-- CHECKOUT_PENDING is replaced by OPEN (no production rows expected; safe default mapping).

ALTER TYPE "BookingPaymentRequestStatus" ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "BookingPaymentRequestStatus" ADD VALUE IF NOT EXISTS 'LINK_PENDING';
ALTER TYPE "BookingPaymentRequestStatus" ADD VALUE IF NOT EXISTS 'LINK_SENT';
ALTER TYPE "BookingPaymentRequestStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';

UPDATE "booking_payment_requests"
SET "status" = 'OPEN'
WHERE "status"::text = 'CHECKOUT_PENDING';

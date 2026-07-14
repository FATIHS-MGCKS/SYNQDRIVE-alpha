-- Align BookingPaymentRequestStatus with domain lifecycle (OPEN → LINK_* → PROCESSING → PAID).
-- CHECKOUT_PENDING retained for backward compatibility; new values added for domain machine.
-- No data backfill: booking_payment_requests is empty on first deploy.

ALTER TYPE "BookingPaymentRequestStatus" ADD VALUE IF NOT EXISTS 'OPEN';
ALTER TYPE "BookingPaymentRequestStatus" ADD VALUE IF NOT EXISTS 'LINK_PENDING';
ALTER TYPE "BookingPaymentRequestStatus" ADD VALUE IF NOT EXISTS 'LINK_SENT';
ALTER TYPE "BookingPaymentRequestStatus" ADD VALUE IF NOT EXISTS 'DISPUTED';

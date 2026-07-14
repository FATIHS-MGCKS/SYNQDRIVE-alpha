-- Booking payment request: RENTAL_PAYMENT purpose + recipient metadata for link/email flow

ALTER TYPE "BookingPaymentPurpose" ADD VALUE IF NOT EXISTS 'RENTAL_PAYMENT';

ALTER TABLE "booking_payment_requests"
  ADD COLUMN IF NOT EXISTS "recipient_email" TEXT,
  ADD COLUMN IF NOT EXISTS "send_email_on_link" BOOLEAN NOT NULL DEFAULT false;

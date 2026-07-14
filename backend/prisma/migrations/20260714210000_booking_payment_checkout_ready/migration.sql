-- Add CHECKOUT_READY status and checkout idempotency / livemode fields
ALTER TYPE "BookingPaymentRequestStatus" ADD VALUE 'CHECKOUT_READY' AFTER 'LINK_PENDING';

ALTER TABLE "booking_payment_requests"
  ADD COLUMN "checkout_idempotency_key" TEXT,
  ADD COLUMN "stripe_livemode" BOOLEAN;

CREATE UNIQUE INDEX "booking_payment_requests_org_checkout_idempotency_key"
  ON "booking_payment_requests" ("organization_id", "checkout_idempotency_key")
  WHERE "checkout_idempotency_key" IS NOT NULL;

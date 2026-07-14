-- Immutable fee policy snapshot fields on payment requests.
ALTER TABLE "booking_payment_requests" ADD COLUMN "fee_policy_version" TEXT;
ALTER TABLE "booking_payment_requests" ADD COLUMN "fee_basis" TEXT;

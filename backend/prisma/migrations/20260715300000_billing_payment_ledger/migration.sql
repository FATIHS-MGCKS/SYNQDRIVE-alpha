-- Prompt 26: payment ledger with attempts, refunds, credit notes and manual payments.

CREATE TYPE "BillingManualPaymentType" AS ENUM ('BANK_TRANSFER', 'CASH', 'CHECK', 'OTHER');

ALTER TABLE "billing_payments"
  ADD COLUMN "stripe_payment_method_id" TEXT,
  ADD COLUMN "refunded_amount_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "remaining_amount_cents" INTEGER,
  ADD COLUMN "succeeded_at" TIMESTAMP(3),
  ADD COLUMN "failed_at" TIMESTAMP(3),
  ADD COLUMN "cancelled_at" TIMESTAMP(3),
  ADD COLUMN "manual_payment_type" "BillingManualPaymentType",
  ADD COLUMN "manual_reference" TEXT,
  ADD COLUMN "manual_receipt_note" TEXT,
  ADD COLUMN "recorded_by_user_id" TEXT,
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "billing_payments_idempotency_key_key"
  ON "billing_payments"("idempotency_key");

CREATE INDEX "billing_payments_provider_status_idx"
  ON "billing_payments"("provider", "status");

ALTER TABLE "billing_payments"
  ADD CONSTRAINT "billing_payments_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_payment_attempts"
  ADD COLUMN "decline_code" TEXT,
  ADD COLUMN "safe_error_message" TEXT,
  ADD COLUMN "next_retry_at" TIMESTAMP(3),
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "billing_payment_attempts_idempotency_key_key"
  ON "billing_payment_attempts"("idempotency_key");

ALTER TABLE "billing_refunds"
  ADD COLUMN "is_partial" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "refunded_at" TIMESTAMP(3),
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "billing_refunds_idempotency_key_key"
  ON "billing_refunds"("idempotency_key");

ALTER TABLE "billing_credit_notes"
  ADD COLUMN "hosted_url" TEXT,
  ADD COLUMN "pdf_url" TEXT,
  ADD COLUMN "issued_at" TIMESTAMP(3),
  ADD COLUMN "voided_at" TIMESTAMP(3),
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "billing_credit_notes_idempotency_key_key"
  ON "billing_credit_notes"("idempotency_key");

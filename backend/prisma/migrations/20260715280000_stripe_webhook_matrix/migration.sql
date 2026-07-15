-- Prompt 24: Stripe webhook matrix — durable events, disputes, unresolved mappings.

ALTER TYPE "StripeWebhookEventStatus" ADD VALUE IF NOT EXISTS 'UNRESOLVED_MAPPING';

CREATE TYPE "BillingDisputeStatus" AS ENUM (
  'WARNING_NEEDS_RESPONSE',
  'UNDER_REVIEW',
  'WON',
  'LOST',
  'CHARGE_REFUNDED'
);

ALTER TABLE "stripe_webhook_events"
  ADD COLUMN "organization_id" TEXT,
  ADD COLUMN "stripe_object_id" TEXT,
  ADD COLUMN "safe_payload" JSONB,
  ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "event_created_at" TIMESTAMP(3);

CREATE INDEX "stripe_webhook_events_organization_id_created_at_idx"
  ON "stripe_webhook_events"("organization_id", "created_at");

CREATE TABLE "billing_disputes" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "payment_id" TEXT,
  "invoice_id" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "currency" CHAR(3) NOT NULL DEFAULT 'EUR',
  "status" "BillingDisputeStatus" NOT NULL,
  "reason" TEXT,
  "stripe_dispute_id" TEXT,
  "stripe_charge_id" TEXT,
  "stripe_mode" "BillingStripeMode",
  "opened_at" TIMESTAMP(3),
  "closed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "billing_disputes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "billing_disputes_stripe_dispute_id_stripe_mode_key"
  ON "billing_disputes"("stripe_dispute_id", "stripe_mode");

CREATE INDEX "billing_disputes_organization_id_status_idx"
  ON "billing_disputes"("organization_id", "status");

CREATE INDEX "billing_disputes_stripe_charge_id_stripe_mode_idx"
  ON "billing_disputes"("stripe_charge_id", "stripe_mode");

ALTER TABLE "billing_disputes"
  ADD CONSTRAINT "billing_disputes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_disputes"
  ADD CONSTRAINT "billing_disputes_payment_id_fkey"
  FOREIGN KEY ("payment_id") REFERENCES "billing_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_disputes"
  ADD CONSTRAINT "billing_disputes_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "billing_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

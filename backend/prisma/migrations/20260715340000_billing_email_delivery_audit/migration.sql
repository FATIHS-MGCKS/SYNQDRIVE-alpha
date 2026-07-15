-- Prompt 30: Billing email delivery audit, linkage, suppressions, webhook event types

ALTER TYPE "OutboundEmailEventType" ADD VALUE IF NOT EXISTS 'ACCEPTED';
ALTER TYPE "OutboundEmailEventType" ADD VALUE IF NOT EXISTS 'DEFERRED';

CREATE TYPE "BillingEmailSuppressionReason" AS ENUM ('BOUNCED', 'COMPLAINED');

ALTER TABLE "outbound_emails"
  ADD COLUMN IF NOT EXISTS "billing_invoice_id" TEXT,
  ADD COLUMN IF NOT EXISTS "billing_subscription_id" TEXT,
  ADD COLUMN IF NOT EXISTS "billing_outbox_delivery_id" TEXT,
  ADD COLUMN IF NOT EXISTS "billing_outbox_event_id" TEXT,
  ADD COLUMN IF NOT EXISTS "billing_outbox_idempotency_key" TEXT;

ALTER TABLE "outbound_email_events"
  ADD COLUMN IF NOT EXISTS "webhook_idempotency_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "outbound_emails_billing_outbox_idempotency_key_key"
  ON "outbound_emails"("billing_outbox_idempotency_key");

CREATE UNIQUE INDEX IF NOT EXISTS "outbound_email_events_outbound_email_id_webhook_idempotency_key_key"
  ON "outbound_email_events"("outbound_email_id", "webhook_idempotency_key");

CREATE INDEX IF NOT EXISTS "outbound_emails_billing_invoice_id_idx"
  ON "outbound_emails"("billing_invoice_id");

CREATE INDEX IF NOT EXISTS "outbound_emails_billing_subscription_id_idx"
  ON "outbound_emails"("billing_subscription_id");

CREATE INDEX IF NOT EXISTS "outbound_emails_billing_outbox_delivery_id_idx"
  ON "outbound_emails"("billing_outbox_delivery_id");

CREATE TABLE IF NOT EXISTS "billing_email_suppressions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "reason" "BillingEmailSuppressionReason" NOT NULL,
  "outbound_email_id" TEXT,
  "suppressed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "billing_email_suppressions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "billing_email_suppressions_organization_id_email_key"
  ON "billing_email_suppressions"("organization_id", "email");

CREATE INDEX IF NOT EXISTS "billing_email_suppressions_organization_id_idx"
  ON "billing_email_suppressions"("organization_id");

ALTER TABLE "outbound_emails"
  ADD CONSTRAINT "outbound_emails_billing_invoice_id_fkey"
  FOREIGN KEY ("billing_invoice_id") REFERENCES "billing_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outbound_emails"
  ADD CONSTRAINT "outbound_emails_billing_subscription_id_fkey"
  FOREIGN KEY ("billing_subscription_id") REFERENCES "billing_subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outbound_emails"
  ADD CONSTRAINT "outbound_emails_billing_outbox_delivery_id_fkey"
  FOREIGN KEY ("billing_outbox_delivery_id") REFERENCES "billing_domain_event_outbox_deliveries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "billing_email_suppressions"
  ADD CONSTRAINT "billing_email_suppressions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "billing_email_suppressions"
  ADD CONSTRAINT "billing_email_suppressions_outbound_email_id_fkey"
  FOREIGN KEY ("outbound_email_id") REFERENCES "outbound_emails"("id") ON DELETE SET NULL ON UPDATE CASCADE;

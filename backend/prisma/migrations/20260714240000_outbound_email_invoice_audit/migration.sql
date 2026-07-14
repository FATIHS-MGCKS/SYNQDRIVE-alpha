-- Outbound email audit trail for invoice sends (V4.9.437)
CREATE TYPE "OutboundEmailDeliveryStatus" AS ENUM (
  'PENDING',
  'ACCEPTED',
  'DELIVERED',
  'BOUNCED',
  'COMPLAINED',
  'FAILED'
);

ALTER TABLE "outbound_emails"
  ADD COLUMN "generated_document_id" TEXT,
  ADD COLUMN "document_version_number" INTEGER,
  ADD COLUMN "delivery_status" "OutboundEmailDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "accepted_at" TIMESTAMP(3),
  ADD COLUMN "delivered_at" TIMESTAMP(3),
  ADD COLUMN "failed_at" TIMESTAMP(3),
  ADD COLUMN "correlation_id" TEXT;

UPDATE "outbound_emails"
SET "requested_at" = "created_at"
WHERE "requested_at" IS NULL;

CREATE INDEX "outbound_emails_organization_id_generated_document_id_idx"
  ON "outbound_emails"("organization_id", "generated_document_id");

CREATE INDEX "outbound_emails_delivery_status_idx"
  ON "outbound_emails"("delivery_status");

CREATE INDEX "outbound_emails_provider_message_id_idx"
  ON "outbound_emails"("provider_message_id");

CREATE INDEX "outbound_emails_requested_at_idx"
  ON "outbound_emails"("requested_at");

ALTER TABLE "outbound_emails"
  ADD CONSTRAINT "outbound_emails_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "outbound_emails"
  ADD CONSTRAINT "outbound_emails_generated_document_id_fkey"
  FOREIGN KEY ("generated_document_id") REFERENCES "generated_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

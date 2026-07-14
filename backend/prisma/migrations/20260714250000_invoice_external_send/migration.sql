-- Invoice external send records (V4.9.439)
CREATE TYPE "InvoiceExternalSendChannel" AS ENUM (
  'EXTERNAL_EMAIL',
  'POSTAL_MAIL',
  'IN_PERSON',
  'CUSTOMER_PORTAL',
  'OTHER'
);

CREATE TABLE "org_invoice_external_sends" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "channel" "InvoiceExternalSendChannel" NOT NULL,
  "sent_at" TIMESTAMP(3) NOT NULL,
  "recipient" TEXT,
  "note" TEXT,
  "external_reference" TEXT,
  "idempotency_key" TEXT,
  "duplicate_of_id" TEXT,
  "recorded_by_user_id" TEXT,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_invoice_external_sends_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_invoice_external_sends_organization_id_idempotency_key_key"
  ON "org_invoice_external_sends"("organization_id", "idempotency_key");

CREATE INDEX "org_invoice_external_sends_organization_id_idx"
  ON "org_invoice_external_sends"("organization_id");

CREATE INDEX "org_invoice_external_sends_invoice_id_idx"
  ON "org_invoice_external_sends"("invoice_id");

CREATE INDEX "org_invoice_external_sends_organization_id_invoice_id_idx"
  ON "org_invoice_external_sends"("organization_id", "invoice_id");

CREATE INDEX "org_invoice_external_sends_sent_at_idx"
  ON "org_invoice_external_sends"("sent_at");

ALTER TABLE "org_invoice_external_sends"
  ADD CONSTRAINT "org_invoice_external_sends_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_invoice_external_sends"
  ADD CONSTRAINT "org_invoice_external_sends_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_invoice_external_sends"
  ADD CONSTRAINT "org_invoice_external_sends_duplicate_of_id_fkey"
  FOREIGN KEY ("duplicate_of_id") REFERENCES "org_invoice_external_sends"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Invoice payment command metadata (V4.9.440)
CREATE TYPE "InvoicePaymentSource" AS ENUM ('MANUAL', 'PROVIDER');

ALTER TABLE "org_invoice_payments"
  ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'EUR',
  ADD COLUMN "source" "InvoicePaymentSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "provider_transaction_id" TEXT,
  ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "org_invoice_payments_organization_id_idempotency_key_key"
  ON "org_invoice_payments"("organization_id", "idempotency_key");

CREATE UNIQUE INDEX "org_invoice_payments_organization_id_provider_transaction_id_key"
  ON "org_invoice_payments"("organization_id", "provider_transaction_id");

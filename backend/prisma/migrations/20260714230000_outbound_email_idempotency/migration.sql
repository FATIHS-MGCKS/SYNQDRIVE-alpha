-- Outbound email client idempotency for invoice send (V4.9.436)
ALTER TABLE "outbound_emails" ADD COLUMN "idempotency_key" TEXT;

CREATE UNIQUE INDEX "outbound_emails_organization_id_idempotency_key_key"
  ON "outbound_emails"("organization_id", "idempotency_key");

CREATE INDEX "outbound_emails_organization_id_invoice_id_idx"
  ON "outbound_emails"("organization_id", "invoice_id");

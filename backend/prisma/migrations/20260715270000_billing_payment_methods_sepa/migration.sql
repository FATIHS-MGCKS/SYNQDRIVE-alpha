-- Prompt 23: production payment methods (card + SEPA) with safe metadata.

ALTER TABLE "billing_payment_methods"
  ADD COLUMN "stripe_mode" "BillingStripeMode",
  ADD COLUMN "country" CHAR(2),
  ADD COLUMN "billing_name" TEXT,
  ADD COLUMN "sepa_mandate_status" TEXT,
  ADD COLUMN "sepa_bank_code" TEXT;

CREATE INDEX "billing_payment_methods_organization_id_is_default_idx"
  ON "billing_payment_methods"("organization_id", "is_default");

CREATE INDEX "billing_payment_methods_organization_id_status_idx"
  ON "billing_payment_methods"("organization_id", "status");

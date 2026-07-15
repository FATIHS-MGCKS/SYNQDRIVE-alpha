-- Prompt 25: full Stripe invoice mirror with immutable snapshots.

ALTER TABLE "billing_invoices"
  ADD COLUMN "invoice_number" TEXT,
  ADD COLUMN "net_amount_cents" INTEGER,
  ADD COLUMN "discount_amount_cents" INTEGER DEFAULT 0,
  ADD COLUMN "tax_amount_cents" INTEGER,
  ADD COLUMN "amount_due_cents" INTEGER,
  ADD COLUMN "amount_paid_cents" INTEGER,
  ADD COLUMN "amount_remaining_cents" INTEGER,
  ADD COLUMN "period_start" TIMESTAMP(3),
  ADD COLUMN "period_end" TIMESTAMP(3),
  ADD COLUMN "stripe_created_at" TIMESTAMP(3),
  ADD COLUMN "finalized_at" TIMESTAMP(3),
  ADD COLUMN "voided_at" TIMESTAMP(3),
  ADD COLUMN "hosted_invoice_url" TEXT,
  ADD COLUMN "customer_snapshot_json" JSONB,
  ADD COLUMN "company_snapshot_json" JSONB,
  ADD COLUMN "billing_address_json" JSONB,
  ADD COLUMN "tax_id_snapshot" TEXT;

ALTER TABLE "billing_invoice_lines"
  ADD COLUMN "discount_details_json" JSONB,
  ADD COLUMN "tax_details_json" JSONB;

CREATE INDEX "billing_invoices_invoice_number_idx"
  ON "billing_invoices"("invoice_number");

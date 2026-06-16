-- Invoice finance workflow: per-org numbering, payments, extended statuses

-- Extend status enum (idempotent)
ALTER TYPE "OrgInvoiceStatus" ADD VALUE IF NOT EXISTS 'ISSUED';
ALTER TYPE "OrgInvoiceStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_PAID';
ALTER TYPE "OrgInvoiceStatus" ADD VALUE IF NOT EXISTS 'CREDITED';
ALTER TYPE "OrgInvoiceStatus" ADD VALUE IF NOT EXISTS 'VOID';
ALTER TYPE "OrgInvoiceStatus" ADD VALUE IF NOT EXISTS 'UPLOADED';
ALTER TYPE "OrgInvoiceStatus" ADD VALUE IF NOT EXISTS 'NEEDS_REVIEW';
ALTER TYPE "OrgInvoiceStatus" ADD VALUE IF NOT EXISTS 'APPROVED';
ALTER TYPE "OrgInvoiceStatus" ADD VALUE IF NOT EXISTS 'BOOKED';
ALTER TYPE "OrgInvoiceStatus" ADD VALUE IF NOT EXISTS 'REJECTED';

CREATE TYPE "InvoicePaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER', 'CARD', 'STRIPE', 'OTHER');

-- Legacy number preservation
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "legacy_invoice_number" INTEGER;
UPDATE "org_invoices" SET "legacy_invoice_number" = "invoice_number" WHERE "legacy_invoice_number" IS NULL AND "invoice_number" IS NOT NULL;

ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "invoice_number_display" TEXT;
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "sequence_year" INTEGER;
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "sequence_number" INTEGER;
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "paid_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "outstanding_cents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "document_extraction_id" TEXT;
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "generated_document_id" TEXT;
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "issued_at" TIMESTAMP(3);
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "sent_at" TIMESTAMP(3);
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "cancelled_at" TIMESTAMP(3);
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "voided_at" TIMESTAMP(3);
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "credited_at" TIMESTAMP(3);

-- Backfill outstanding from total - paid where sensible
UPDATE "org_invoices"
SET "outstanding_cents" = GREATEST(0, "total_cents" - COALESCE("paid_cents", 0))
WHERE "outstanding_cents" = 0 AND "total_cents" > 0;

UPDATE "org_invoices"
SET "paid_cents" = "total_cents", "outstanding_cents" = 0
WHERE "status" = 'PAID' AND "paid_cents" = 0;

-- Drop global autoincrement unique constraint if present
ALTER TABLE "org_invoices" ALTER COLUMN "invoice_number" DROP NOT NULL;
ALTER TABLE "org_invoices" ALTER COLUMN "invoice_number" DROP DEFAULT;
DROP INDEX IF EXISTS "org_invoices_invoice_number_key";

CREATE UNIQUE INDEX IF NOT EXISTS "org_invoices_organization_id_sequence_year_sequence_number_key"
  ON "org_invoices" ("organization_id", "sequence_year", "sequence_number")
  WHERE "sequence_year" IS NOT NULL AND "sequence_number" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "org_invoice_sequences" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "sequence_year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "org_invoice_sequences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_invoice_sequences_organization_id_sequence_year_key"
  ON "org_invoice_sequences" ("organization_id", "sequence_year");

ALTER TABLE "org_invoice_sequences"
  DROP CONSTRAINT IF EXISTS "org_invoice_sequences_organization_id_fkey";
ALTER TABLE "org_invoice_sequences"
  ADD CONSTRAINT "org_invoice_sequences_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "org_invoice_payments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "invoice_id" TEXT NOT NULL,
  "amount_cents" INTEGER NOT NULL,
  "method" "InvoicePaymentMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
  "paid_at" TIMESTAMP(3) NOT NULL,
  "reference" TEXT,
  "note" TEXT,
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "org_invoice_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "org_invoice_payments_organization_id_idx" ON "org_invoice_payments" ("organization_id");
CREATE INDEX IF NOT EXISTS "org_invoice_payments_invoice_id_idx" ON "org_invoice_payments" ("invoice_id");
CREATE INDEX IF NOT EXISTS "org_invoice_payments_paid_at_idx" ON "org_invoice_payments" ("paid_at");

ALTER TABLE "org_invoice_payments"
  DROP CONSTRAINT IF EXISTS "org_invoice_payments_invoice_id_fkey";
ALTER TABLE "org_invoice_payments"
  ADD CONSTRAINT "org_invoice_payments_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

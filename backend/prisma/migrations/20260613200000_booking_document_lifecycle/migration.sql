-- Booking Document Lifecycle — central document engine
--
-- Adds five compact tables (generated documents, uploaded legal versions, the
-- per-booking bundle, deposits, rental contracts) and one new invoice type
-- label. Idempotent (IF NOT EXISTS) and backward compatible: no existing table
-- is renamed/dropped and no column is removed. Cross-entity links are scalar id
-- columns + indexes (no FK to Booking/Customer/Vehicle/Invoice) to avoid
-- migration friction; only organization_id is a real FK (ON DELETE CASCADE).

-- 1) New outgoing invoice type for the final invoice / Schlussrechnung.
--    Added as a label only (no row references it here), so the Postgres
--    "unsafe use of new enum value" restriction does not apply.
ALTER TYPE "OrgInvoiceType" ADD VALUE IF NOT EXISTS 'OUTGOING_FINAL';

-- 2) generated_documents — metadata for every generated/static-attached PDF.
CREATE TABLE IF NOT EXISTS "generated_documents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "origin" TEXT NOT NULL DEFAULT 'GENERATED',
  "status" TEXT NOT NULL DEFAULT 'GENERATED',
  "booking_id" TEXT,
  "customer_id" TEXT,
  "vehicle_id" TEXT,
  "invoice_id" TEXT,
  "handover_protocol_id" TEXT,
  "rental_contract_id" TEXT,
  "deposit_id" TEXT,
  "legal_document_id" TEXT,
  "title" TEXT NOT NULL,
  "document_number" TEXT,
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
  "storage_provider" TEXT NOT NULL DEFAULT 'local',
  "object_key" TEXT NOT NULL,
  "size_bytes" INTEGER,
  "checksum" TEXT,
  "template_key" TEXT,
  "template_version" TEXT,
  "legal_version_label" TEXT,
  "generated_at" TIMESTAMP(3),
  "generated_by_user_id" TEXT,
  "sent_at" TIMESTAMP(3),
  "signed_at" TIMESTAMP(3),
  "voided_at" TIMESTAMP(3),
  "metadata" JSONB,
  "snapshot" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "generated_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "generated_documents_organization_id_idx" ON "generated_documents"("organization_id");
CREATE INDEX IF NOT EXISTS "generated_documents_booking_id_idx" ON "generated_documents"("booking_id");
CREATE INDEX IF NOT EXISTS "generated_documents_customer_id_idx" ON "generated_documents"("customer_id");
CREATE INDEX IF NOT EXISTS "generated_documents_vehicle_id_idx" ON "generated_documents"("vehicle_id");
CREATE INDEX IF NOT EXISTS "generated_documents_invoice_id_idx" ON "generated_documents"("invoice_id");
CREATE INDEX IF NOT EXISTS "generated_documents_document_type_idx" ON "generated_documents"("document_type");
CREATE INDEX IF NOT EXISTS "generated_documents_status_idx" ON "generated_documents"("status");

-- 3) organization_legal_documents — uploaded + versioned AGB / Widerruf.
CREATE TABLE IF NOT EXISTS "organization_legal_documents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "document_type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "version_label" TEXT NOT NULL,
  "language" TEXT NOT NULL DEFAULT 'de',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "file_name" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL DEFAULT 'application/pdf',
  "storage_provider" TEXT NOT NULL DEFAULT 'local',
  "object_key" TEXT NOT NULL,
  "checksum" TEXT,
  "size_bytes" INTEGER,
  "active_from" TIMESTAMP(3),
  "uploaded_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "organization_legal_documents_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "organization_legal_documents_organization_id_idx" ON "organization_legal_documents"("organization_id");
CREATE INDEX IF NOT EXISTS "organization_legal_documents_org_type_status_idx" ON "organization_legal_documents"("organization_id", "document_type", "status");

-- 4) booking_document_bundles — one row per booking; tracks required documents.
CREATE TABLE IF NOT EXISTS "booking_document_bundles" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "booking_invoice_document_id" TEXT,
  "deposit_receipt_document_id" TEXT,
  "rental_contract_document_id" TEXT,
  "terms_document_id" TEXT,
  "withdrawal_document_id" TEXT,
  "pickup_protocol_document_id" TEXT,
  "return_protocol_document_id" TEXT,
  "final_invoice_document_id" TEXT,
  "generated_at" TIMESTAMP(3),
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_document_bundles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_document_bundles_booking_id_key" ON "booking_document_bundles"("booking_id");
CREATE INDEX IF NOT EXISTS "booking_document_bundles_organization_id_idx" ON "booking_document_bundles"("organization_id");
CREATE INDEX IF NOT EXISTS "booking_document_bundles_status_idx" ON "booking_document_bundles"("status");

-- 5) booking_deposits — security deposit (Kaution), distinct from rental revenue.
CREATE TABLE IF NOT EXISTS "booking_deposits" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "status" TEXT NOT NULL DEFAULT 'REQUESTED',
  "payment_method" TEXT,
  "received_at" TIMESTAMP(3),
  "refunded_at" TIMESTAMP(3),
  "retained_amount_cents" INTEGER NOT NULL DEFAULT 0,
  "refund_amount_cents" INTEGER NOT NULL DEFAULT 0,
  "reason" TEXT,
  "receipt_document_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "booking_deposits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "booking_deposits_booking_id_key" ON "booking_deposits"("booking_id");
CREATE INDEX IF NOT EXISTS "booking_deposits_organization_id_idx" ON "booking_deposits"("organization_id");
CREATE INDEX IF NOT EXISTS "booking_deposits_customer_id_idx" ON "booking_deposits"("customer_id");
CREATE INDEX IF NOT EXISTS "booking_deposits_status_idx" ON "booking_deposits"("status");

-- 6) rental_contracts — contract metadata + immutable snapshot.
CREATE TABLE IF NOT EXISTS "rental_contracts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "customer_id" TEXT,
  "vehicle_id" TEXT,
  "contract_number" TEXT,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "terms_document_id" TEXT,
  "withdrawal_document_id" TEXT,
  "generated_document_id" TEXT,
  "snapshot" JSONB,
  "generated_at" TIMESTAMP(3),
  "signed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rental_contracts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "rental_contracts_booking_id_key" ON "rental_contracts"("booking_id");
CREATE INDEX IF NOT EXISTS "rental_contracts_organization_id_idx" ON "rental_contracts"("organization_id");
CREATE INDEX IF NOT EXISTS "rental_contracts_customer_id_idx" ON "rental_contracts"("customer_id");
CREATE INDEX IF NOT EXISTS "rental_contracts_vehicle_id_idx" ON "rental_contracts"("vehicle_id");
CREATE INDEX IF NOT EXISTS "rental_contracts_status_idx" ON "rental_contracts"("status");

-- 7) Foreign keys to organizations (ON DELETE CASCADE), added only if absent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'generated_documents_organization_id_fkey') THEN
    ALTER TABLE "generated_documents" ADD CONSTRAINT "generated_documents_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organization_legal_documents_organization_id_fkey') THEN
    ALTER TABLE "organization_legal_documents" ADD CONSTRAINT "organization_legal_documents_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_document_bundles_organization_id_fkey') THEN
    ALTER TABLE "booking_document_bundles" ADD CONSTRAINT "booking_document_bundles_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'booking_deposits_organization_id_fkey') THEN
    ALTER TABLE "booking_deposits" ADD CONSTRAINT "booking_deposits_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rental_contracts_organization_id_fkey') THEN
    ALTER TABLE "rental_contracts" ADD CONSTRAINT "rental_contracts_organization_id_fkey"
      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

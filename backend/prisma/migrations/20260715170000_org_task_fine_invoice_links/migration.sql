-- Task Domain V2 — additive links for FINE / INVOICE linked objects on org_tasks.
-- Also creates the fines table referenced by OrgTask.fineId (schema was ahead of migrations).

CREATE TYPE "FineStatus" AS ENUM (
  'NEW',
  'UNDER_REVIEW',
  'MATCHED',
  'FORWARDED',
  'PENDING_RESPONSE',
  'RESOLVED',
  'CLOSED'
);

CREATE TABLE "fines" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT,
  "booking_id" TEXT,
  "customer_id" TEXT,
  "fine_number" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "offense_type" TEXT,
  "issuing_authority" TEXT,
  "offense_date" TIMESTAMP(3),
  "received_date" TIMESTAMP(3),
  "location" TEXT,
  "amount_cents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'EUR',
  "due_date" TIMESTAMP(3),
  "status" "FineStatus" NOT NULL DEFAULT 'NEW',
  "image_url" TEXT,
  "extracted_data" JSONB,
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "fines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "fines_organization_id_idx" ON "fines"("organization_id");
CREATE INDEX "fines_vehicle_id_idx" ON "fines"("vehicle_id");
CREATE INDEX "fines_customer_id_idx" ON "fines"("customer_id");
CREATE INDEX "fines_status_idx" ON "fines"("status");
CREATE INDEX "fines_offense_date_idx" ON "fines"("offense_date");

ALTER TABLE "org_tasks"
  ADD COLUMN IF NOT EXISTS "fine_id" TEXT,
  ADD COLUMN IF NOT EXISTS "invoice_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_tasks_fine_id_idx" ON "org_tasks"("fine_id");
CREATE INDEX IF NOT EXISTS "org_tasks_invoice_id_idx" ON "org_tasks"("invoice_id");

ALTER TABLE "org_tasks"
  ADD CONSTRAINT "org_tasks_fine_id_fkey"
  FOREIGN KEY ("fine_id") REFERENCES "fines"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "org_tasks"
  ADD CONSTRAINT "org_tasks_invoice_id_fkey"
  FOREIGN KEY ("invoice_id") REFERENCES "org_invoices"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

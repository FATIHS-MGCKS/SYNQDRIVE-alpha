-- Invoice provenance model (additive, legacy rows keep NULL columns)

CREATE TYPE "InvoiceCreationChannel" AS ENUM (
  'MANUAL_UI',
  'BOOKING_WIZARD',
  'API',
  'IMPORT',
  'DOCUMENT_EXTRACTION',
  'AUTOMATION',
  'SYSTEM_MIGRATION'
);

CREATE TYPE "InvoiceSourceType" AS ENUM (
  'BOOKING',
  'DAMAGE',
  'SERVICE',
  'MANUAL',
  'DOCUMENT',
  'SUBSCRIPTION',
  'OTHER'
);

CREATE TYPE "InvoiceTriggeredByType" AS ENUM (
  'USER',
  'SYSTEM',
  'AUTOMATION',
  'API_CLIENT',
  'MIGRATION'
);

ALTER TABLE "org_invoices"
  ADD COLUMN IF NOT EXISTS "creation_channel" "InvoiceCreationChannel",
  ADD COLUMN IF NOT EXISTS "source_type" "InvoiceSourceType",
  ADD COLUMN IF NOT EXISTS "source_id" TEXT,
  ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "triggered_by_type" "InvoiceTriggeredByType",
  ADD COLUMN IF NOT EXISTS "automation_id" TEXT,
  ADD COLUMN IF NOT EXISTS "correlation_id" TEXT;

CREATE INDEX IF NOT EXISTS "org_invoices_creation_channel_idx" ON "org_invoices" ("creation_channel");
CREATE INDEX IF NOT EXISTS "org_invoices_source_type_idx" ON "org_invoices" ("source_type");
CREATE INDEX IF NOT EXISTS "org_invoices_created_by_user_id_idx" ON "org_invoices" ("created_by_user_id");
CREATE INDEX IF NOT EXISTS "org_invoices_triggered_by_type_idx" ON "org_invoices" ("triggered_by_type");

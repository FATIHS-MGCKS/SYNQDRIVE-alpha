-- Vendor Management Overhaul
--
-- Makes Vendor the single source of truth for external service providers.
--  * Extends VendorCategory with full provider coverage.
--  * Adds vendor data-origin tracking (source + external_place_id) for Mapbox POI prefill.
--  * Upgrades vendor_vehicles links with a relation type + lifecycle metadata
--    (the link is now managed exclusively via dedicated link endpoints, never
--    wiped by a vendor master-data update).
--  * Adds OrgInvoice.vendor_id (real FK) while keeping vendor_name as a snapshot.
--  * Adds VENDOR / VENDOR_VEHICLE_LINK audit entities.
--  * Removes the legacy ServicePartner / Euromaster / ADAC world entirely.
--
-- Idempotent and backward compatible: existing vendor rows keep their data, new
-- columns have safe defaults, no vendor/invoice data is dropped.

-- 1) Extend VendorCategory with the missing provider types (labels only).
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'INSURANCE';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'APPRAISER';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'TOWING';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'DEALERSHIP';
ALTER TYPE "VendorCategory" ADD VALUE IF NOT EXISTS 'OEM_SERVICE';

-- 2) New audit entities for vendor lifecycle.
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'VENDOR';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'VENDOR_VEHICLE_LINK';

-- 3) New enums (created fresh — usable immediately as defaults).
DO $$ BEGIN
  CREATE TYPE "VendorSource" AS ENUM ('MANUAL', 'MAPBOX');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "VendorVehicleRelationType" AS ENUM (
    'PRIMARY_WORKSHOP', 'TIRE_PARTNER', 'BODY_SHOP', 'GLASS_REPAIR',
    'CLEANING_PARTNER', 'INSPECTION_PARTNER', 'OTHER'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4) Vendor master-data extensions.
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "source" "VendorSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "external_place_id" TEXT;
ALTER TABLE "vendors" ADD COLUMN IF NOT EXISTS "address_line2" TEXT;

-- 5) Vendor↔Vehicle link upgrades. updated_at is backfilled to now() for
--    existing rows so the NOT NULL constraint is satisfied.
ALTER TABLE "vendor_vehicles" ADD COLUMN IF NOT EXISTS "relation_type" "VendorVehicleRelationType" NOT NULL DEFAULT 'OTHER';
ALTER TABLE "vendor_vehicles" ADD COLUMN IF NOT EXISTS "is_preferred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "vendor_vehicles" ADD COLUMN IF NOT EXISTS "priority" INTEGER;
ALTER TABLE "vendor_vehicles" ADD COLUMN IF NOT EXISTS "valid_from" TIMESTAMP(3);
ALTER TABLE "vendor_vehicles" ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMP(3);
ALTER TABLE "vendor_vehicles" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 6) OrgInvoice gets a real vendor relation (vendor_name kept as snapshot).
ALTER TABLE "org_invoices" ADD COLUMN IF NOT EXISTS "vendor_id" TEXT;
CREATE INDEX IF NOT EXISTS "org_invoices_vendor_id_idx" ON "org_invoices"("vendor_id");
DO $$ BEGIN
  ALTER TABLE "org_invoices"
    ADD CONSTRAINT "org_invoices_vendor_id_fkey"
    FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 7) Remove the legacy ServicePartner / Euromaster / ADAC world.
DROP TABLE IF EXISTS "partner_service_case_events" CASCADE;
DROP TABLE IF EXISTS "partner_service_cases" CASCADE;
DROP TABLE IF EXISTS "partner_data_authorizations" CASCADE;
DROP TABLE IF EXISTS "tenant_service_partner_assignments" CASCADE;
DROP TABLE IF EXISTS "service_partners" CASCADE;

DROP TYPE IF EXISTS "ServiceCaseStatus";
DROP TYPE IF EXISTS "ServiceCaseType";
DROP TYPE IF EXISTS "PartnerDataAuthStatus";
DROP TYPE IF EXISTS "PartnerAssignmentStatus";
DROP TYPE IF EXISTS "PartnerAssignmentMode";
DROP TYPE IF EXISTS "ServicePartnerGlobalStatus";
DROP TYPE IF EXISTS "ServicePartnerCategory";
DROP TYPE IF EXISTS "ServicePartnerProvider";

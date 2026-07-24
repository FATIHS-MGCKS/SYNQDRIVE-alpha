-- Prompt 9: Relational enforcement policy scopes + versioning

-- CreateEnum
CREATE TYPE "EnforcementPolicyScopeResourceType" AS ENUM ('VEHICLE', 'CUSTOMER', 'BOOKING', 'STATION');
CREATE TYPE "EnforcementPolicyScopeMigrationFindingCode" AS ENUM ('RESOURCE_NOT_FOUND', 'CROSS_TENANT', 'INVALID_REFERENCE', 'DUPLICATE_SKIPPED');
CREATE TYPE "EnforcementPolicyScopeMigrationSource" AS ENUM ('LEGACY_POLICY_COLUMN', 'LEGACY_ORG_DATA_AUTHORIZATION_JSON');

-- Add STATION to scope type enum
ALTER TYPE "PrivacyEnforcementScopeType" ADD VALUE IF NOT EXISTS 'STATION';

-- enforcement_policies: versioning columns
ALTER TABLE "enforcement_policies"
  ADD COLUMN IF NOT EXISTS "policy_family_id" TEXT,
  ADD COLUMN IF NOT EXISTS "version_number" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "is_current_version" BOOLEAN NOT NULL DEFAULT true;

UPDATE "enforcement_policies"
SET "policy_family_id" = "id"
WHERE "policy_family_id" IS NULL;

ALTER TABLE "enforcement_policies"
  ALTER COLUMN "policy_family_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "enforcement_policies_policy_family_id_version_number_key"
  ON "enforcement_policies"("policy_family_id", "version_number");
CREATE INDEX IF NOT EXISTS "enforcement_policies_organization_id_is_current_version_idx"
  ON "enforcement_policies"("organization_id", "is_current_version");
CREATE INDEX IF NOT EXISTS "enforcement_policies_policy_family_id_is_current_version_idx"
  ON "enforcement_policies"("policy_family_id", "is_current_version");

-- Relational scope tables
CREATE TABLE "enforcement_policy_vehicles" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "enforcement_policy_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enforcement_policy_vehicles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enforcement_policy_customers" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "enforcement_policy_id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enforcement_policy_customers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enforcement_policy_bookings" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "enforcement_policy_id" TEXT NOT NULL,
  "booking_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enforcement_policy_bookings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enforcement_policy_stations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "enforcement_policy_id" TEXT NOT NULL,
  "station_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enforcement_policy_stations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enforcement_policy_scope_migration_findings" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "enforcement_policy_id" TEXT,
  "legacy_source" "EnforcementPolicyScopeMigrationSource" NOT NULL,
  "resource_type" "EnforcementPolicyScopeResourceType" NOT NULL,
  "reference_fingerprint" TEXT NOT NULL,
  "finding_code" "EnforcementPolicyScopeMigrationFindingCode" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enforcement_policy_scope_migration_findings_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX "enforcement_policy_vehicles_enforcement_policy_id_vehicle_id_key"
  ON "enforcement_policy_vehicles"("enforcement_policy_id", "vehicle_id");
CREATE INDEX "enforcement_policy_vehicles_organization_id_idx"
  ON "enforcement_policy_vehicles"("organization_id");
CREATE INDEX "enforcement_policy_vehicles_vehicle_id_idx"
  ON "enforcement_policy_vehicles"("vehicle_id");

CREATE UNIQUE INDEX "enforcement_policy_customers_enforcement_policy_id_customer_id_key"
  ON "enforcement_policy_customers"("enforcement_policy_id", "customer_id");
CREATE INDEX "enforcement_policy_customers_organization_id_idx"
  ON "enforcement_policy_customers"("organization_id");
CREATE INDEX "enforcement_policy_customers_customer_id_idx"
  ON "enforcement_policy_customers"("customer_id");

CREATE UNIQUE INDEX "enforcement_policy_bookings_enforcement_policy_id_booking_id_key"
  ON "enforcement_policy_bookings"("enforcement_policy_id", "booking_id");
CREATE INDEX "enforcement_policy_bookings_organization_id_idx"
  ON "enforcement_policy_bookings"("organization_id");
CREATE INDEX "enforcement_policy_bookings_booking_id_idx"
  ON "enforcement_policy_bookings"("booking_id");

CREATE UNIQUE INDEX "enforcement_policy_stations_enforcement_policy_id_station_id_key"
  ON "enforcement_policy_stations"("enforcement_policy_id", "station_id");
CREATE INDEX "enforcement_policy_stations_organization_id_idx"
  ON "enforcement_policy_stations"("organization_id");
CREATE INDEX "enforcement_policy_stations_station_id_idx"
  ON "enforcement_policy_stations"("station_id");

CREATE INDEX "enforcement_policy_scope_migration_findings_organization_id_created_at_idx"
  ON "enforcement_policy_scope_migration_findings"("organization_id", "created_at");
CREATE INDEX "enforcement_policy_scope_migration_findings_enforcement_policy_id_idx"
  ON "enforcement_policy_scope_migration_findings"("enforcement_policy_id");
CREATE INDEX "enforcement_policy_scope_migration_findings_finding_code_idx"
  ON "enforcement_policy_scope_migration_findings"("finding_code");

-- Foreign keys
ALTER TABLE "enforcement_policy_vehicles"
  ADD CONSTRAINT "enforcement_policy_vehicles_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enforcement_policy_vehicles_enforcement_policy_id_fkey"
    FOREIGN KEY ("enforcement_policy_id") REFERENCES "enforcement_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enforcement_policy_vehicles_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enforcement_policy_customers"
  ADD CONSTRAINT "enforcement_policy_customers_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enforcement_policy_customers_enforcement_policy_id_fkey"
    FOREIGN KEY ("enforcement_policy_id") REFERENCES "enforcement_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enforcement_policy_customers_customer_id_fkey"
    FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enforcement_policy_bookings"
  ADD CONSTRAINT "enforcement_policy_bookings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enforcement_policy_bookings_enforcement_policy_id_fkey"
    FOREIGN KEY ("enforcement_policy_id") REFERENCES "enforcement_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enforcement_policy_bookings_booking_id_fkey"
    FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enforcement_policy_stations"
  ADD CONSTRAINT "enforcement_policy_stations_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enforcement_policy_stations_enforcement_policy_id_fkey"
    FOREIGN KEY ("enforcement_policy_id") REFERENCES "enforcement_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enforcement_policy_stations_station_id_fkey"
    FOREIGN KEY ("station_id") REFERENCES "stations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enforcement_policy_scope_migration_findings"
  ADD CONSTRAINT "enforcement_policy_scope_migration_findings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "enforcement_policy_scope_migration_findings_enforcement_policy_id_fkey"
    FOREIGN KEY ("enforcement_policy_id") REFERENCES "enforcement_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill single legacy scope columns into relational tables (migration-safe, idempotent)
INSERT INTO "enforcement_policy_vehicles" ("id", "organization_id", "enforcement_policy_id", "vehicle_id", "created_at")
SELECT gen_random_uuid(), ep."organization_id", ep."id", ep."scope_vehicle_id", NOW()
FROM "enforcement_policies" ep
WHERE ep."scope_vehicle_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "enforcement_policy_vehicles" epv
    WHERE epv."enforcement_policy_id" = ep."id" AND epv."vehicle_id" = ep."scope_vehicle_id"
  );

INSERT INTO "enforcement_policy_customers" ("id", "organization_id", "enforcement_policy_id", "customer_id", "created_at")
SELECT gen_random_uuid(), ep."organization_id", ep."id", ep."scope_customer_id", NOW()
FROM "enforcement_policies" ep
WHERE ep."scope_customer_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "enforcement_policy_customers" epc
    WHERE epc."enforcement_policy_id" = ep."id" AND epc."customer_id" = ep."scope_customer_id"
  );

INSERT INTO "enforcement_policy_bookings" ("id", "organization_id", "enforcement_policy_id", "booking_id", "created_at")
SELECT gen_random_uuid(), ep."organization_id", ep."id", ep."scope_booking_id", NOW()
FROM "enforcement_policies" ep
WHERE ep."scope_booking_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "enforcement_policy_bookings" epb
    WHERE epb."enforcement_policy_id" = ep."id" AND epb."booking_id" = ep."scope_booking_id"
  );

-- Drop legacy single-scope columns (JSON backfill handled by ops script)
ALTER TABLE "enforcement_policies"
  DROP COLUMN IF EXISTS "scope_vehicle_id",
  DROP COLUMN IF EXISTS "scope_customer_id",
  DROP COLUMN IF EXISTS "scope_booking_id";

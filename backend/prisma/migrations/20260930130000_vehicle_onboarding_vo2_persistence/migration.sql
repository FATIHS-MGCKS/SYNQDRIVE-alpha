-- VO-2 Vehicle Onboarding persistence foundation (non-destructive).
-- Does not drop uq_data_source_link_active — see architecture/vehicle-onboarding/evidence/VO2_LINK_HISTORY_AUDIT.md

-- CreateEnum
CREATE TYPE "VehicleRegistryLifecycle" AS ENUM ('ACTIVE', 'OFFBOARDED', 'ARCHIVED');
CREATE TYPE "VehicleVinVerificationState" AS ENUM ('UNVERIFIED', 'VERIFIED', 'CONFLICT', 'LEGACY_UNKNOWN', 'LEGACY_SYNTHETIC');
CREATE TYPE "VehicleVinProvenance" AS ENUM ('PROVIDER', 'MANUAL', 'DOCUMENT', 'LEGACY_UNKNOWN', 'LEGACY_SYNTHETIC');
CREATE TYPE "OnboardingCaseSourceMode" AS ENUM ('DIMO', 'HIGH_MOBILITY', 'MANUAL', 'COMPOSITE');
CREATE TYPE "OnboardingCaseStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'READY_FOR_ACTIVATION', 'COMPLETED', 'CANCELLED', 'EXPIRED');
CREATE TYPE "VehicleRegistryLifecycleOutboxEventType" AS ENUM ('VEHICLE_ACTIVATED', 'VEHICLE_OFFBOARDED', 'VEHICLE_ARCHIVED', 'VEHICLE_ORGANIZATION_TRANSFERRED');
CREATE TYPE "VehicleRegistryLifecycleOutboxStatus" AS ENUM ('PENDING', 'PUBLISHED', 'FAILED');

-- Vehicle registry lifecycle + VIN semantics
ALTER TABLE "vehicles" ADD COLUMN "registry_lifecycle" "VehicleRegistryLifecycle" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "vehicles" ADD COLUMN "vin_verification_state" "VehicleVinVerificationState" NOT NULL DEFAULT 'LEGACY_UNKNOWN';
ALTER TABLE "vehicles" ADD COLUMN "vin_provenance" "VehicleVinProvenance" NOT NULL DEFAULT 'LEGACY_UNKNOWN';

-- Conservative VIN classification backfill (never auto-VERIFIED)
UPDATE "vehicles"
SET
  "vin_verification_state" = 'LEGACY_SYNTHETIC',
  "vin_provenance" = 'LEGACY_SYNTHETIC'
WHERE "vin" ~ '^DIMO-';

UPDATE "vehicles"
SET
  "vin_verification_state" = 'LEGACY_UNKNOWN',
  "vin_provenance" = 'LEGACY_UNKNOWN'
WHERE "vin_verification_state" = 'LEGACY_UNKNOWN'
  AND "vin_provenance" = 'LEGACY_UNKNOWN'
  AND "vin" IS NOT NULL
  AND "vin" !~ '^DIMO-';

-- Nullable VIN (PostgreSQL: multiple NULLs allowed on @@unique([vin, organizationId]))
ALTER TABLE "vehicles" ALTER COLUMN "vin" DROP NOT NULL;

CREATE INDEX "vehicles_registry_lifecycle_idx" ON "vehicles"("registry_lifecycle");

-- Provider link history metadata (constraint unchanged)
ALTER TABLE "vehicle_data_source_links" ADD COLUMN "superseded_by_link_id" TEXT;
ALTER TABLE "vehicle_data_source_links" ADD COLUMN "deactivation_reason" TEXT;
ALTER TABLE "vehicle_data_source_links" ADD CONSTRAINT "vehicle_data_source_links_superseded_by_link_id_fkey"
  FOREIGN KEY ("superseded_by_link_id") REFERENCES "vehicle_data_source_links"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OnboardingCase
CREATE TABLE "vehicle_onboarding_cases" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "source_mode" "OnboardingCaseSourceMode" NOT NULL,
    "status" "OnboardingCaseStatus" NOT NULL DEFAULT 'OPEN',
    "primary_source_provider" TEXT,
    "primary_source_external_id" TEXT,
    "draft_identity_json" JSONB,
    "draft_admin_baseline_json" JSONB,
    "draft_technical_baseline_json" JSONB,
    "readiness_snapshot_json" JSONB,
    "readiness_profile_version" TEXT,
    "validation_findings_json" JSONB,
    "idempotency_key" TEXT,
    "concurrency_token" TEXT,
    "vehicle_id" TEXT,
    "initiated_by_user_id" TEXT,
    "last_actor_user_id" TEXT,
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "expired_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_onboarding_cases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_onboarding_case_source_refs" (
    "id" TEXT NOT NULL,
    "onboarding_case_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "connection_scope" TEXT,
    "external_vehicle_identity" TEXT NOT NULL,
    "source_mirror_table" TEXT,
    "source_mirror_id" TEXT,
    "provenance_at" TIMESTAMP(3),
    "first_seen_at" TIMESTAMP(3),
    "last_seen_at" TIMESTAMP(3),
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "snapshot_metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_onboarding_case_source_refs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_organization_assignments" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "assignment_reason" TEXT,
    "assignment_source" TEXT,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_organization_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_license_plate_assignments" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "plate" TEXT NOT NULL,
    "jurisdiction" TEXT,
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_to" TIMESTAMP(3),
    "source" TEXT,
    "actor_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_license_plate_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "vehicle_registry_lifecycle_outbox" (
    "id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "event_type" "VehicleRegistryLifecycleOutboxEventType" NOT NULL,
    "vehicle_id" TEXT,
    "organization_id" TEXT,
    "payload_version" INTEGER NOT NULL DEFAULT 1,
    "payload" JSONB NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "status" "VehicleRegistryLifecycleOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "last_error" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_registry_lifecycle_outbox_pkey" PRIMARY KEY ("id")
);

-- FKs
ALTER TABLE "vehicle_onboarding_cases" ADD CONSTRAINT "vehicle_onboarding_cases_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_onboarding_cases" ADD CONSTRAINT "vehicle_onboarding_cases_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_onboarding_case_source_refs" ADD CONSTRAINT "vehicle_onboarding_case_source_refs_onboarding_case_id_fkey"
  FOREIGN KEY ("onboarding_case_id") REFERENCES "vehicle_onboarding_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_organization_assignments" ADD CONSTRAINT "vehicle_organization_assignments_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_license_plate_assignments" ADD CONSTRAINT "vehicle_license_plate_assignments_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "vehicle_registry_lifecycle_outbox" ADD CONSTRAINT "vehicle_registry_lifecycle_outbox_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "vehicle_onboarding_cases_organization_id_status_idx" ON "vehicle_onboarding_cases"("organization_id", "status");
CREATE INDEX "vehicle_onboarding_cases_vehicle_id_idx" ON "vehicle_onboarding_cases"("vehicle_id");
CREATE INDEX "vehicle_onboarding_cases_idempotency_key_idx" ON "vehicle_onboarding_cases"("idempotency_key");
CREATE INDEX "vehicle_onboarding_case_source_refs_onboarding_case_id_idx" ON "vehicle_onboarding_case_source_refs"("onboarding_case_id");
CREATE INDEX "vehicle_onboarding_case_source_refs_provider_external_vehicle_identity_idx" ON "vehicle_onboarding_case_source_refs"("provider", "external_vehicle_identity");
CREATE INDEX "vehicle_organization_assignments_vehicle_id_idx" ON "vehicle_organization_assignments"("vehicle_id");
CREATE INDEX "vehicle_organization_assignments_organization_id_idx" ON "vehicle_organization_assignments"("organization_id");
CREATE INDEX "vehicle_organization_assignments_vehicle_id_valid_to_idx" ON "vehicle_organization_assignments"("vehicle_id", "valid_to");
CREATE INDEX "vehicle_license_plate_assignments_vehicle_id_idx" ON "vehicle_license_plate_assignments"("vehicle_id");
CREATE INDEX "vehicle_license_plate_assignments_vehicle_id_valid_to_idx" ON "vehicle_license_plate_assignments"("vehicle_id", "valid_to");
CREATE UNIQUE INDEX "vehicle_registry_lifecycle_outbox_event_id_key" ON "vehicle_registry_lifecycle_outbox"("event_id");
CREATE UNIQUE INDEX "vehicle_registry_lifecycle_outbox_idempotency_key_key" ON "vehicle_registry_lifecycle_outbox"("idempotency_key");
CREATE INDEX "vehicle_registry_lifecycle_outbox_status_occurred_at_idx" ON "vehicle_registry_lifecycle_outbox"("status", "occurred_at");
CREATE INDEX "vehicle_registry_lifecycle_outbox_status_next_retry_at_idx" ON "vehicle_registry_lifecycle_outbox"("status", "next_retry_at");
CREATE INDEX "vehicle_registry_lifecycle_outbox_vehicle_id_occurred_at_idx" ON "vehicle_registry_lifecycle_outbox"("vehicle_id", "occurred_at");
CREATE INDEX "vehicle_registry_lifecycle_outbox_organization_id_occurred_at_idx" ON "vehicle_registry_lifecycle_outbox"("organization_id", "occurred_at");

-- Partial unique: one open org assignment per vehicle
CREATE UNIQUE INDEX "uq_vehicle_org_assignment_open"
  ON "vehicle_organization_assignments" ("vehicle_id")
  WHERE "valid_to" IS NULL;

-- Partial unique: one open plate assignment per vehicle
CREATE UNIQUE INDEX "uq_vehicle_license_plate_open"
  ON "vehicle_license_plate_assignments" ("vehicle_id")
  WHERE "valid_to" IS NULL;

-- Partial unique: one non-terminal onboarding case per org + primary source identity
CREATE UNIQUE INDEX "uq_vo_onboarding_case_open_primary_source"
  ON "vehicle_onboarding_cases" ("organization_id", "primary_source_provider", "primary_source_external_id")
  WHERE "status" IN ('OPEN', 'IN_PROGRESS', 'READY_FOR_ACTIVATION')
    AND "primary_source_provider" IS NOT NULL
    AND "primary_source_external_id" IS NOT NULL;

-- Partial unique: idempotency for non-terminal cases
CREATE UNIQUE INDEX "uq_vo_onboarding_case_open_idempotency"
  ON "vehicle_onboarding_cases" ("organization_id", "idempotency_key")
  WHERE "status" IN ('OPEN', 'IN_PROGRESS', 'READY_FOR_ACTIVATION')
    AND "idempotency_key" IS NOT NULL;

-- Backfill organization assignment (legacy baseline — valid_from = vehicle.created_at)
INSERT INTO "vehicle_organization_assignments" (
  "id", "vehicle_id", "organization_id", "valid_from", "assignment_reason", "assignment_source", "created_at"
)
SELECT
  gen_random_uuid()::text,
  v."id",
  v."organization_id",
  v."created_at",
  'LEGACY_BASELINE',
  'VO2_MIGRATION_APPROX',
  CURRENT_TIMESTAMP
FROM "vehicles" v;

-- Backfill open license plate rows where plate present
INSERT INTO "vehicle_license_plate_assignments" (
  "id", "vehicle_id", "plate", "valid_from", "source", "created_at"
)
SELECT
  gen_random_uuid()::text,
  v."id",
  TRIM(v."license_plate"),
  v."created_at",
  'VO2_MIGRATION_CURRENT_PROJECTION',
  CURRENT_TIMESTAMP
FROM "vehicles" v
WHERE v."license_plate" IS NOT NULL AND TRIM(v."license_plate") <> '';

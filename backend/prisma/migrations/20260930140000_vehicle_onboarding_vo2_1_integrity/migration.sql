-- VO-2.1 — persistence integrity (idempotency, scope identity, terminal checks, link history, org FK).
-- DB-only partial indexes below are NOT represented in Prisma @@unique — do not reintroduce compound unique on is_active.

-- OnboardingCase: scope + JSON contract versions
ALTER TABLE "vehicle_onboarding_cases"
  ADD COLUMN IF NOT EXISTS "primary_source_scope_key" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "draft_identity_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "draft_admin_baseline_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "draft_technical_baseline_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "readiness_snapshot_version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "validation_findings_version" INTEGER NOT NULL DEFAULT 0;

-- SourceRef: normalized scope + metadata version
ALTER TABLE "vehicle_onboarding_case_source_refs"
  ADD COLUMN IF NOT EXISTS "connection_scope_key" TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS "snapshot_metadata_version" INTEGER NOT NULL DEFAULT 0;

-- Backfill scope keys from nullable connection_scope (NULL → provider-global '')
UPDATE "vehicle_onboarding_case_source_refs"
SET "connection_scope_key" = COALESCE("connection_scope", '')
WHERE "connection_scope_key" = '' AND "connection_scope" IS NOT NULL;

-- Replace non-terminal-only idempotency with durable org+key reservation
DROP INDEX IF EXISTS "uq_vo_onboarding_case_open_idempotency";
CREATE UNIQUE INDEX "uq_vo_onboarding_case_idempotency_global"
  ON "vehicle_onboarding_cases" ("organization_id", "idempotency_key")
  WHERE "idempotency_key" IS NOT NULL;

-- Open-case primary source identity includes connection/account scope
DROP INDEX IF EXISTS "uq_vo_onboarding_case_open_primary_source";
CREATE UNIQUE INDEX "uq_vo_onboarding_case_open_primary_source"
  ON "vehicle_onboarding_cases" (
    "organization_id",
    "primary_source_provider",
    "primary_source_scope_key",
    "primary_source_external_id"
  )
  WHERE "status" IN ('OPEN', 'IN_PROGRESS', 'READY_FOR_ACTIVATION')
    AND "primary_source_provider" IS NOT NULL
    AND "primary_source_external_id" IS NOT NULL;

-- At most one is_primary per case
CREATE UNIQUE INDEX "uq_vo_onboarding_case_source_ref_one_primary"
  ON "vehicle_onboarding_case_source_refs" ("onboarding_case_id")
  WHERE "is_primary" = true;

-- No duplicate semantic source refs per case (NULL-safe scope)
CREATE UNIQUE INDEX "uq_vo_onboarding_case_source_ref_semantic"
  ON "vehicle_onboarding_case_source_refs" (
    "onboarding_case_id",
    "provider",
    "connection_scope_key",
    "external_vehicle_identity"
  );

-- Terminal / non-terminal field integrity
ALTER TABLE "vehicle_onboarding_cases" DROP CONSTRAINT IF EXISTS "chk_vo_onboarding_case_completed";
ALTER TABLE "vehicle_onboarding_cases" DROP CONSTRAINT IF EXISTS "chk_vo_onboarding_case_cancelled";
ALTER TABLE "vehicle_onboarding_cases" DROP CONSTRAINT IF EXISTS "chk_vo_onboarding_case_expired";
ALTER TABLE "vehicle_onboarding_cases" DROP CONSTRAINT IF EXISTS "chk_vo_onboarding_case_non_terminal";

ALTER TABLE "vehicle_onboarding_cases" ADD CONSTRAINT "chk_vo_onboarding_case_completed"
  CHECK (
    "status" <> 'COMPLETED'
    OR (
      "vehicle_id" IS NOT NULL
      AND "completed_at" IS NOT NULL
      AND "cancelled_at" IS NULL
      AND "expired_at" IS NULL
    )
  );

ALTER TABLE "vehicle_onboarding_cases" ADD CONSTRAINT "chk_vo_onboarding_case_cancelled"
  CHECK (
    "status" <> 'CANCELLED'
    OR (
      "vehicle_id" IS NULL
      AND "cancelled_at" IS NOT NULL
      AND "completed_at" IS NULL
      AND "expired_at" IS NULL
    )
  );

ALTER TABLE "vehicle_onboarding_cases" ADD CONSTRAINT "chk_vo_onboarding_case_expired"
  CHECK (
    "status" <> 'EXPIRED'
    OR (
      "vehicle_id" IS NULL
      AND "expired_at" IS NOT NULL
      AND "completed_at" IS NULL
      AND "cancelled_at" IS NULL
    )
  );

ALTER TABLE "vehicle_onboarding_cases" ADD CONSTRAINT "chk_vo_onboarding_case_non_terminal"
  CHECK (
    "status" NOT IN ('OPEN', 'IN_PROGRESS', 'READY_FOR_ACTIVATION')
    OR (
      "vehicle_id" IS NULL
      AND "completed_at" IS NULL
      AND "cancelled_at" IS NULL
      AND "expired_at" IS NULL
    )
  );

-- Organization assignment history: authoritative org FK (no CASCADE delete of history)
ALTER TABLE "vehicle_organization_assignments" DROP CONSTRAINT IF EXISTS "vehicle_organization_assignments_organization_id_fkey";
ALTER TABLE "vehicle_organization_assignments" ADD CONSTRAINT "vehicle_organization_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- VehicleDataSourceLink: unlimited inactive episodes; one active row per logical scope (NULL-safe subtype)
DROP INDEX IF EXISTS "uq_data_source_link_active";
CREATE UNIQUE INDEX "uq_vehicle_data_source_link_active_scope"
  ON "vehicle_data_source_links" ("vehicle_id", "source_type", COALESCE("source_subtype", ''))
  WHERE "is_active" = true;

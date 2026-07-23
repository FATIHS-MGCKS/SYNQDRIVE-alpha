-- Prompt 10: Legacy migration run tracking for controlled backfill

CREATE TYPE "DataAuthorizationLegacyMigrationMode" AS ENUM ('DRY_RUN', 'COMMIT', 'ROLLBACK');
CREATE TYPE "DataAuthorizationLegacyMigrationRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');
CREATE TYPE "DataAuthorizationLegacyMigrationEntryStatus" AS ENUM ('ANALYZED', 'MIGRATED', 'REVIEW_REQUIRED', 'ERROR', 'SKIPPED', 'ROLLED_BACK');
CREATE TYPE "DataAuthorizationLegacyMigrationSourceType" AS ENUM ('ORG_DATA_AUTHORIZATION', 'VEHICLE_PROVIDER_CONSENT');
CREATE TYPE "DataAuthorizationLegacyMigrationTargetType" AS ENUM ('PROCESSING_ACTIVITY', 'PROVIDER_ACCESS_GRANT', 'ENFORCEMENT_POLICY');
CREATE TYPE "DataAuthorizationLegacyMigrationReviewReason" AS ENUM (
  'SYSTEM_GENERATED_DIMO',
  'ACTIVE_NOT_COMPLIANT',
  'INCOMPLETE_SCOPE',
  'UNMAPPED_DATA_CATEGORY',
  'UNMAPPED_PURPOSE',
  'CONTRADICTORY_PROVIDER_STATE',
  'LEGAL_BASIS_UNCLEAR',
  'ALREADY_MIGRATED',
  'PROVIDER_SCOPE_UNKNOWN'
);

CREATE TABLE "data_authorization_legacy_migration_runs" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "mode" "DataAuthorizationLegacyMigrationMode" NOT NULL,
  "batch_size" INTEGER NOT NULL,
  "status" "DataAuthorizationLegacyMigrationRunStatus" NOT NULL DEFAULT 'RUNNING',
  "analyzed_count" INTEGER NOT NULL DEFAULT 0,
  "migrated_count" INTEGER NOT NULL DEFAULT 0,
  "review_required_count" INTEGER NOT NULL DEFAULT 0,
  "error_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "report_json" JSONB,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_authorization_legacy_migration_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_authorization_legacy_migration_entries" (
  "id" UUID NOT NULL,
  "run_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "source_type" "DataAuthorizationLegacyMigrationSourceType" NOT NULL,
  "legacy_source_id" UUID NOT NULL,
  "target_type" "DataAuthorizationLegacyMigrationTargetType",
  "target_id" UUID,
  "status" "DataAuthorizationLegacyMigrationEntryStatus" NOT NULL,
  "review_reasons" "DataAuthorizationLegacyMigrationReviewReason"[] DEFAULT ARRAY[]::"DataAuthorizationLegacyMigrationReviewReason"[],
  "error_code" TEXT,
  "migration_fingerprint" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_authorization_legacy_migration_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "data_authorization_legacy_migration_runs_organization_id_created_at_idx"
  ON "data_authorization_legacy_migration_runs"("organization_id", "created_at");
CREATE INDEX "data_authorization_legacy_migration_runs_status_created_at_idx"
  ON "data_authorization_legacy_migration_runs"("status", "created_at");

CREATE UNIQUE INDEX "data_authorization_legacy_migration_entries_migration_fingerprint_key"
  ON "data_authorization_legacy_migration_entries"("migration_fingerprint");
CREATE INDEX "data_authorization_legacy_migration_entries_run_id_idx"
  ON "data_authorization_legacy_migration_entries"("run_id");
CREATE INDEX "data_authorization_legacy_migration_entries_organization_id_status_idx"
  ON "data_authorization_legacy_migration_entries"("organization_id", "status");
CREATE INDEX "data_authorization_legacy_migration_entries_legacy_source_id_source_type_idx"
  ON "data_authorization_legacy_migration_entries"("legacy_source_id", "source_type");

ALTER TABLE "data_authorization_legacy_migration_runs"
  ADD CONSTRAINT "data_authorization_legacy_migration_runs_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "data_authorization_legacy_migration_entries"
  ADD CONSTRAINT "data_authorization_legacy_migration_entries_run_id_fkey"
    FOREIGN KEY ("run_id") REFERENCES "data_authorization_legacy_migration_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "data_authorization_legacy_migration_entries_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

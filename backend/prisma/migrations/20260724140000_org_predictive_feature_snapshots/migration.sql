-- Prompt 41/54 — versioned predictive feature snapshots per organization

CREATE TYPE "PredictiveFeatureGrain" AS ENUM ('DAILY');

CREATE TYPE "PredictiveFeatureDataQualityStatus" AS ENUM (
  'COMPLETE',
  'PARTIAL',
  'DELAYED',
  'INSUFFICIENT'
);

CREATE TYPE "PredictiveFeatureBuildRunStatus" AS ENUM (
  'COMPLETED',
  'PARTIAL',
  'FAILED'
);

CREATE TABLE "org_predictive_feature_snapshots" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "feature_set_version" TEXT NOT NULL,
    "grain" "PredictiveFeatureGrain" NOT NULL,
    "observation_date" TEXT NOT NULL,
    "as_of_utc" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "scope_key" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_station_id" TEXT,
    "scope_vehicle_class_id" TEXT,
    "features" JSONB NOT NULL,
    "data_quality" "PredictiveFeatureDataQualityStatus" NOT NULL,
    "data_quality_meta" JSONB NOT NULL DEFAULT '{}',
    "lineage" JSONB NOT NULL DEFAULT '{}',
    "build_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "org_predictive_feature_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "org_predictive_feature_build_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "feature_set_version" TEXT NOT NULL,
    "from_date" TEXT NOT NULL,
    "to_date" TEXT NOT NULL,
    "status" "PredictiveFeatureBuildRunStatus" NOT NULL,
    "snapshots_written" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "org_predictive_feature_build_runs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_predictive_feature_snapshots_org_version_grain_date_scope_key"
  ON "org_predictive_feature_snapshots"("organization_id", "feature_set_version", "grain", "observation_date", "scope_key");

CREATE INDEX "org_predictive_feature_snapshots_organization_id_observation_date_idx"
  ON "org_predictive_feature_snapshots"("organization_id", "observation_date");

CREATE INDEX "org_predictive_feature_snapshots_organization_id_feature_set_version_observation_date_idx"
  ON "org_predictive_feature_snapshots"("organization_id", "feature_set_version", "observation_date");

CREATE INDEX "org_predictive_feature_build_runs_organization_id_started_at_idx"
  ON "org_predictive_feature_build_runs"("organization_id", "started_at");

ALTER TABLE "org_predictive_feature_snapshots"
  ADD CONSTRAINT "org_predictive_feature_snapshots_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "org_predictive_feature_snapshots"
  ADD CONSTRAINT "org_predictive_feature_snapshots_build_run_id_fkey"
  FOREIGN KEY ("build_run_id") REFERENCES "org_predictive_feature_build_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "org_predictive_feature_build_runs"
  ADD CONSTRAINT "org_predictive_feature_build_runs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

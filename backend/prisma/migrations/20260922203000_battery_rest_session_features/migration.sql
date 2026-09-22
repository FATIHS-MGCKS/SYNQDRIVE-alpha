-- M3.3C C1 — append-only shadow rest-session feature foundation (additive, runtime OFF)

CREATE TYPE "BatteryRestSessionFeatureComputationPhase" AS ENUM ('INCREMENTAL', 'FINAL');

CREATE TYPE "BatteryRestSessionFeatureSessionTrust" AS ENUM ('VALID', 'INVALIDATED');

CREATE TYPE "BatteryRestSessionChargeOpportunityClass" AS ENUM (
  'SUFFICIENT',
  'PARTIAL',
  'INSUFFICIENT',
  'UNKNOWN'
);

CREATE TABLE "battery_rest_session_features" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "rest_session_id" TEXT NOT NULL,
  "feature_model_version" TEXT NOT NULL,
  "retention_policy_version" TEXT NOT NULL,
  "charge_opportunity_policy_version" TEXT NOT NULL,
  "semantic_revision" INTEGER NOT NULL,
  "input_digest" TEXT NOT NULL,
  "input_summary" JSONB NOT NULL,
  "computation_phase" "BatteryRestSessionFeatureComputationPhase" NOT NULL,
  "session_trust" "BatteryRestSessionFeatureSessionTrust" NOT NULL,
  "charge_opportunity_class" "BatteryRestSessionChargeOpportunityClass" NOT NULL DEFAULT 'UNKNOWN',
  "charge_opportunity_raw" JSONB,
  "shutdown_to_first_rest_delta_mv" INTEGER,
  "robust_rest_slope_mv_per_hour" DOUBLE PRECISION,
  "minimum_rest_voltage_mv" INTEGER,
  "maximum_rest_voltage_mv" INTEGER,
  "median_rest_voltage_mv" INTEGER,
  "rest_voltage_variance_mv2" DOUBLE PRECISION,
  "number_of_valid_rest_points" INTEGER NOT NULL DEFAULT 0,
  "max_actual_rest_age_ms" INTEGER,
  "max_inter_observation_gap_ms" INTEGER,
  "observation_span_ms" INTEGER,
  "missing_rung_count" INTEGER,
  "pairwise_rest_deltas" JSONB,
  "computed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "battery_rest_session_features_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "battery_rest_session_feature_input_digest"
  ON "battery_rest_session_features"("organization_id", "rest_session_id", "feature_model_version", "input_digest");

CREATE UNIQUE INDEX "battery_rest_session_feature_semantic_revision"
  ON "battery_rest_session_features"(
    "organization_id",
    "rest_session_id",
    "feature_model_version",
    "retention_policy_version",
    "charge_opportunity_policy_version",
    "semantic_revision"
  );

CREATE INDEX "battery_rest_session_features_vehicle_id_computed_at_idx"
  ON "battery_rest_session_features"("vehicle_id", "computed_at" DESC);

CREATE INDEX "battery_rest_session_feature_rest_session_model_revision_idx"
  ON "battery_rest_session_features"("rest_session_id", "feature_model_version", "semantic_revision" DESC);

CREATE INDEX "battery_rest_session_features_organization_id_computed_at_idx"
  ON "battery_rest_session_features"("organization_id", "computed_at" DESC);

ALTER TABLE "battery_rest_session_features"
  ADD CONSTRAINT "battery_rest_session_features_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_rest_session_features"
  ADD CONSTRAINT "battery_rest_session_features_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_rest_session_features"
  ADD CONSTRAINT "battery_rest_session_features_rest_session_id_fkey"
  FOREIGN KEY ("rest_session_id") REFERENCES "battery_rest_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

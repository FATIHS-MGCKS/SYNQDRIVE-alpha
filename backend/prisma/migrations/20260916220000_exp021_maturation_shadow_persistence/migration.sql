-- EXP-021 Live Maturation Shadow PR-M1 — schema/types/persistence foundation only

CREATE TYPE "Exp021MaturationShadowSignalLane" AS ENUM (
  'HF_FAST_LOOP',
  'SETTLEMENT_SHADOW'
);

CREATE TYPE "Exp021MaturationShadowWindowLifecycle" AS ENUM (
  'ENROLLED',
  'SCHEDULED',
  'PROBING',
  'TERMINAL'
);

CREATE TYPE "Exp021MaturationShadowWindowTerminalState" AS ENUM (
  'COMPLETE',
  'PERSISTENT_EMPTY',
  'ERROR_EXHAUSTED',
  'INVALID',
  'STRUCTURAL_EXCLUDED',
  'MIXED_RUNTIME_SEMANTICS'
);

CREATE TYPE "Exp021MaturationShadowScientificClassification" AS ENUM (
  'EVENTUAL_NONZERO',
  'PERSISTENT_EMPTY_THROUGH_SHADOW_HORIZON',
  'PROVIDER_ERROR_CONTAMINATED',
  'STRUCTURAL_EXCLUDED',
  'INVALID_IDENTITY',
  'MIXED_RUNTIME_SEMANTICS',
  'OTHER_FAIL_CLOSED'
);

CREATE TYPE "Exp021MaturationShadowProviderOutcomeClass" AS ENUM (
  'PROVIDER_SUCCESS_ZERO',
  'PROVIDER_SUCCESS_NONZERO',
  'PROVIDER_ERROR'
);

CREATE TABLE "exp021_maturation_shadow_window_families" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "token_id" INTEGER NOT NULL,
  "canonical_window_to" TIMESTAMP(3) NOT NULL,
  "shadow_schedule_version" TEXT NOT NULL,
  "enrollment_event_id" TEXT NOT NULL,
  "planned_ages_ms_exact" INTEGER[] NOT NULL,
  "policy_delay_probe_ms" INTEGER NOT NULL,
  "created_under_runtime_sha" TEXT NOT NULL,
  "lifecycle_state" "Exp021MaturationShadowWindowLifecycle" NOT NULL DEFAULT 'ENROLLED',
  "terminal_state" "Exp021MaturationShadowWindowTerminalState",
  "scientific_classification" "Exp021MaturationShadowScientificClassification",
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "exp021_maturation_shadow_window_families_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_maturation_shadow_window_families_organization_id_veh_key"
  ON "exp021_maturation_shadow_window_families"(
    "organization_id",
    "vehicle_id",
    "token_id",
    "canonical_window_to",
    "shadow_schedule_version"
  );

CREATE INDEX "exp021_maturation_shadow_window_families_organization_id_veh_idx"
  ON "exp021_maturation_shadow_window_families"("organization_id", "vehicle_id");

CREATE TABLE "exp021_maturation_shadow_windows" (
  "id" TEXT NOT NULL,
  "window_family_id" TEXT NOT NULL,
  "signal_lane" "Exp021MaturationShadowSignalLane" NOT NULL,
  "query_geometry_ms" INTEGER NOT NULL,
  "window_from" TIMESTAMP(3) NOT NULL,
  "window_to" TIMESTAMP(3) NOT NULL,
  "resolved_provider_fields" TEXT[] NOT NULL,
  "resolved_provider_fields_canonical_sorted" TEXT[] NOT NULL,
  "signal_set_hash" TEXT NOT NULL,
  "signal_set_version" TEXT NOT NULL,
  "query_semantics_hash" TEXT NOT NULL,
  "query_builder_semantic_version_or_hash" TEXT NOT NULL,
  "query_boundary_semantic_version" TEXT NOT NULL,
  "interval" TEXT NOT NULL,
  "aggregation" TEXT NOT NULL,
  "manifest_identifier" TEXT,
  "manifest_hash" TEXT,
  "runtime_build_sha_at_enrollment" TEXT NOT NULL,
  "activity_classification_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "exp021_maturation_shadow_windows_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_maturation_shadow_windows_window_family_id_signal_lane_key"
  ON "exp021_maturation_shadow_windows"("window_family_id", "signal_lane", "query_geometry_ms");

CREATE INDEX "exp021_maturation_shadow_windows_window_family_id_idx"
  ON "exp021_maturation_shadow_windows"("window_family_id");

CREATE TABLE "exp021_maturation_shadow_observation_slots" (
  "id" TEXT NOT NULL,
  "window_stratum_id" TEXT NOT NULL,
  "planned_age_ms" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "exp021_maturation_shadow_observation_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_maturation_shadow_observation_slots_window_stratum_id_key"
  ON "exp021_maturation_shadow_observation_slots"("window_stratum_id", "planned_age_ms");

CREATE INDEX "exp021_maturation_shadow_observation_slots_window_stratum_id_idx"
  ON "exp021_maturation_shadow_observation_slots"("window_stratum_id");

CREATE TABLE "exp021_maturation_shadow_observation_attempts" (
  "id" TEXT NOT NULL,
  "observation_slot_id" TEXT NOT NULL,
  "attempt_ordinal" INTEGER NOT NULL,
  "planned_age_ms" INTEGER NOT NULL,
  "actual_age_ms" INTEGER NOT NULL,
  "scheduler_drift_ms" INTEGER NOT NULL,
  "request_started_at" TIMESTAMP(3) NOT NULL,
  "request_completed_at" TIMESTAMP(3),
  "runtime_build_sha" TEXT NOT NULL,
  "query_semantics_hash" TEXT NOT NULL,
  "signal_set_hash" TEXT NOT NULL,
  "provider_request_succeeded" BOOLEAN NOT NULL,
  "provider_outcome_class" "Exp021MaturationShadowProviderOutcomeClass" NOT NULL,
  "provider_status" TEXT,
  "provider_error_class" TEXT,
  "unique_bucket_locus_count" INTEGER,
  "unique_temporal_bucket_start_count" INTEGER,
  "per_field_row_count_json" JSONB,
  "per_field_bucket_locus_count_json" JSONB,
  "first_provider_timestamp" TIMESTAMP(3),
  "last_provider_timestamp" TIMESTAMP(3),
  "bucket_locus_manifest_json" JSONB,
  "bucket_locus_identity_version" TEXT,
  "duplicate_count" INTEGER,
  "payload_revision_count" INTEGER,
  "changed_payload_locus_count" INTEGER,
  "nearest_prior_age_bucket_delta_ms" INTEGER,
  "new_bucket_loci_vs_prior_age" INTEGER,
  "missing_prior_bucket_loci_at_this_age" INTEGER,
  "cumulative_bucket_locus_union_count" INTEGER,
  "bucket_locus_coverage_ratio_vs_final_observed_union" DOUBLE PRECISION,
  "query_provenance_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "exp021_maturation_shadow_observation_attempts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exp021_maturation_shadow_observation_attempts_observation_s_key"
  ON "exp021_maturation_shadow_observation_attempts"("observation_slot_id", "attempt_ordinal");

CREATE INDEX "exp021_maturation_shadow_observation_attempts_observation_s_idx"
  ON "exp021_maturation_shadow_observation_attempts"("observation_slot_id");

ALTER TABLE "exp021_maturation_shadow_window_families"
  ADD CONSTRAINT "exp021_maturation_shadow_window_families_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exp021_maturation_shadow_window_families"
  ADD CONSTRAINT "exp021_maturation_shadow_window_families_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exp021_maturation_shadow_windows"
  ADD CONSTRAINT "exp021_maturation_shadow_windows_window_family_id_fkey"
  FOREIGN KEY ("window_family_id") REFERENCES "exp021_maturation_shadow_window_families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exp021_maturation_shadow_observation_slots"
  ADD CONSTRAINT "exp021_maturation_shadow_observation_slots_window_stratum_id_fkey"
  FOREIGN KEY ("window_stratum_id") REFERENCES "exp021_maturation_shadow_windows"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "exp021_maturation_shadow_observation_attempts"
  ADD CONSTRAINT "exp021_maturation_shadow_observation_attempts_observation_slot_fkey"
  FOREIGN KEY ("observation_slot_id") REFERENCES "exp021_maturation_shadow_observation_slots"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

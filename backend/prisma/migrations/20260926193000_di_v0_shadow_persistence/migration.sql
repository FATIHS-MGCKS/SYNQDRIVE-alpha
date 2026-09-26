-- EXP-021 C1D.6 — DI V0 shadow persistence (isolated; non-authoritative)

CREATE TABLE "di_v0_shadow_runs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "source_family" TEXT NOT NULL,
    "structural_version" TEXT NOT NULL,
    "estimator_version" TEXT NOT NULL,
    "calibration_version" TEXT NOT NULL,
    "source_family_policy_version" TEXT NOT NULL,
    "input_evidence_version" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "failed_at" TIMESTAMP(3),
    "interval_count" INTEGER NOT NULL DEFAULT 0,
    "numeric_speed_count" INTEGER NOT NULL DEFAULT 0,
    "abstention_count" INTEGER NOT NULL DEFAULT 0,
    "conflict_count" INTEGER NOT NULL DEFAULT 0,
    "failure_code" TEXT,
    "failure_detail_safe" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "di_v0_shadow_runs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "di_v0_shadow_intervals" (
    "id" TEXT NOT NULL,
    "shadow_run_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "interval_start" TIMESTAMP(3) NOT NULL,
    "interval_end" TIMESTAMP(3) NOT NULL,
    "reference_time" TIMESTAMP(3) NOT NULL,
    "motion_state" TEXT NOT NULL,
    "position_state" TEXT NOT NULL,
    "causal_position_state" TEXT NOT NULL,
    "estimated_speed_kmh" DOUBLE PRECISION,
    "speed_range_min_kmh" DOUBLE PRECISION,
    "speed_range_max_kmh" DOUBLE PRECISION,
    "speed_evidence_state" TEXT,
    "temporal_confidence" TEXT NOT NULL,
    "value_confidence" TEXT NOT NULL,
    "source_relation" TEXT NOT NULL,
    "claim_level" TEXT NOT NULL,
    "abstention_reason" TEXT,
    "evidence_sources" JSONB NOT NULL DEFAULT '[]',
    "source_quality_flags" JSONB NOT NULL DEFAULT '[]',
    "support_interval_start" TIMESTAMP(3),
    "support_interval_end" TIMESTAMP(3),
    "derivation_method" TEXT NOT NULL,
    "derivation_version" TEXT NOT NULL,
    "structural_version" TEXT NOT NULL,
    "estimator_version" TEXT NOT NULL,
    "calibration_version" TEXT NOT NULL,
    "source_family_policy_version" TEXT NOT NULL,
    "provenance" JSONB NOT NULL,
    "legacy_comparison" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "di_v0_shadow_intervals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "di_v0_shadow_runs_organization_id_idempotency_key_key" ON "di_v0_shadow_runs"("organization_id", "idempotency_key");

CREATE INDEX "di_v0_shadow_runs_trip_id_idx" ON "di_v0_shadow_runs"("trip_id");

CREATE INDEX "di_v0_shadow_runs_vehicle_id_created_at_idx" ON "di_v0_shadow_runs"("vehicle_id", "created_at");

CREATE INDEX "di_v0_shadow_runs_organization_id_created_at_idx" ON "di_v0_shadow_runs"("organization_id", "created_at");

CREATE INDEX "di_v0_shadow_runs_status_created_at_idx" ON "di_v0_shadow_runs"("status", "created_at");

CREATE INDEX "di_v0_shadow_runs_trip_id_structural_version_estimator_version_idx" ON "di_v0_shadow_runs"("trip_id", "structural_version", "estimator_version", "calibration_version", "source_family_policy_version", "input_evidence_version");

CREATE UNIQUE INDEX "di_v0_shadow_intervals_shadow_run_id_interval_start_key" ON "di_v0_shadow_intervals"("shadow_run_id", "interval_start");

CREATE INDEX "di_v0_shadow_intervals_shadow_run_id_interval_start_idx" ON "di_v0_shadow_intervals"("shadow_run_id", "interval_start");

CREATE INDEX "di_v0_shadow_intervals_trip_id_idx" ON "di_v0_shadow_intervals"("trip_id");

CREATE INDEX "di_v0_shadow_intervals_vehicle_id_created_at_idx" ON "di_v0_shadow_intervals"("vehicle_id", "created_at");

CREATE INDEX "di_v0_shadow_intervals_organization_id_created_at_idx" ON "di_v0_shadow_intervals"("organization_id", "created_at");

ALTER TABLE "di_v0_shadow_runs" ADD CONSTRAINT "di_v0_shadow_runs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "di_v0_shadow_runs" ADD CONSTRAINT "di_v0_shadow_runs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "di_v0_shadow_runs" ADD CONSTRAINT "di_v0_shadow_runs_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "di_v0_shadow_intervals" ADD CONSTRAINT "di_v0_shadow_intervals_shadow_run_id_fkey" FOREIGN KEY ("shadow_run_id") REFERENCES "di_v0_shadow_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "di_v0_shadow_intervals" ADD CONSTRAINT "di_v0_shadow_intervals_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "di_v0_shadow_intervals" ADD CONSTRAINT "di_v0_shadow_intervals_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "di_v0_shadow_intervals" ADD CONSTRAINT "di_v0_shadow_intervals_trip_id_fkey" FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

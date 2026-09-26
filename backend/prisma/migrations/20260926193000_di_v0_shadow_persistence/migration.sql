-- EXP-021 C1D.6 — DI V0 shadow persistence (isolated; non-authoritative)
-- CHECK constraints are authoritative at DB layer; Prisma schema uses String fields.

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

    CONSTRAINT "di_v0_shadow_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "di_v0_shadow_runs_status_check" CHECK ("status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
    CONSTRAINT "di_v0_shadow_runs_source_family_check" CHECK ("source_family" IN ('RUPTELA_R1', 'API_SYNTHETIC', 'UNKNOWN'))
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

    CONSTRAINT "di_v0_shadow_intervals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "di_v0_shadow_intervals_interval_time_check" CHECK ("interval_start" < "interval_end"),
    CONSTRAINT "di_v0_shadow_intervals_support_time_check" CHECK (
      ("support_interval_start" IS NULL AND "support_interval_end" IS NULL)
      OR ("support_interval_start" < "support_interval_end")
    ),
    CONSTRAINT "di_v0_shadow_intervals_motion_state_check" CHECK ("motion_state" IN (
      'STATIONARY_SUPPORTED', 'MOVING_SPEED_ESTIMATED', 'MOVING_SPEED_UNKNOWN', 'TRANSITION_UNCERTAIN', 'NO_MOTION_EVIDENCE'
    )),
    CONSTRAINT "di_v0_shadow_intervals_position_state_check" CHECK ("position_state" IN (
      'FRESH', 'FROZEN_UNRESOLVED', 'FROZEN_MOVEMENT_SUPPORTED', 'FROZEN_STOP_SUPPORTED', 'RELEASE', 'ROW_ABSENT', 'SIGNAL_NULL'
    )),
    CONSTRAINT "di_v0_shadow_intervals_causal_position_state_check" CHECK ("causal_position_state" IN (
      'FRESH', 'FROZEN_UNRESOLVED', 'FROZEN_MOVEMENT_SUPPORTED', 'FROZEN_STOP_SUPPORTED', 'RELEASE', 'ROW_ABSENT', 'SIGNAL_NULL'
    )),
    CONSTRAINT "di_v0_shadow_intervals_temporal_confidence_check" CHECK ("temporal_confidence" IN (
      'EXACT_PROVEN', 'BUCKET_BOUNDED', 'INTERVAL_ONLY', 'UNKNOWN'
    )),
    CONSTRAINT "di_v0_shadow_intervals_value_confidence_check" CHECK ("value_confidence" IN (
      'HIGH', 'MODERATE', 'LOW', 'UNAVAILABLE'
    )),
    CONSTRAINT "di_v0_shadow_intervals_source_relation_check" CHECK ("source_relation" IN (
      'SUPPORTED', 'CONFLICTING', 'CONFLICT_EXPLAINED', 'UNASSESSABLE'
    )),
    CONSTRAINT "di_v0_shadow_intervals_claim_level_check" CHECK ("claim_level" IN ('L0', 'L1', 'L2', 'L3')),
    CONSTRAINT "di_v0_shadow_intervals_abstention_reason_check" CHECK ("abstention_reason" IS NULL OR "abstention_reason" IN (
      'ROW_ABSENT', 'POSITION_FROZEN', 'POSITION_RELEASE', 'INCOMPLETE_SUPPORT', 'INVALID_POSITION',
      'GEOMETRY_DISCONTINUITY', 'TEMPORAL_SEMANTICS_INSUFFICIENT', 'NO_KINEMATIC_EVIDENCE', 'CALIBRATION_REQUIRED',
      'UNSUPPORTED_SOURCE_FAMILY', 'ROW_GAP_IN_SUPPORT', 'SIGNAL_NULL_IN_SUPPORT'
    )),
    CONSTRAINT "di_v0_shadow_intervals_speed_evidence_state_check" CHECK ("speed_evidence_state" IS NULL OR "speed_evidence_state" IN (
      'NUMERIC_HIGH', 'NUMERIC_MODERATE', 'MOVEMENT_ONLY', 'STATIONARY_BAND', 'ABSTAINED', 'NONE'
    )),
    CONSTRAINT "di_v0_shadow_intervals_derivation_method_check" CHECK ("derivation_method" IN (
      'L3_CENTERED_PATH', 'HOLD_INTERVAL_LB', 'NONE'
    )),
    CONSTRAINT "di_v0_shadow_intervals_estimated_speed_kmh_check" CHECK (
      "estimated_speed_kmh" IS NULL OR ("estimated_speed_kmh" >= 0 AND "estimated_speed_kmh" = "estimated_speed_kmh")
    ),
    CONSTRAINT "di_v0_shadow_intervals_speed_range_min_kmh_check" CHECK (
      "speed_range_min_kmh" IS NULL OR ("speed_range_min_kmh" >= 0 AND "speed_range_min_kmh" = "speed_range_min_kmh")
    ),
    CONSTRAINT "di_v0_shadow_intervals_speed_range_max_kmh_check" CHECK (
      "speed_range_max_kmh" IS NULL OR ("speed_range_max_kmh" >= 0 AND "speed_range_max_kmh" = "speed_range_max_kmh")
    ),
    CONSTRAINT "di_v0_shadow_intervals_speed_range_pair_check" CHECK (
      ("speed_range_min_kmh" IS NULL AND "speed_range_max_kmh" IS NULL)
      OR (
        "speed_range_min_kmh" IS NOT NULL AND "speed_range_max_kmh" IS NOT NULL
        AND "speed_range_min_kmh" <= "speed_range_max_kmh"
      )
    )
);

CREATE UNIQUE INDEX "di_v0_shadow_runs_organization_id_idempotency_key_key" ON "di_v0_shadow_runs"("organization_id", "idempotency_key");

CREATE INDEX "di_v0_shadow_runs_trip_id_idx" ON "di_v0_shadow_runs"("trip_id");

CREATE INDEX "di_v0_shadow_runs_vehicle_id_created_at_idx" ON "di_v0_shadow_runs"("vehicle_id", "created_at");

CREATE INDEX "di_v0_shadow_runs_organization_id_created_at_idx" ON "di_v0_shadow_runs"("organization_id", "created_at");

CREATE INDEX "di_v0_shadow_runs_status_created_at_idx" ON "di_v0_shadow_runs"("status", "created_at");

CREATE INDEX "di_v0_shadow_runs_trip_id_structural_version_estimator_version_idx" ON "di_v0_shadow_runs"("trip_id", "structural_version", "estimator_version", "calibration_version", "source_family_policy_version", "input_evidence_version");

CREATE UNIQUE INDEX "di_v0_shadow_intervals_shadow_run_id_interval_start_key" ON "di_v0_shadow_intervals"("shadow_run_id", "interval_start");

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

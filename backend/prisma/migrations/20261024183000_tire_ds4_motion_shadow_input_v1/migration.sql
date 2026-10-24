-- Tire Intelligence P2: DS4 → tire shadow input store (shadow only; not applied on production by agent).

CREATE TABLE "tire_ds4_motion_shadow_input_v1" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "trip_id" TEXT NOT NULL,
    "tire_setup_id" TEXT NOT NULL,
    "tire_trip_usage_ledger_id" TEXT NOT NULL,
    "di_v0_motion_core_shadow_run_id" TEXT NOT NULL,
    "work_item_id" TEXT,
    "combined_input_identity" TEXT NOT NULL,
    "pinned_snapshot_hash" TEXT NOT NULL,
    "content_fingerprint" TEXT NOT NULL,
    "shadow_bundle_version" TEXT NOT NULL,
    "speed_authority" TEXT NOT NULL,
    "events_algorithm_version" TEXT NOT NULL,
    "adapter_version" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'DS4',
    "event_quality_coverage" TEXT NOT NULL,
    "temporal_coverage" TEXT NOT NULL,
    "ds4_read_status" TEXT NOT NULL,
    "input_payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "tire_ds4_motion_shadow_input_v1_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tire_ds4_shadow_input_ledger_run_adapter_uq"
    ON "tire_ds4_motion_shadow_input_v1"("tire_trip_usage_ledger_id", "di_v0_motion_core_shadow_run_id", "adapter_version");

CREATE INDEX "tire_ds4_shadow_input_org_vehicle_idx"
    ON "tire_ds4_motion_shadow_input_v1"("organization_id", "vehicle_id");

CREATE INDEX "tire_ds4_shadow_input_trip_idx"
    ON "tire_ds4_motion_shadow_input_v1"("trip_id");

CREATE INDEX "tire_ds4_shadow_input_setup_idx"
    ON "tire_ds4_motion_shadow_input_v1"("tire_setup_id");

ALTER TABLE "tire_ds4_motion_shadow_input_v1"
    ADD CONSTRAINT "tire_ds4_motion_shadow_input_v1_tire_trip_usage_ledger_id_fkey"
    FOREIGN KEY ("tire_trip_usage_ledger_id") REFERENCES "tire_trip_usage_ledger"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

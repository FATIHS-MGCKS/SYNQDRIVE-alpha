-- HV R22-P1.1 — provider revalidation checkpoint (rate-budget anchor when duplicate batch).

CREATE TABLE "battery_hv_charging_counter_revalidation_checkpoints" (
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "segment_fingerprint" TEXT NOT NULL,
  "segment_start_at" TIMESTAMP(3) NOT NULL,
  "segment_end_at" TIMESTAMP(3),
  "provider_observed_at" TIMESTAMP(3),
  "last_provider_query_at" TIMESTAMP(3) NOT NULL,
  "last_observation_set_fingerprint" CHAR(64),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "battery_hv_cc_revalidation_checkpoint_pkey"
    PRIMARY KEY ("organization_id", "vehicle_id", "segment_fingerprint")
);

CREATE INDEX "battery_hv_cc_revalidation_checkpoint_vehicle_idx"
  ON "battery_hv_charging_counter_revalidation_checkpoints" ("organization_id", "vehicle_id");

ALTER TABLE "battery_hv_charging_counter_revalidation_checkpoints"
  ADD CONSTRAINT "battery_hv_cc_revalidation_checkpoint_org_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_hv_charging_counter_revalidation_checkpoints"
  ADD CONSTRAINT "battery_hv_cc_revalidation_checkpoint_vehicle_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

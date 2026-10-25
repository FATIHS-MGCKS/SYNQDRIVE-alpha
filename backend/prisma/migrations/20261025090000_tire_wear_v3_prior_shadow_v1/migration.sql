-- Tire Wear V3 P3A: distance-prior shadow store (default-OFF write path; not consumed by V2).

CREATE TABLE "tire_wear_v3_prior_shadow_v1" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "tire_setup_id" TEXT NOT NULL,
    "model_version" TEXT NOT NULL,
    "model_config_hash" TEXT NOT NULL,
    "input_fingerprint" TEXT NOT NULL,
    "result_payload" JSONB NOT NULL,
    "computed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_wear_v3_prior_shadow_v1_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tire_wear_v3_prior_shadow_setup_model_fp_idx"
    ON "tire_wear_v3_prior_shadow_v1"("tire_setup_id", "model_version", "input_fingerprint");

CREATE INDEX "tire_wear_v3_prior_shadow_org_vehicle_idx"
    ON "tire_wear_v3_prior_shadow_v1"("organization_id", "vehicle_id");

ALTER TABLE "tire_wear_v3_prior_shadow_v1"
    ADD CONSTRAINT "tire_wear_v3_prior_shadow_v1_tire_setup_id_fkey"
    FOREIGN KEY ("tire_setup_id") REFERENCES "vehicle_tire_setups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

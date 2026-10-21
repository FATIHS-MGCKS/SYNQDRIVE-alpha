-- ERD E5.4 — canonical vs legacy recharge shadow parity observations (additive, non-authoritative)

CREATE TABLE "erd_recharge_projection_shadow_observations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "canonical_charge_session_id" TEXT,
    "legacy_vehicle_energy_event_id" TEXT,
    "comparator_version" TEXT NOT NULL,
    "pairing_evidence" TEXT NOT NULL,
    "parity_class" TEXT NOT NULL,
    "finality" TEXT NOT NULL,
    "canonical_projection_snapshot" JSONB,
    "legacy_projection_snapshot" JSONB,
    "field_diff" JSONB,
    "comparison_fingerprint" TEXT NOT NULL,
    "evaluated_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "erd_recharge_projection_shadow_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "erd_recharge_projection_shadow_observations_comparison_fingerprint_key"
ON "erd_recharge_projection_shadow_observations"("comparison_fingerprint");

CREATE INDEX "erd_recharge_shadow_obs_scope_eval_idx"
ON "erd_recharge_projection_shadow_observations"("organization_id", "vehicle_id", "evaluated_at");

ALTER TABLE "erd_recharge_projection_shadow_observations"
ADD CONSTRAINT "erd_recharge_projection_shadow_observations_vehicle_id_fkey"
FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

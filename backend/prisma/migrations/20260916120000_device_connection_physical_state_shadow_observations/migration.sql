-- P2.5 STATEFUL_SHADOW pilot scope-bound durable observations (restart-safe, queryable).

CREATE TABLE "device_connection_physical_state_shadow_observations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DIMO',
    "classification" TEXT NOT NULL,
    "correctness_blocking" BOOLEAN NOT NULL,
    "authority_mode" TEXT NOT NULL,
    "legacy_decision" TEXT NOT NULL,
    "physical_decision" TEXT NOT NULL,
    "evidence_reference_id" TEXT,
    "binding_key" TEXT,
    "observed_at" TIMESTAMP(3) NOT NULL,
    "evidence_observed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_connection_physical_state_shadow_observations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "device_connection_physical_state_shadow_obs_scope_observed_idx"
ON "device_connection_physical_state_shadow_observations"("organization_id", "vehicle_id", "provider", "observed_at");

CREATE INDEX "device_connection_physical_state_shadow_obs_observed_at_idx"
ON "device_connection_physical_state_shadow_observations"("observed_at");

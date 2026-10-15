-- VSI-03 P2C — append-only per-poll aggregated provider source observations (additive)

CREATE TYPE "VehicleProviderSourceTimestampProvenance" AS ENUM ('PROVIDER_LAST_SEEN', 'PROVIDER_MISSING');

CREATE TYPE "VehicleProviderSourceObservationOutcome" AS ENUM ('VLS_APPLIED', 'MONOTONIC_STALE_SKIPPED');

CREATE TABLE "vehicle_provider_source_observations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_binding_id" TEXT,
    "provider_binding_scope_key" TEXT NOT NULL,
    "provider_token_reference" TEXT,
    "provider_token_scope_key" TEXT NOT NULL,
    "poll_job_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "observation_index" BIGINT NOT NULL,
    "provider_fetched_at" TIMESTAMPTZ(3) NOT NULL,
    "provider_source_timestamp" TIMESTAMPTZ(3),
    "source_timestamp_provenance" "VehicleProviderSourceTimestampProvenance" NOT NULL,
    "observation_outcome" "VehicleProviderSourceObservationOutcome" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_provider_source_observations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_provider_source_observations_idempotency_key_key"
ON "vehicle_provider_source_observations"("idempotency_key");

CREATE UNIQUE INDEX "vsi_p2c_obs_scope_index_key"
ON "vehicle_provider_source_observations"(
  "organization_id",
  "vehicle_id",
  "provider",
  "provider_binding_scope_key",
  "provider_token_scope_key",
  "observation_index"
);

CREATE INDEX "vehicle_provider_source_observations_org_vehicle_binding_fetched_idx"
ON "vehicle_provider_source_observations"("organization_id", "vehicle_id", "provider_binding_id", "provider_fetched_at" DESC);

CREATE INDEX "vehicle_provider_source_observations_vehicle_fetched_idx"
ON "vehicle_provider_source_observations"("vehicle_id", "provider_fetched_at" DESC);

ALTER TABLE "vehicle_provider_source_observations"
ADD CONSTRAINT "vehicle_provider_source_observations_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_provider_source_observations"
ADD CONSTRAINT "vehicle_provider_source_observations_vehicle_scope_fkey"
FOREIGN KEY ("organization_id", "vehicle_id") REFERENCES "vehicles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

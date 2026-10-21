-- VSI P0+P1 durable per-link signal capability profiles

CREATE TABLE "vehicle_signal_capability_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider_source_link_id" TEXT NOT NULL,
    "provider_identity" TEXT NOT NULL,
    "verified_modality" TEXT,
    "telemetry_source_family" TEXT,
    "profile_contract_version" TEXT NOT NULL,
    "profile_revision" INTEGER NOT NULL DEFAULT 1,
    "content_fingerprint" TEXT NOT NULL,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL,
    "declared_catalog_checked_at" TIMESTAMPTZ(3),
    "last_materialized_source_timestamp" TIMESTAMPTZ(3),
    "last_materialized_provider_fetch_at" TIMESTAMPTZ(3),
    "last_proven_strict_source_advance_at" TIMESTAMPTZ(3),
    "signals_snapshot" JSONB NOT NULL,
    "profile_limitations" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vehicle_signal_capability_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_signal_capability_profiles_scope_key"
ON "vehicle_signal_capability_profiles"("organization_id", "vehicle_id", "provider_source_link_id");

CREATE INDEX "vehicle_signal_capability_profiles_org_vehicle_idx"
ON "vehicle_signal_capability_profiles"("organization_id", "vehicle_id");

CREATE INDEX "vehicle_signal_capability_profiles_vehicle_evaluated_idx"
ON "vehicle_signal_capability_profiles"("vehicle_id", "evaluated_at" DESC);

ALTER TABLE "vehicle_signal_capability_profiles"
ADD CONSTRAINT "vehicle_signal_capability_profiles_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_signal_capability_profiles"
ADD CONSTRAINT "vehicle_signal_capability_profiles_vehicle_scope_fkey"
FOREIGN KEY ("organization_id", "vehicle_id") REFERENCES "vehicles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

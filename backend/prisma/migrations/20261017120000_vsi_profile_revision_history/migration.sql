-- VSI P5-H1 — immutable per-revision profile history (append-only; no backfill in this migration).

CREATE TABLE "vehicle_signal_capability_profile_revisions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider_source_link_id" TEXT NOT NULL,
    "profile_revision" INTEGER NOT NULL,
    "profile_contract_version" TEXT NOT NULL,
    "content_fingerprint" TEXT NOT NULL,
    "provider_identity" TEXT NOT NULL,
    "verified_modality" TEXT,
    "telemetry_source_family" TEXT,
    "evaluated_at" TIMESTAMPTZ(3) NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "declared_catalog_checked_at" TIMESTAMPTZ(3),
    "last_materialized_source_timestamp" TIMESTAMPTZ(3),
    "last_materialized_provider_fetch_at" TIMESTAMPTZ(3),
    "last_proven_strict_source_advance_at" TIMESTAMPTZ(3),
    "signals_snapshot" JSONB NOT NULL,
    "profile_limitations" JSONB NOT NULL DEFAULT '[]',
    "materialization_trigger" TEXT NOT NULL,
    "source_link_lifecycle_context" JSONB NOT NULL DEFAULT '{}',
    "source_provenance" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_signal_capability_profile_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_signal_capability_profile_revisions_scope_revision_key"
ON "vehicle_signal_capability_profile_revisions"("organization_id", "vehicle_id", "provider_source_link_id", "profile_revision");

CREATE INDEX "vehicle_signal_capability_profile_revisions_scope_recorded_idx"
ON "vehicle_signal_capability_profile_revisions"("organization_id", "vehicle_id", "provider_source_link_id", "recorded_at" DESC);

CREATE INDEX "vehicle_signal_capability_profile_revisions_scope_evaluated_idx"
ON "vehicle_signal_capability_profile_revisions"("organization_id", "vehicle_id", "provider_source_link_id", "evaluated_at" DESC);

ALTER TABLE "vehicle_signal_capability_profile_revisions"
ADD CONSTRAINT "vehicle_signal_capability_profile_revisions_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_signal_capability_profile_revisions"
ADD CONSTRAINT "vehicle_signal_capability_profile_revisions_vehicle_scope_fkey"
FOREIGN KEY ("organization_id", "vehicle_id") REFERENCES "vehicles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

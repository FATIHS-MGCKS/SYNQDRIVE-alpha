-- VSI P3A per-link provider catalog axes (additive)

CREATE TYPE "VsiProviderCatalogAxisDeclaredStatus" AS ENUM ('LISTED', 'NOT_LISTED', 'UNKNOWN');

CREATE TYPE "VsiProviderCatalogSnapshotCompleteness" AS ENUM (
  'COMPLETE_PROVIDER_CATALOG',
  'INCOMPLETE_PROVIDER_RESPONSE',
  'PROVIDER_ERROR'
);

CREATE TYPE "VsiProviderCatalogAxisProvenance" AS ENUM ('DIMO_AVAILABLE_SIGNALS_PREFLIGHT');

CREATE TABLE "vsi_provider_catalog_axes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider_source_link_id" TEXT NOT NULL,
    "provider_identity" TEXT NOT NULL,
    "provider_native_signal_name" TEXT NOT NULL,
    "canonical_signal_key" TEXT,
    "declared_catalog_status" "VsiProviderCatalogAxisDeclaredStatus" NOT NULL,
    "catalog_snapshot_completeness" "VsiProviderCatalogSnapshotCompleteness" NOT NULL,
    "provenance" "VsiProviderCatalogAxisProvenance" NOT NULL,
    "contract_version" TEXT NOT NULL,
    "checked_at" TIMESTAMPTZ(3) NOT NULL,
    "verified_modality" TEXT,
    "telemetry_source_family" TEXT,
    "connection_identity_contract_version" TEXT,
    "metadata_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vsi_provider_catalog_axes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vsi_provider_catalog_axes_scope_native_key"
ON "vsi_provider_catalog_axes"("organization_id", "vehicle_id", "provider_source_link_id", "provider_native_signal_name");

CREATE INDEX "vsi_provider_catalog_axes_scope_checked_idx"
ON "vsi_provider_catalog_axes"("organization_id", "vehicle_id", "provider_source_link_id", "checked_at" DESC);

ALTER TABLE "vsi_provider_catalog_axes"
ADD CONSTRAINT "vsi_provider_catalog_axes_organization_id_fkey"
FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vsi_provider_catalog_axes"
ADD CONSTRAINT "vsi_provider_catalog_axes_vehicle_fkey"
FOREIGN KEY ("organization_id", "vehicle_id") REFERENCES "vehicles"("organization_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

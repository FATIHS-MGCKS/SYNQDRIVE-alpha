-- VSI P2 — durable profile lifecycle reconciliation outbox (async, non-blocking onboarding).

CREATE TYPE "VsiProfileLifecycleOutboxEventType" AS ENUM (
  'SOURCE_LINK_ACTIVATED',
  'SOURCE_LINK_DEACTIVATED',
  'SOURCE_LINK_SUPERSEDED',
  'DECLARED_CATALOG_ADVANCED',
  'ACTIVE_VEHICLE_BACKFILL_RECONCILE'
);

CREATE TYPE "VsiProfileLifecycleOutboxStatus" AS ENUM (
  'PENDING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "vsi_profile_lifecycle_outbox" (
  "id" UUID NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "provider_source_link_id" TEXT,
  "event_type" "VsiProfileLifecycleOutboxEventType" NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "payload_version" INTEGER NOT NULL DEFAULT 1,
  "payload" JSONB NOT NULL,
  "occurred_at" TIMESTAMPTZ(3) NOT NULL,
  "status" "VsiProfileLifecycleOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_error" TEXT,
  "processed_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "vsi_profile_lifecycle_outbox_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vsi_profile_lifecycle_outbox_idempotency_key_key"
  ON "vsi_profile_lifecycle_outbox"("idempotency_key");

CREATE INDEX "vsi_profile_lifecycle_outbox_status_available_at_idx"
  ON "vsi_profile_lifecycle_outbox"("status", "available_at");

CREATE INDEX "vsi_profile_lifecycle_outbox_org_vehicle_occurred_idx"
  ON "vsi_profile_lifecycle_outbox"("organization_id", "vehicle_id", "occurred_at");

CREATE INDEX "vsi_profile_lifecycle_outbox_link_idx"
  ON "vsi_profile_lifecycle_outbox"("provider_source_link_id");

ALTER TABLE "vsi_profile_lifecycle_outbox"
  ADD CONSTRAINT "vsi_profile_lifecycle_outbox_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vsi_profile_lifecycle_outbox"
  ADD CONSTRAINT "vsi_profile_lifecycle_outbox_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

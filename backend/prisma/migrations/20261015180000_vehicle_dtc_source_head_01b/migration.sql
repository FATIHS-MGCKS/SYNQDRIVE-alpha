-- DTC-01B: isolated DTC source-head authority + durable side-effect outbox

CREATE TABLE IF NOT EXISTS "vehicle_dtc_source_heads" (
  "vehicle_id" UUID PRIMARY KEY,
  "organization_id" UUID,
  "provider" TEXT NOT NULL DEFAULT 'DIMO',
  "provider_binding_id" TEXT NOT NULL,
  "binding_epoch" INTEGER NOT NULL DEFAULT 1,
  "dimo_token_id" INTEGER,
  "last_accepted_source_at" TIMESTAMPTZ,
  "last_accepted_codes_hash" TEXT,
  "last_confirmed_complete_source_at" TIMESTAMPTZ,
  "last_confirmed_complete_fetch_at" TIMESTAMPTZ,
  "confirmed_obd_codes" JSONB,
  "last_poll_fetch_at" TIMESTAMPTZ,
  "last_poll_status" TEXT,
  "last_poll_error" TEXT,
  "last_decision_outcome" TEXT,
  "last_audit_ref" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT "vehicle_dtc_source_heads_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "vehicle_dtc_source_heads_org_idx"
  ON "vehicle_dtc_source_heads" ("organization_id");

CREATE TABLE IF NOT EXISTS "vehicle_dtc_snapshot_outbox" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "vehicle_id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "processed_at" TIMESTAMPTZ,
  "last_error" TEXT,
  CONSTRAINT "vehicle_dtc_snapshot_outbox_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_dtc_snapshot_outbox_idempotency_key_uidx"
  ON "vehicle_dtc_snapshot_outbox" ("idempotency_key");

CREATE INDEX IF NOT EXISTS "vehicle_dtc_snapshot_outbox_unprocessed_idx"
  ON "vehicle_dtc_snapshot_outbox" ("processed_at")
  WHERE "processed_at" IS NULL;

-- Idempotent brake recalculation: input fingerprint + audit trail.

ALTER TABLE "brake_health_current"
  ADD COLUMN IF NOT EXISTS "recalculation_input_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "recalculation_config_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "recalculation_model_version" TEXT;

CREATE TABLE IF NOT EXISTS "brake_recalculation_audit" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT,
  "vehicle_id" TEXT NOT NULL,
  "trigger" TEXT NOT NULL,
  "forced" BOOLEAN NOT NULL DEFAULT false,
  "force_reason" TEXT,
  "actor_id" TEXT,
  "input_fingerprint" TEXT,
  "result" TEXT NOT NULL,
  "skip_reason" TEXT,
  "duration_ms" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "brake_recalculation_audit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "brake_recalculation_audit_vehicle_id_created_at_idx"
  ON "brake_recalculation_audit"("vehicle_id", "created_at");

CREATE INDEX IF NOT EXISTS "brake_recalculation_audit_organization_id_created_at_idx"
  ON "brake_recalculation_audit"("organization_id", "created_at");

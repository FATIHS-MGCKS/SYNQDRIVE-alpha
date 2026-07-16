-- Battery capability lifecycle (Prompt 29/78): DEGRADED/UNAVAILABLE, version tracking, audit.

ALTER TYPE "BatteryCapabilityStatus" ADD VALUE IF NOT EXISTS 'DEGRADED';
ALTER TYPE "BatteryCapabilityStatus" ADD VALUE IF NOT EXISTS 'UNAVAILABLE';

ALTER TABLE "vehicle_battery_capabilities"
  ADD COLUMN IF NOT EXISTS "capability_version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "consecutive_loss_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "degraded_at" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "vehicle_battery_capability_changes" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "capability_id" TEXT,
  "signal_key" TEXT NOT NULL,
  "capability_version" INTEGER NOT NULL,
  "previous_status" "BatteryCapabilityStatus",
  "new_status" "BatteryCapabilityStatus" NOT NULL,
  "refresh_trigger" TEXT,
  "correlation_id" TEXT,
  "metadata" JSONB,
  "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "vehicle_battery_capability_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicle_battery_capability_changes_organization_id_idx"
  ON "vehicle_battery_capability_changes"("organization_id");

CREATE INDEX IF NOT EXISTS "vehicle_battery_capability_changes_vehicle_id_signal_key_changed_at_idx"
  ON "vehicle_battery_capability_changes"("vehicle_id", "signal_key", "changed_at" DESC);

CREATE INDEX IF NOT EXISTS "vehicle_battery_capability_changes_capability_id_idx"
  ON "vehicle_battery_capability_changes"("capability_id");

ALTER TABLE "vehicle_battery_capability_changes"
  ADD CONSTRAINT "vehicle_battery_capability_changes_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_battery_capability_changes"
  ADD CONSTRAINT "vehicle_battery_capability_changes_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_battery_capability_changes"
  ADD CONSTRAINT "vehicle_battery_capability_changes_capability_id_fkey"
  FOREIGN KEY ("capability_id") REFERENCES "vehicle_battery_capabilities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

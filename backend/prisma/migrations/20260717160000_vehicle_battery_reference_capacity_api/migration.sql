-- Prompt 56/78: VehicleBatteryReferenceCapacity API sources + audit trail

ALTER TYPE "BatteryReferenceCapacitySource" ADD VALUE IF NOT EXISTS 'MANUFACTURER_VERIFIED';
ALTER TYPE "BatteryReferenceCapacitySource" ADD VALUE IF NOT EXISTS 'VIN_DECODED_VERIFIED';
ALTER TYPE "BatteryReferenceCapacitySource" ADD VALUE IF NOT EXISTS 'BMS_REPORT';
ALTER TYPE "BatteryReferenceCapacitySource" ADD VALUE IF NOT EXISTS 'WORKSHOP_DOCUMENT';
ALTER TYPE "BatteryReferenceCapacitySource" ADD VALUE IF NOT EXISTS 'VERIFIED_VEHICLE_SPEC';
ALTER TYPE "BatteryReferenceCapacitySource" ADD VALUE IF NOT EXISTS 'MANUAL_VERIFIED';

ALTER TYPE "BatteryReferenceCapacityType" ADD VALUE IF NOT EXISTS 'GROSS';
ALTER TYPE "BatteryReferenceCapacityType" ADD VALUE IF NOT EXISTS 'NET';
ALTER TYPE "BatteryReferenceCapacityType" ADD VALUE IF NOT EXISTS 'USABLE';

CREATE TABLE IF NOT EXISTS "vehicle_battery_reference_capacity_changes" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "reference_capacity_id" TEXT,
    "action" TEXT NOT NULL,
    "previous_status" "ReferenceCapacityVerificationStatus",
    "new_status" "ReferenceCapacityVerificationStatus",
    "actor_user_id" TEXT,
    "metadata" JSONB,
    "changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_battery_reference_capacity_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "vehicle_battery_reference_capacity_changes_organization_id_idx"
    ON "vehicle_battery_reference_capacity_changes"("organization_id");
CREATE INDEX IF NOT EXISTS "vehicle_battery_reference_capacity_changes_vehicle_id_changed_at_idx"
    ON "vehicle_battery_reference_capacity_changes"("vehicle_id", "changed_at" DESC);
CREATE INDEX IF NOT EXISTS "vehicle_battery_reference_capacity_changes_reference_capacity_id_idx"
    ON "vehicle_battery_reference_capacity_changes"("reference_capacity_id");

ALTER TABLE "vehicle_battery_reference_capacity_changes"
    ADD CONSTRAINT "vehicle_battery_reference_capacity_changes_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_battery_reference_capacity_changes"
    ADD CONSTRAINT "vehicle_battery_reference_capacity_changes_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "vehicle_battery_reference_capacity_changes"
    ADD CONSTRAINT "vehicle_battery_reference_capacity_changes_reference_capacity_id_fkey"
    FOREIGN KEY ("reference_capacity_id") REFERENCES "vehicle_battery_reference_capacities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "vehicle_battery_reference_capacity_changes"
    ADD CONSTRAINT "vehicle_battery_reference_capacity_changes_actor_user_id_fkey"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

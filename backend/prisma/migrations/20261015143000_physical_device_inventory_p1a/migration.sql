-- Physical Device Inventory — Phase 1A (append-only, Master Admin stock)

CREATE TYPE "PhysicalDeviceModelCode" AS ENUM ('RUPTELA_R1', 'RUPTELA_AIR_ONE', 'SMART5', 'OTHER');
CREATE TYPE "PhysicalDeviceInventoryStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'INSTALLED', 'DEFECTIVE', 'LOST', 'RETIRED');
CREATE TYPE "PhysicalDeviceIdentityStatus" AS ENUM ('VERIFIED', 'NEEDS_CLARIFICATION');
CREATE TYPE "PhysicalDeviceIntakeSource" AS ENUM ('MANUAL_MASTER_ADMIN');
CREATE TYPE "PhysicalDeviceAssignmentKind" AS ENUM ('INVENTORY_INTAKE');

CREATE TABLE "physical_devices" (
    "id" TEXT NOT NULL,
    "internal_inventory_number" TEXT NOT NULL,
    "manufacturer" TEXT NOT NULL,
    "model_code" "PhysicalDeviceModelCode" NOT NULL,
    "serial_number" TEXT,
    "imei" TEXT,
    "owner_organization_id" TEXT,
    "warehouse_location" TEXT NOT NULL,
    "status" "PhysicalDeviceInventoryStatus" NOT NULL,
    "identity_status" "PhysicalDeviceIdentityStatus" NOT NULL,
    "recorded_at" TIMESTAMP(3) NOT NULL,
    "intake_source" "PhysicalDeviceIntakeSource" NOT NULL,
    "identity_evidence_json" JSONB,
    "intake_notes" TEXT,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "physical_devices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "physical_device_assignments" (
    "id" TEXT NOT NULL,
    "physical_device_id" TEXT NOT NULL,
    "organization_id" TEXT,
    "vehicle_id" TEXT,
    "assignment_kind" "PhysicalDeviceAssignmentKind" NOT NULL,
    "effective_from" TIMESTAMP(3) NOT NULL,
    "effective_to" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "actor_user_id" TEXT,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "physical_device_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "physical_devices_internal_inventory_number_key" ON "physical_devices"("internal_inventory_number");
CREATE UNIQUE INDEX "physical_devices_serial_number_key" ON "physical_devices"("serial_number") WHERE "serial_number" IS NOT NULL;
CREATE UNIQUE INDEX "physical_devices_imei_key" ON "physical_devices"("imei") WHERE "imei" IS NOT NULL;

CREATE INDEX "physical_devices_owner_organization_id_idx" ON "physical_devices"("owner_organization_id");
CREATE INDEX "physical_devices_warehouse_location_idx" ON "physical_devices"("warehouse_location");
CREATE INDEX "physical_devices_status_idx" ON "physical_devices"("status");
CREATE INDEX "physical_devices_model_code_idx" ON "physical_devices"("model_code");

CREATE UNIQUE INDEX "physical_device_assignments_idempotency_key_key" ON "physical_device_assignments"("idempotency_key") WHERE "idempotency_key" IS NOT NULL;
CREATE INDEX "physical_device_assignments_physical_device_id_effective_from_idx" ON "physical_device_assignments"("physical_device_id", "effective_from");
CREATE INDEX "physical_device_assignments_vehicle_id_idx" ON "physical_device_assignments"("vehicle_id");
CREATE INDEX "physical_device_assignments_organization_id_idx" ON "physical_device_assignments"("organization_id");

ALTER TABLE "physical_devices" ADD CONSTRAINT "physical_devices_owner_organization_id_fkey" FOREIGN KEY ("owner_organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "physical_device_assignments" ADD CONSTRAINT "physical_device_assignments_physical_device_id_fkey" FOREIGN KEY ("physical_device_id") REFERENCES "physical_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "physical_device_assignments" ADD CONSTRAINT "physical_device_assignments_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "physical_device_assignments" ADD CONSTRAINT "physical_device_assignments_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

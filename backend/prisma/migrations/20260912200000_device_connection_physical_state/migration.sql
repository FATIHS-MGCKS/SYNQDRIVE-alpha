-- CreateEnum
CREATE TYPE "DeviceConnectionPhysicalEffectiveState" AS ENUM ('PLUGGED', 'UNPLUGGED');

-- CreateEnum
CREATE TYPE "DeviceConnectionPhysicalEvidenceSource" AS ENUM ('WEBHOOK', 'SNAPSHOT_OBD', 'MANUAL', 'RECONCILIATION');

-- CreateEnum
CREATE TYPE "DeviceConnectionPhysicalTransitionDecision" AS ENUM (
  'ESTABLISHED',
  'APPLIED',
  'DUPLICATE',
  'STALE',
  'CONFLICT',
  'INSUFFICIENT_EVIDENCE',
  'PROVENANCE_REFRESH'
);

-- CreateTable
CREATE TABLE "device_connection_physical_states" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DIMO',
    "binding_key" TEXT NOT NULL,
    "device_binding_id" TEXT,
    "provider_device_id_hash" TEXT,
    "effective_state" "DeviceConnectionPhysicalEffectiveState" NOT NULL,
    "evidence_observed_at" TIMESTAMP(3) NOT NULL,
    "evidence_source" "DeviceConnectionPhysicalEvidenceSource" NOT NULL,
    "evidence_reference_id" TEXT NOT NULL,
    "state_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_connection_physical_states_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_connection_physical_state_transitions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DIMO',
    "binding_key" TEXT NOT NULL,
    "previous_state" "DeviceConnectionPhysicalEffectiveState",
    "effective_state" "DeviceConnectionPhysicalEffectiveState",
    "evidence_observed_at" TIMESTAMP(3) NOT NULL,
    "evidence_source" "DeviceConnectionPhysicalEvidenceSource" NOT NULL,
    "evidence_reference_id" TEXT NOT NULL,
    "parent_state_version" INTEGER,
    "applied_state_version" INTEGER,
    "decision" "DeviceConnectionPhysicalTransitionDecision" NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "metadata_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_connection_physical_state_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_connection_physical_state_binding_key" ON "device_connection_physical_states"("organization_id", "vehicle_id", "provider", "binding_key");

-- CreateIndex
CREATE INDEX "device_connection_physical_states_vehicle_id_idx" ON "device_connection_physical_states"("vehicle_id");

-- CreateIndex
CREATE INDEX "device_connection_physical_states_organization_id_idx" ON "device_connection_physical_states"("organization_id");

-- CreateIndex
CREATE INDEX "device_connection_physical_states_evidence_observed_at_idx" ON "device_connection_physical_states"("evidence_observed_at");

-- CreateIndex
CREATE UNIQUE INDEX "device_connection_physical_state_transitions_idempotency_key_key" ON "device_connection_physical_state_transitions"("idempotency_key");

-- CreateIndex
CREATE INDEX "device_connection_physical_state_transitions_vehicle_id_created__idx" ON "device_connection_physical_state_transitions"("vehicle_id", "created_at");

-- CreateIndex
CREATE INDEX "device_connection_physical_state_transitions_organization_id_vehi_idx" ON "device_connection_physical_state_transitions"("organization_id", "vehicle_id");

-- AddForeignKey
ALTER TABLE "device_connection_physical_states" ADD CONSTRAINT "device_connection_physical_states_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_connection_physical_state_transitions" ADD CONSTRAINT "device_connection_physical_state_transitions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "DeviceConnectionPhysicalAuthorityMode" AS ENUM ('LEGACY', 'PHYSICAL');

-- CreateEnum
CREATE TYPE "DeviceConnectionPhysicalStateActionOutboxStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'RETRYABLE_FAILED',
  'DEAD_LETTER'
);

-- CreateTable
CREATE TABLE "device_connection_physical_authority_cutover" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DIMO',
    "authority_mode" "DeviceConnectionPhysicalAuthorityMode" NOT NULL DEFAULT 'LEGACY',
    "latched_at" TIMESTAMP(3),
    "latched_by" TEXT,
    "evidence_snapshot" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_connection_physical_authority_cutover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "device_connection_physical_state_action_outbox" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DIMO',
    "binding_key" TEXT NOT NULL,
    "transition_id" TEXT NOT NULL,
    "state_version" INTEGER NOT NULL,
    "evidence_reference_id" TEXT NOT NULL,
    "canonical_event_id" TEXT,
    "episode_action" TEXT NOT NULL,
    "alert_action" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "status" "DeviceConnectionPhysicalStateActionOutboxStatus" NOT NULL DEFAULT 'PENDING',
    "processing_attempts" INTEGER NOT NULL DEFAULT 0,
    "processing_lease_expires_at" TIMESTAMP(3),
    "next_retry_at" TIMESTAMP(3),
    "last_error_code" TEXT,
    "last_error_message" TEXT,
    "dead_lettered_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_connection_physical_state_action_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_connection_physical_authority_scope_key" ON "device_connection_physical_authority_cutover"("organization_id", "vehicle_id", "provider");

-- CreateIndex
CREATE INDEX "device_connection_physical_authority_cutover_vehicle_id_idx" ON "device_connection_physical_authority_cutover"("vehicle_id");

-- CreateIndex
CREATE INDEX "device_connection_physical_authority_cutover_organization_id_idx" ON "device_connection_physical_authority_cutover"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "device_connection_physical_state_action_outbox_idempotency_key_key" ON "device_connection_physical_state_action_outbox"("idempotency_key");

-- CreateIndex
CREATE INDEX "device_connection_physical_state_action_outbox_organization_id_idx" ON "device_connection_physical_state_action_outbox"("organization_id");

-- CreateIndex
CREATE INDEX "device_connection_physical_state_action_outbox_vehicle_id_idx" ON "device_connection_physical_state_action_outbox"("vehicle_id");

-- CreateIndex
CREATE INDEX "device_connection_physical_state_action_outbox_status_idx" ON "device_connection_physical_state_action_outbox"("status");

-- CreateIndex
CREATE INDEX "device_connection_physical_state_action_outbox_status_next_retry_at_idx" ON "device_connection_physical_state_action_outbox"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "device_connection_physical_state_action_outbox_status_processing_lease_expires_at_idx" ON "device_connection_physical_state_action_outbox"("status", "processing_lease_expires_at");

-- AddForeignKey
ALTER TABLE "device_connection_physical_authority_cutover" ADD CONSTRAINT "device_connection_physical_authority_cutover_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_connection_physical_state_action_outbox" ADD CONSTRAINT "device_connection_physical_state_action_outbox_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

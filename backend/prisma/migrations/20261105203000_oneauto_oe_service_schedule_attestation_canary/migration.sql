-- CreateEnum
CREATE TYPE "OneAutoExecutionAuthorizationMode" AS ENUM ('STANDARD', 'ATTESTATION_CANARY');

-- CreateEnum
CREATE TYPE "OneAutoOeServiceScheduleAttestationPermitStatus" AS ENUM ('READY', 'CONSUMED', 'BLOCKED');

-- CreateTable
CREATE TABLE "one_auto_oe_service_schedule_attestation_permits" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "service_sku" TEXT NOT NULL DEFAULT 'OE_SERVICE_SCHEDULE',
    "vin_snapshot" TEXT NOT NULL,
    "status" "OneAutoOeServiceScheduleAttestationPermitStatus" NOT NULL,
    "owner_authorized_by_user_id" TEXT NOT NULL,
    "owner_authorized_at" TIMESTAMP(3) NOT NULL,
    "account_pricing_acknowledged_at" TIMESTAMP(3) NOT NULL,
    "max_authorized_spend_minor" INTEGER NOT NULL,
    "configured_price_minor" INTEGER NOT NULL,
    "pricing_source_version" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "blocked_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "one_auto_oe_service_schedule_attestation_permits_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "one_auto_provider_jobs" ADD COLUMN     "execution_authorization_mode" "OneAutoExecutionAuthorizationMode" NOT NULL DEFAULT 'STANDARD',
ADD COLUMN     "attestation_permit_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "one_auto_oe_service_schedule_attestation_permits_organization_id_service_sku_key" ON "one_auto_oe_service_schedule_attestation_permits"("organization_id", "service_sku");

-- CreateIndex
CREATE INDEX "one_auto_oe_service_schedule_attestation_permits_organization_id_vehicle_id_idx" ON "one_auto_oe_service_schedule_attestation_permits"("organization_id", "vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "one_auto_provider_jobs_attestation_permit_id_key" ON "one_auto_provider_jobs"("attestation_permit_id");

-- AddForeignKey
ALTER TABLE "one_auto_provider_jobs" ADD CONSTRAINT "one_auto_provider_jobs_attestation_permit_id_fkey" FOREIGN KEY ("attestation_permit_id") REFERENCES "one_auto_oe_service_schedule_attestation_permits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

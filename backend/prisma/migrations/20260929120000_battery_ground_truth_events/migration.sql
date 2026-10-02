-- M3.3G G1 — append-only battery ground-truth authority + legacy service-event org backfill

-- Backfill nullable organization_id on vehicle_service_events from vehicles (no GT backfill)
UPDATE vehicle_service_events AS se
SET organization_id = v.organization_id
FROM vehicles AS v
WHERE se.organization_id IS NULL
  AND se.vehicle_id = v.id
  AND v.organization_id IS NOT NULL;

-- CreateEnum
CREATE TYPE "BatteryGroundTruthType" AS ENUM ('WORKSHOP_MEASUREMENT', 'BATTERY_REPLACEMENT', 'OTHER_CONFIRMED_INTERVENTION');

-- CreateEnum
CREATE TYPE "BatteryGroundTruthSourceAuthority" AS ENUM ('WORKSHOP', 'CONFIRMED_DOCUMENT', 'OEM', 'MANUAL_CONFIRMED', 'OTHER');

-- CreateEnum
CREATE TYPE "BatteryGroundTruthVerificationStatus" AS ENUM ('CONFIRMED', 'SUPERSEDED', 'REVOKED');

-- CreateEnum
CREATE TYPE "BatteryGroundTruthRevocationReasonCode" AS ENUM ('SOURCE_DELETED', 'OPERATOR_REVOKE', 'DATA_CORRECTION', 'OTHER');

-- CreateTable
CREATE TABLE "battery_ground_truth_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "ground_truth_type" "BatteryGroundTruthType" NOT NULL,
    "battery_scope" "BatteryEvidenceScope" NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "source_authority" "BatteryGroundTruthSourceAuthority" NOT NULL,
    "verification_status" "BatteryGroundTruthVerificationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "source_service_event_id" TEXT,
    "source_document_extraction_id" TEXT,
    "source_battery_evidence_id" TEXT,
    "source_measurement_id" TEXT,
    "source_content_fingerprint" CHAR(64) NOT NULL,
    "confirmed_by_user_id" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "supersedes_ground_truth_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battery_ground_truth_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "battery_ground_truth_revocations" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "ground_truth_event_id" TEXT NOT NULL,
    "reason_code" "BatteryGroundTruthRevocationReasonCode" NOT NULL,
    "revoked_by_user_id" TEXT,
    "revoked_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "battery_ground_truth_revocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "battery_ground_truth_events_organization_id_idx" ON "battery_ground_truth_events"("organization_id");

-- CreateIndex
CREATE INDEX "battery_ground_truth_events_vehicle_id_effective_at_idx" ON "battery_ground_truth_events"("vehicle_id", "effective_at" DESC);

-- CreateIndex
CREATE INDEX "battery_ground_truth_events_ground_truth_type_idx" ON "battery_ground_truth_events"("ground_truth_type");

-- CreateIndex
CREATE INDEX "battery_ground_truth_events_battery_scope_idx" ON "battery_ground_truth_events"("battery_scope");

-- CreateIndex
CREATE INDEX "battery_ground_truth_events_verification_status_idx" ON "battery_ground_truth_events"("verification_status");

-- CreateIndex
CREATE INDEX "battery_ground_truth_events_source_content_fingerprint_idx" ON "battery_ground_truth_events"("source_content_fingerprint");

-- CreateIndex
CREATE INDEX "battery_ground_truth_events_supersedes_ground_truth_event_id_idx" ON "battery_ground_truth_events"("supersedes_ground_truth_event_id");

-- Active CONFIRMED rows: idempotent admit per org + fingerprint
CREATE UNIQUE INDEX "battery_ground_truth_events_active_fingerprint_key"
ON "battery_ground_truth_events" ("organization_id", "source_content_fingerprint")
WHERE "verification_status" = 'CONFIRMED';

-- At most one CONFIRMED successor per superseded prior row
CREATE UNIQUE INDEX "battery_ground_truth_one_confirmed_successor_per_prior"
ON "battery_ground_truth_events" ("supersedes_ground_truth_event_id")
WHERE "verification_status" = 'CONFIRMED' AND "supersedes_ground_truth_event_id" IS NOT NULL;

-- CreateIndex
CREATE INDEX "battery_ground_truth_revocations_organization_id_idx" ON "battery_ground_truth_revocations"("organization_id");

-- CreateIndex
CREATE INDEX "battery_ground_truth_revocations_ground_truth_event_id_idx" ON "battery_ground_truth_revocations"("ground_truth_event_id");

-- AddForeignKey
ALTER TABLE "battery_ground_truth_events" ADD CONSTRAINT "battery_ground_truth_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_events" ADD CONSTRAINT "battery_ground_truth_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_events" ADD CONSTRAINT "battery_ground_truth_events_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_events" ADD CONSTRAINT "battery_ground_truth_events_source_service_event_id_fkey" FOREIGN KEY ("source_service_event_id") REFERENCES "vehicle_service_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_events" ADD CONSTRAINT "battery_ground_truth_events_source_document_extraction_id_fkey" FOREIGN KEY ("source_document_extraction_id") REFERENCES "vehicle_document_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_events" ADD CONSTRAINT "battery_ground_truth_events_source_battery_evidence_id_fkey" FOREIGN KEY ("source_battery_evidence_id") REFERENCES "battery_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_events" ADD CONSTRAINT "battery_ground_truth_events_source_measurement_id_fkey" FOREIGN KEY ("source_measurement_id") REFERENCES "battery_measurements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_events" ADD CONSTRAINT "battery_ground_truth_events_supersedes_ground_truth_event_id_fkey" FOREIGN KEY ("supersedes_ground_truth_event_id") REFERENCES "battery_ground_truth_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_revocations" ADD CONSTRAINT "battery_ground_truth_revocations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_revocations" ADD CONSTRAINT "battery_ground_truth_revocations_ground_truth_event_id_fkey" FOREIGN KEY ("ground_truth_event_id") REFERENCES "battery_ground_truth_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "battery_ground_truth_revocations" ADD CONSTRAINT "battery_ground_truth_revocations_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Brake Evidence System
--
-- Canonical store of discrete brake observations from every source (manual
-- measurement, workshop report, AI upload, service invoice, inspection
-- protocol, brake DTC, wear sensor, telematics estimation). Real mm values are
-- only ever persisted from trusted sources — telematics estimations never
-- invent wheel/axle mm (enforced in BrakeEvidenceService). This is the
-- evidence layer the canonical Brake Health read model and BrakeCriticalDetector
-- read from; it does NOT replace BrakeHealthCurrent (the wear-model state).

-- CreateEnum
CREATE TYPE "BrakeEvidenceSource" AS ENUM (
  'MANUAL_MEASUREMENT',
  'WORKSHOP_REPORT',
  'AI_UPLOAD',
  'SERVICE_INVOICE',
  'INSPECTION_PROTOCOL',
  'DTC_SIGNAL',
  'BRAKE_WEAR_SENSOR',
  'TELEMATICS_ESTIMATION'
);

-- CreateEnum
CREATE TYPE "BrakeAxle" AS ENUM ('FRONT', 'REAR', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BrakeWheelPosition" AS ENUM ('FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT');

-- CreateEnum
CREATE TYPE "BrakeComponentStatus" AS ENUM ('GOOD', 'WATCH', 'WARNING', 'CRITICAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "BrakeEvidenceConfidence" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');

-- CreateTable
CREATE TABLE "brake_evidence" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "source" "BrakeEvidenceSource" NOT NULL,
    "axle" "BrakeAxle" NOT NULL DEFAULT 'UNKNOWN',
    "wheel_position" "BrakeWheelPosition",
    "measured_pad_mm" DOUBLE PRECISION,
    "measured_disc_mm" DOUBLE PRECISION,
    "disc_condition" "BrakeComponentStatus",
    "brake_fluid_status" "BrakeComponentStatus",
    "immediate_replacement" BOOLEAN,
    "dtc_severity" TEXT,
    "mileage_at_measurement_km" INTEGER,
    "measured_at" TIMESTAMP(3),
    "confidence" "BrakeEvidenceConfidence" NOT NULL DEFAULT 'UNKNOWN',
    "notes" TEXT,
    "document_extraction_id" TEXT,
    "service_event_id" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brake_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "brake_evidence_vehicle_id_axle_measured_at_idx" ON "brake_evidence"("vehicle_id", "axle", "measured_at");

-- CreateIndex
CREATE INDEX "brake_evidence_vehicle_id_source_measured_at_idx" ON "brake_evidence"("vehicle_id", "source", "measured_at");

-- CreateIndex
CREATE INDEX "brake_evidence_document_extraction_id_idx" ON "brake_evidence"("document_extraction_id");

-- CreateIndex
CREATE INDEX "brake_evidence_service_event_id_idx" ON "brake_evidence"("service_event_id");

-- AddForeignKey
ALTER TABLE "brake_evidence"
  ADD CONSTRAINT "brake_evidence_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_evidence"
  ADD CONSTRAINT "brake_evidence_document_extraction_id_fkey"
  FOREIGN KEY ("document_extraction_id") REFERENCES "vehicle_document_extractions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_evidence"
  ADD CONSTRAINT "brake_evidence_service_event_id_fkey"
  FOREIGN KEY ("service_event_id") REFERENCES "vehicle_service_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- VW-F-009: preserve evidence rows when vehicle is deleted (SET NULL instead of CASCADE)
-- VW WP-02: canonical VehicleFinding table
-- VW-F-025: complaint create dedupe key column

-- VehicleFinding (expand-only)
CREATE TYPE "VehicleFindingStatus" AS ENUM (
  'ACTIVE',
  'ACKNOWLEDGED',
  'RESOLVED',
  'SUPERSEDED',
  'EXPIRED'
);

CREATE TYPE "VehicleFindingSourceType" AS ENUM (
  'TIRE_ALERT',
  'BRAKE_ALERT',
  'BATTERY_ALERT',
  'DTC',
  'COMPLAINT',
  'INSIGHT',
  'CONNECTIVITY',
  'OTHER'
);

CREATE TABLE "vehicle_findings" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT,
  "source_type" "VehicleFindingSourceType" NOT NULL,
  "source_ref" TEXT,
  "dedupe_key" TEXT NOT NULL,
  "status" "VehicleFindingStatus" NOT NULL DEFAULT 'ACTIVE',
  "severity" TEXT,
  "title" TEXT,
  "message" TEXT,
  "detected_at" TIMESTAMP(3) NOT NULL,
  "acknowledged_at" TIMESTAMP(3),
  "resolved_at" TIMESTAMP(3),
  "metadata_json" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vehicle_findings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_findings_org_dedupe_key"
  ON "vehicle_findings" ("organization_id", "dedupe_key");

CREATE INDEX "vehicle_findings_organization_id_status_idx"
  ON "vehicle_findings" ("organization_id", "status");

CREATE INDEX "vehicle_findings_vehicle_id_status_idx"
  ON "vehicle_findings" ("vehicle_id", "status");

ALTER TABLE "vehicle_findings"
  ADD CONSTRAINT "vehicle_findings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_findings"
  ADD CONSTRAINT "vehicle_findings_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Complaint dedupe key (VW-F-025)
ALTER TABLE "vehicle_complaints" ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;

CREATE INDEX IF NOT EXISTS "vehicle_complaints_organization_id_dedupe_key_idx"
  ON "vehicle_complaints" ("organization_id", "dedupe_key");

CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_complaints_active_dedupe_uidx"
  ON "vehicle_complaints" ("organization_id", "dedupe_key")
  WHERE "dedupe_key" IS NOT NULL
    AND "status" IN ('ACTIVE', 'OPEN', 'IN_REVIEW', 'CONFIRMED', 'NEW');

-- BatteryEvidence: vehicle FK CASCADE → SET NULL (VW-F-009)
ALTER TABLE "battery_evidence" DROP CONSTRAINT IF EXISTS "battery_evidence_vehicle_id_fkey";
ALTER TABLE "battery_evidence" ALTER COLUMN "vehicle_id" DROP NOT NULL;
ALTER TABLE "battery_evidence"
  ADD CONSTRAINT "battery_evidence_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- VehicleDtcEvent: vehicle FK CASCADE → SET NULL (VW-F-009)
ALTER TABLE "vehicle_dtc_events" DROP CONSTRAINT IF EXISTS "vehicle_dtc_events_vehicle_id_fkey";
ALTER TABLE "vehicle_dtc_events" ALTER COLUMN "vehicle_id" DROP NOT NULL;
ALTER TABLE "vehicle_dtc_events"
  ADD CONSTRAINT "vehicle_dtc_events_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Setup-scoped tire health alerts with revision-safe resolution

CREATE TYPE "TireHealthAlertStatus" AS ENUM ('OPEN', 'RESOLVED');

CREATE TYPE "TireHealthAlertResolutionReason" AS ENUM (
  'MEASUREMENT_CORRECTED',
  'TIRE_REPLACED',
  'SETUP_STORED',
  'SETUP_CHANGED',
  'PRESSURE_NORMALIZED',
  'TPMS_CLEARED',
  'SEASON_POLICY_CHANGED',
  'EVIDENCE_CLEARED',
  'SUPERSEDED'
);

CREATE TABLE "tire_health_alerts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "tire_setup_id" TEXT NOT NULL,
  "alert_type" TEXT NOT NULL,
  "reason_code" TEXT NOT NULL,
  "severity" TEXT NOT NULL,
  "wheel_position" TEXT,
  "display_mode" TEXT NOT NULL,
  "evidence_fingerprint" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "status" "TireHealthAlertStatus" NOT NULL DEFAULT 'OPEN',
  "resolution_reason" "TireHealthAlertResolutionReason",
  "resolved_at" TIMESTAMP(3),
  "opened_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "input_fingerprint" TEXT,
  "last_notified_fingerprint" TEXT,
  "pressure_source" TEXT,
  "pressure_timestamp" TIMESTAMP(3),
  "pressure_freshness" TEXT,
  "template_params_json" JSONB,

  CONSTRAINT "tire_health_alerts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tire_health_alerts_organization_id_status_idx"
  ON "tire_health_alerts"("organization_id", "status");
CREATE INDEX "tire_health_alerts_vehicle_id_tire_setup_id_status_idx"
  ON "tire_health_alerts"("vehicle_id", "tire_setup_id", "status");
CREATE INDEX "tire_health_alerts_dedupe_key_status_idx"
  ON "tire_health_alerts"("dedupe_key", "status");

CREATE UNIQUE INDEX "tire_health_alerts_open_dedupe_key_uidx"
  ON "tire_health_alerts"("dedupe_key")
  WHERE "status" = 'OPEN';

ALTER TABLE "tire_health_alerts"
  ADD CONSTRAINT "tire_health_alerts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tire_health_alerts"
  ADD CONSTRAINT "tire_health_alerts_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "tire_health_alerts"
  ADD CONSTRAINT "tire_health_alerts_tire_setup_id_fkey"
  FOREIGN KEY ("tire_setup_id") REFERENCES "vehicle_tire_setups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

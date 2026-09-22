-- M3.3 B1.2Y1 — dedicated provider observability gap entity (additive, default OFF at runtime)

CREATE TYPE "BatteryProviderObservabilityGapStatus" AS ENUM (
  'OPEN',
  'RESOLVED_OFF',
  'RESOLVED_FRESH_RUNNING_NO_OBSERVED_OFF',
  'RESOLVED_AMBIGUOUS'
);

CREATE TABLE "battery_provider_observability_gaps" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "contract_version" TEXT NOT NULL DEFAULT 'R1_ICE_LV_ENGINE_BUNDLE_V1',
  "signal_family" TEXT NOT NULL DEFAULT 'LIVE_VOLTAGE_ENGINE_STATE_BUNDLE',
  "status" "BatteryProviderObservabilityGapStatus" NOT NULL DEFAULT 'OPEN',
  "gap_detected_at" TIMESTAMP(3) NOT NULL,
  "last_fresh_provider_at" TIMESTAMP(3) NOT NULL,
  "last_fresh_observation_id" TEXT,
  "last_known_evidence_class" "BatteryGeneralizedEvidenceClass",
  "stale_successful_poll_count" INTEGER NOT NULL DEFAULT 1,
  "idempotency_key" TEXT NOT NULL,
  "resolution_at" TIMESTAMP(3),
  "resolution_idempotency_key" TEXT,
  "first_fresh_observation_after_gap_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "battery_provider_observability_gaps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "battery_provider_gap_open_idempotency"
  ON "battery_provider_observability_gaps"("organization_id", "vehicle_id", "idempotency_key");

CREATE UNIQUE INDEX "battery_provider_gap_resolution_idempotency"
  ON "battery_provider_observability_gaps"("resolution_idempotency_key");

CREATE INDEX "battery_provider_observability_gaps_vehicle_id_status_idx"
  ON "battery_provider_observability_gaps"("vehicle_id", "status");

CREATE INDEX "battery_provider_observability_gaps_vehicle_id_contract_version_status_idx"
  ON "battery_provider_observability_gaps"("vehicle_id", "contract_version", "status");

CREATE UNIQUE INDEX "battery_provider_gap_one_open_per_vehicle_contract"
  ON "battery_provider_observability_gaps" ("vehicle_id", "contract_version")
  WHERE "status" = 'OPEN';

ALTER TABLE "battery_provider_observability_gaps"
  ADD CONSTRAINT "battery_provider_observability_gaps_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_provider_observability_gaps"
  ADD CONSTRAINT "battery_provider_observability_gaps_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_provider_observability_gaps"
  ADD CONSTRAINT "battery_provider_observability_gaps_last_fresh_observation_id_fkey"
  FOREIGN KEY ("last_fresh_observation_id") REFERENCES "battery_measurements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "battery_provider_observability_gaps"
  ADD CONSTRAINT "battery_provider_observability_gaps_first_fresh_observation_after_gap_id_fkey"
  FOREIGN KEY ("first_fresh_observation_after_gap_id") REFERENCES "battery_measurements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

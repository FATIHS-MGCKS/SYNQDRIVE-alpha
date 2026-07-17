-- Tire evidence source and ground-truth provenance (additive, no data backfill)

CREATE TYPE "TireEvidenceSource" AS ENUM (
  'MANUAL_MEASUREMENT',
  'WORKSHOP_MEASUREMENT',
  'DOCUMENT_MEASUREMENT',
  'MANUFACTURER_CONFIRMED',
  'USER_CONFIRMED',
  'AI_ESTIMATED',
  'MODEL_ESTIMATED',
  'DEFAULT_ASSUMPTION',
  'PROVIDER_SIGNAL',
  'UNKNOWN'
);

CREATE TYPE "TireBaselineStatus" AS ENUM (
  'UNKNOWN',
  'INCOMPLETE',
  'ESTIMATED',
  'CONFIRMED',
  'DOCUMENTED'
);

-- VehicleTireSetup baseline provenance
ALTER TABLE "vehicle_tire_setups"
  ADD COLUMN "initial_tread_evidence_source" "TireEvidenceSource",
  ADD COLUMN "initial_tread_measured_at" TIMESTAMP(3),
  ADD COLUMN "initial_tread_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "initial_tread_evidence_id" TEXT,
  ADD COLUMN "baseline_confidence" DOUBLE PRECISION,
  ADD COLUMN "baseline_status" "TireBaselineStatus";

CREATE INDEX "vehicle_tire_setups_initial_tread_evidence_id_idx"
  ON "vehicle_tire_setups"("initial_tread_evidence_id");

-- Tire identity baseline provenance
ALTER TABLE "tires"
  ADD COLUMN "initial_tread_evidence_source" "TireEvidenceSource",
  ADD COLUMN "initial_tread_measured_at" TIMESTAMP(3),
  ADD COLUMN "initial_tread_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "initial_tread_evidence_id" TEXT,
  ADD COLUMN "baseline_confidence" DOUBLE PRECISION,
  ADD COLUMN "baseline_status" "TireBaselineStatus";

-- Measurement evidence (nullable; legacy source string unchanged)
ALTER TABLE "vehicle_tire_tread_measurements"
  ADD COLUMN "evidence_source" "TireEvidenceSource";

CREATE INDEX "vehicle_tire_tread_measurements_evidence_source_idx"
  ON "vehicle_tire_tread_measurements"("evidence_source");

-- Protect validation history: measurements cannot be cascade-deleted with setup
ALTER TABLE "vehicle_tire_tread_measurements"
  DROP CONSTRAINT IF EXISTS "vehicle_tire_tread_measurements_tire_setup_id_fkey";

ALTER TABLE "vehicle_tire_tread_measurements"
  ADD CONSTRAINT "vehicle_tire_tread_measurements_tire_setup_id_fkey"
  FOREIGN KEY ("tire_setup_id") REFERENCES "vehicle_tire_setups"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- TireHealthSnapshot model / evidence metadata
ALTER TABLE "tire_health_snapshots"
  ADD COLUMN "model_version" TEXT,
  ADD COLUMN "model_config_hash" TEXT,
  ADD COLUMN "input_fingerprint" TEXT,
  ADD COLUMN "baseline_source" "TireEvidenceSource",
  ADD COLUMN "evidence_summary" JSONB;

-- TireWearDataPoint ground-truth provenance
ALTER TABLE "tire_wear_data_points"
  ADD COLUMN "is_ground_truth" BOOLEAN,
  ADD COLUMN "actual_source" "TireEvidenceSource",
  ADD COLUMN "actual_measurement_id" TEXT,
  ADD COLUMN "actual_measured_at" TIMESTAMP(3),
  ADD COLUMN "prediction_generated_at" TIMESTAMP(3),
  ADD COLUMN "model_version" TEXT,
  ADD COLUMN "model_config_hash" TEXT,
  ADD COLUMN "prediction_snapshot_id" TEXT;

CREATE INDEX "tire_wear_data_points_actual_measurement_id_idx"
  ON "tire_wear_data_points"("actual_measurement_id");

CREATE INDEX "tire_wear_data_points_prediction_snapshot_id_idx"
  ON "tire_wear_data_points"("prediction_snapshot_id");

CREATE INDEX "tire_wear_data_points_is_ground_truth_idx"
  ON "tire_wear_data_points"("is_ground_truth");

ALTER TABLE "tire_wear_data_points"
  ADD CONSTRAINT "tire_wear_data_points_actual_measurement_id_fkey"
  FOREIGN KEY ("actual_measurement_id") REFERENCES "vehicle_tire_tread_measurements"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "tire_wear_data_points"
  ADD CONSTRAINT "tire_wear_data_points_prediction_snapshot_id_fkey"
  FOREIGN KEY ("prediction_snapshot_id") REFERENCES "tire_health_snapshots"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "vehicle_tire_setups"
  ADD CONSTRAINT "vehicle_tire_setups_initial_tread_evidence_id_fkey"
  FOREIGN KEY ("initial_tread_evidence_id") REFERENCES "vehicle_tire_tread_measurements"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

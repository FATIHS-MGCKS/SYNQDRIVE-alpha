-- RFRF F2 — RawRefuelCandidate staging (VehicleEnergyEvent source metadata deferred to F4).

CREATE TYPE "RawRefuelCandidateLifecycleState" AS ENUM (
  'INSUFFICIENT',
  'OBSERVED',
  'SETTLING',
  'READY_FOR_PERSIST',
  'REJECTED',
  'PROMOTED'
);

CREATE TYPE "RawRefuelCandidateSignalChannel" AS ENUM (
  'ABSOLUTE_LITERS',
  'RELATIVE_PERCENT'
);

CREATE TYPE "RawRefuelAbsoluteSignalTrust" AS ENUM (
  'TRUSTED',
  'UNTRUSTED',
  'UNKNOWN'
);

CREATE TYPE "RawRefuelCandidateRejectionReason" AS ENUM (
  'INSUFFICIENT_PRE_PLATEAU',
  'INSUFFICIENT_POST_PLATEAU',
  'RISE_TOO_SMALL',
  'SAMPLE_GAP_TOO_LARGE',
  'RISE_NOT_STABLE',
  'SENSOR_RESET_SUSPECTED',
  'UNIT_NOT_TRUSTED',
  'VEHICLE_CAPABILITY_UNSUPPORTED',
  'MOTION_EVIDENCE_CONFLICT',
  'DUPLICATE_NATIVE_EVIDENCE',
  'EVIDENCE_STILL_SETTLING',
  'DUPLICATE_FALLBACK_EVIDENCE',
  'NON_FUEL_POWERTRAIN'
);

CREATE TABLE "raw_refuel_candidates" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "candidate_identity_key" TEXT,
  "detection_version" TEXT NOT NULL,
  "detector_version" TEXT NOT NULL,
  "signal_channel" "RawRefuelCandidateSignalChannel" NOT NULL,
  "lifecycle_state" "RawRefuelCandidateLifecycleState" NOT NULL,
  "rejection_reason" "RawRefuelCandidateRejectionReason",
  "evidence_revision_fingerprint" TEXT NOT NULL,
  "physical_evidence_start" TIMESTAMP(3),
  "physical_evidence_end" TIMESTAMP(3),
  "rise_onset_at" TIMESTAMP(3),
  "rise_end_at" TIMESTAMP(3),
  "pre_fuel_absolute_liters" DOUBLE PRECISION,
  "post_fuel_absolute_liters" DOUBLE PRECISION,
  "delta_absolute_liters" DOUBLE PRECISION,
  "pre_fuel_relative_percent" DOUBLE PRECISION,
  "post_fuel_relative_percent" DOUBLE PRECISION,
  "delta_relative_percent" DOUBLE PRECISION,
  "pre_plateau_sample_count" INTEGER,
  "post_plateau_sample_count" INTEGER,
  "total_sample_count" INTEGER,
  "max_sample_gap_seconds" INTEGER,
  "absolute_signal_trust" "RawRefuelAbsoluteSignalTrust",
  "relative_signal_available" BOOLEAN,
  "route_evidence_available" BOOLEAN,
  "stationary_evidence_available" BOOLEAN,
  "scan_window_start" TIMESTAMP(3),
  "scan_window_end" TIMESTAMP(3),
  "signal_provider" TEXT,
  "evidence_meta" JSONB,
  "quality_meta" JSONB,
  "first_observed_at" TIMESTAMP(3) NOT NULL,
  "last_observed_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "raw_refuel_candidates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "raw_refuel_candidates_vehicle_id_candidate_identity_key_key"
  ON "raw_refuel_candidates"("vehicle_id", "candidate_identity_key");

CREATE INDEX "raw_refuel_candidates_organization_id_idx"
  ON "raw_refuel_candidates"("organization_id");

CREATE INDEX "raw_refuel_candidates_vehicle_id_lifecycle_state_idx"
  ON "raw_refuel_candidates"("vehicle_id", "lifecycle_state");

CREATE INDEX "raw_refuel_candidates_vehicle_id_physical_evidence_start_idx"
  ON "raw_refuel_candidates"("vehicle_id", "physical_evidence_start");

CREATE INDEX "raw_refuel_candidates_vehicle_id_first_observed_at_idx"
  ON "raw_refuel_candidates"("vehicle_id", "first_observed_at");

CREATE INDEX "raw_refuel_candidates_lifecycle_state_updated_at_idx"
  ON "raw_refuel_candidates"("lifecycle_state", "updated_at");

ALTER TABLE "raw_refuel_candidates"
  ADD CONSTRAINT "raw_refuel_candidates_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "raw_refuel_candidates"
  ADD CONSTRAINT "raw_refuel_candidates_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

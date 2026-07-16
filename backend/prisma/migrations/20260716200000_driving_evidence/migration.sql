-- Driving Intelligence V2 P15 — DrivingEvidence contract (additive)
-- Replaces unused P12 DrivingEvidenceSourceType enum values (no columns referenced them).

DROP TYPE IF EXISTS "DrivingEvidenceSourceType";

CREATE TYPE "DrivingEvidenceSourceType" AS ENUM (
  'MEASURED_SIGNAL',
  'PROVIDER_CLASSIFIED_EVENT',
  'RECONSTRUCTED_EVENT',
  'ESTIMATED_PROXY',
  'CONTEXT_SIGNAL',
  'MANUAL_VERIFIED',
  'WORKSHOP_VERIFIED'
);

CREATE TABLE "driving_evidence" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "trip_id" TEXT,
  "booking_id" TEXT,
  "customer_id" TEXT,
  "dimension" "DrivingAnalysisDimension",
  "analysis_run_id" TEXT,
  "source_type" "DrivingEvidenceSourceType" NOT NULL,
  "strength" "DrivingEvidenceStrength" NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "provider_source" TEXT NOT NULL,
  "capability_version" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "coverage" DOUBLE PRECISION,
  "effective_cadence_ms" INTEGER,
  "p95_cadence_ms" INTEGER,
  "confidence" DOUBLE PRECISION,
  "source_entity_json" JSONB NOT NULL,
  "context_json" JSONB,
  "idempotency_key" TEXT NOT NULL,
  "misuse_case_eligible" BOOLEAN NOT NULL DEFAULT true,
  "contract_version" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "driving_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driving_evidence_organization_id_idempotency_key_key"
  ON "driving_evidence"("organization_id", "idempotency_key");

CREATE INDEX "driving_evidence_organization_id_idx"
  ON "driving_evidence"("organization_id");

CREATE INDEX "driving_evidence_vehicle_id_observed_at_idx"
  ON "driving_evidence"("vehicle_id", "observed_at");

CREATE INDEX "driving_evidence_trip_id_dimension_idx"
  ON "driving_evidence"("trip_id", "dimension");

CREATE INDEX "driving_evidence_source_type_observed_at_idx"
  ON "driving_evidence"("source_type", "observed_at");

CREATE INDEX "driving_evidence_analysis_run_id_idx"
  ON "driving_evidence"("analysis_run_id");

ALTER TABLE "driving_evidence"
  ADD CONSTRAINT "driving_evidence_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driving_evidence"
  ADD CONSTRAINT "driving_evidence_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driving_evidence"
  ADD CONSTRAINT "driving_evidence_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

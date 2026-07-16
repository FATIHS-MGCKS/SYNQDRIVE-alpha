-- P41: Driving Impact source provenance (nullable for backward-compatible reads)

ALTER TABLE "trip_driving_impact"
  ADD COLUMN IF NOT EXISTS "primary_source" TEXT,
  ADD COLUMN IF NOT EXISTS "measured_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "provider_classified_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "reconstructed_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimated_proxy_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "context_only_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "native_event_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "hf_event_count" INTEGER,
  ADD COLUMN IF NOT EXISTS "measurement_coverage" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "hardware_profile" TEXT,
  ADD COLUMN IF NOT EXISTS "capability_version" TEXT,
  ADD COLUMN IF NOT EXISTS "health_eligibility" TEXT,
  ADD COLUMN IF NOT EXISTS "provenance_maturity" TEXT,
  ADD COLUMN IF NOT EXISTS "provenance_version" TEXT;

ALTER TABLE "vehicle_driving_impact_current"
  ADD COLUMN IF NOT EXISTS "primary_source" TEXT,
  ADD COLUMN IF NOT EXISTS "measured_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "provider_classified_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "reconstructed_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "estimated_proxy_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "context_only_share" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "measurement_coverage" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "hardware_profile" TEXT,
  ADD COLUMN IF NOT EXISTS "capability_version" TEXT,
  ADD COLUMN IF NOT EXISTS "health_eligibility" TEXT,
  ADD COLUMN IF NOT EXISTS "provenance_maturity" TEXT,
  ADD COLUMN IF NOT EXISTS "provenance_version" TEXT;

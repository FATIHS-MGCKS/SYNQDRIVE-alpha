-- RPM Webhook Candidate intake (LTE_R1/ICE telemetry-trigger anchor)
-- Adds a tenant-scoped, idempotent candidate table for DIMO Vehicle-Triggers
-- RPM threshold firings (RPM >= 4000). A candidate is an ANCHOR for Event
-- Context Enrichment, NOT a misuse case. Idempotent where practical.

-- 1) New enums
DO $$ BEGIN
  CREATE TYPE "TelemetryTriggerType" AS ENUM ('RPM_THRESHOLD');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "RpmWebhookCandidateStatus" AS ENUM (
    'RECEIVED',
    'CONTEXT_ENRICHED',
    'INSUFFICIENT_CONTEXT',
    'CLASSIFIED',
    'FAILED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Candidate table
CREATE TABLE IF NOT EXISTS "rpm_webhook_candidates" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "trip_id" TEXT,
  "token_id" INTEGER NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'DIMO',
  "trigger_type" "TelemetryTriggerType" NOT NULL DEFAULT 'RPM_THRESHOLD',
  "threshold" INTEGER NOT NULL DEFAULT 4000,
  "observed_value" DOUBLE PRECISION NOT NULL,
  "observed_at" TIMESTAMP(3) NOT NULL,
  "dedup_bucket" BIGINT NOT NULL,
  "raw_payload_json" JSONB NOT NULL,
  "status" "RpmWebhookCandidateStatus" NOT NULL DEFAULT 'RECEIVED',
  "context_assessment_json" JSONB,
  "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "rpm_webhook_candidates_pkey" PRIMARY KEY ("id")
);

-- 3) Idempotency: one candidate per provider+vehicle+trigger+dedup bucket.
CREATE UNIQUE INDEX IF NOT EXISTS "rpm_webhook_candidates_provider_vehicle_id_trigger_type_dedup_bucket_key"
  ON "rpm_webhook_candidates"("provider", "vehicle_id", "trigger_type", "dedup_bucket");

CREATE INDEX IF NOT EXISTS "rpm_webhook_candidates_vehicle_id_idx"
  ON "rpm_webhook_candidates"("vehicle_id");
CREATE INDEX IF NOT EXISTS "rpm_webhook_candidates_organization_id_idx"
  ON "rpm_webhook_candidates"("organization_id");
CREATE INDEX IF NOT EXISTS "rpm_webhook_candidates_observed_at_idx"
  ON "rpm_webhook_candidates"("observed_at");
CREATE INDEX IF NOT EXISTS "rpm_webhook_candidates_status_idx"
  ON "rpm_webhook_candidates"("status");
CREATE INDEX IF NOT EXISTS "rpm_webhook_candidates_trip_id_idx"
  ON "rpm_webhook_candidates"("trip_id");

-- 4) Foreign keys
DO $$ BEGIN
  ALTER TABLE "rpm_webhook_candidates"
    ADD CONSTRAINT "rpm_webhook_candidates_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "rpm_webhook_candidates"
    ADD CONSTRAINT "rpm_webhook_candidates_trip_id_fkey"
    FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

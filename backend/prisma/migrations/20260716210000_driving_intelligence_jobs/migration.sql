-- Driving Intelligence V2 P18 — typed persistent job types

CREATE TYPE "DrivingIntelligenceJobType" AS ENUM (
  'DRIVING_NATIVE_EVENTS_INGEST',
  'DRIVING_EVENT_CONTEXT_ENRICH',
  'DRIVING_ROUTE_ENRICH',
  'DRIVING_IMPACT_COMPUTE',
  'DRIVING_MISUSE_RECONCILE',
  'DRIVING_ASSESSABILITY_COMPUTE',
  'DRIVING_ATTRIBUTION_RESOLVE',
  'DRIVING_DECISION_SUMMARY_COMPUTE',
  'RENTAL_DRIVING_ANALYSIS_RECOMPUTE',
  'DRIVING_HEALTH_IMPACT_PUBLISH',
  'DIMO_TRIP_SEGMENT_VALIDATE'
);

CREATE TYPE "DrivingIntelligenceJobStatus" AS ENUM (
  'PENDING',
  'ENQUEUED',
  'IN_PROGRESS',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TABLE "driving_intelligence_jobs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "trip_id" TEXT,
  "booking_id" TEXT,
  "analysis_run_id" TEXT NOT NULL,
  "job_type" "DrivingIntelligenceJobType" NOT NULL,
  "model_version" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "correlation_id" TEXT NOT NULL,
  "requested_at" TIMESTAMP(3) NOT NULL,
  "status" "DrivingIntelligenceJobStatus" NOT NULL DEFAULT 'PENDING',
  "bull_job_id" TEXT,
  "error_code" TEXT,
  "error_message" TEXT,
  "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "driving_intelligence_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "driving_intelligence_jobs_organization_id_idempotency_key_key"
  ON "driving_intelligence_jobs"("organization_id", "idempotency_key");

CREATE INDEX "driving_intelligence_jobs_organization_id_job_type_status_idx"
  ON "driving_intelligence_jobs"("organization_id", "job_type", "status");

CREATE INDEX "driving_intelligence_jobs_vehicle_id_requested_at_idx"
  ON "driving_intelligence_jobs"("vehicle_id", "requested_at");

CREATE INDEX "driving_intelligence_jobs_trip_id_job_type_idx"
  ON "driving_intelligence_jobs"("trip_id", "job_type");

CREATE INDEX "driving_intelligence_jobs_booking_id_job_type_idx"
  ON "driving_intelligence_jobs"("booking_id", "job_type");

CREATE INDEX "driving_intelligence_jobs_analysis_run_id_idx"
  ON "driving_intelligence_jobs"("analysis_run_id");

CREATE INDEX "driving_intelligence_jobs_correlation_id_idx"
  ON "driving_intelligence_jobs"("correlation_id");

ALTER TABLE "driving_intelligence_jobs"
  ADD CONSTRAINT "driving_intelligence_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driving_intelligence_jobs"
  ADD CONSTRAINT "driving_intelligence_jobs_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "driving_intelligence_jobs"
  ADD CONSTRAINT "driving_intelligence_jobs_trip_id_fkey"
  FOREIGN KEY ("trip_id") REFERENCES "vehicle_trips"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driving_intelligence_jobs"
  ADD CONSTRAINT "driving_intelligence_jobs_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "driving_intelligence_jobs"
  ADD CONSTRAINT "driving_intelligence_jobs_analysis_run_id_fkey"
  FOREIGN KEY ("analysis_run_id") REFERENCES "driving_analysis_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

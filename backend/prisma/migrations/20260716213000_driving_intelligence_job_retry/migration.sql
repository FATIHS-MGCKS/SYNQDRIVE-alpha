-- Driving Intelligence V2 P20 — job retry + dead-letter fields

ALTER TYPE "DrivingIntelligenceJobStatus" ADD VALUE 'DEAD_LETTER';

ALTER TABLE "driving_intelligence_jobs"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "max_attempts" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN "next_retry_at" TIMESTAMP(3),
  ADD COLUMN "last_attempt_at" TIMESTAMP(3),
  ADD COLUMN "dead_lettered_at" TIMESTAMP(3);

CREATE INDEX "driving_intelligence_jobs_status_next_retry_at_idx"
  ON "driving_intelligence_jobs"("status", "next_retry_at");

CREATE INDEX "driving_intelligence_jobs_organization_id_status_updated_at_idx"
  ON "driving_intelligence_jobs"("organization_id", "status", "updated_at");

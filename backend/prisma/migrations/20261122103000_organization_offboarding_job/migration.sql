-- P6D2: organization offboarding prepare job foundation (no execution workers).

CREATE TYPE "OrganizationOffboardingJobStatus" AS ENUM ('PREPARED', 'BLOCKED', 'FAILED', 'RETRYABLE', 'COMPLETED');

CREATE TABLE "organization_offboarding_jobs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_fingerprint" TEXT NOT NULL,
    "status" "OrganizationOffboardingJobStatus" NOT NULL DEFAULT 'PREPARED',
    "phase" TEXT NOT NULL DEFAULT 'PREPARE',
    "progress_json" JSONB,
    "preflight_snapshot" JSONB,
    "last_error_code" TEXT,
    "correlation_id" TEXT NOT NULL,
    "requested_by_user_id" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_offboarding_jobs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_offboarding_jobs_org_idempotency_key" ON "organization_offboarding_jobs"("organization_id", "idempotency_key");

CREATE INDEX "organization_offboarding_jobs_org_status_idx" ON "organization_offboarding_jobs"("organization_id", "status");

ALTER TABLE "organization_offboarding_jobs" ADD CONSTRAINT "organization_offboarding_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
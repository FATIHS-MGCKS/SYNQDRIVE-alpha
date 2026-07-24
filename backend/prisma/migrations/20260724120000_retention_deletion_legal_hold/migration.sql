-- Prompt 32: Retention, deletion, and legal hold per processing activity / data category

CREATE TYPE "ProcessingActivityRetentionClass" AS ENUM (
  'OPERATIONAL',
  'TELEMETRY',
  'ANALYTICS',
  'AUDIT_EVIDENCE',
  'LEGAL_EVIDENCE',
  'CUSTOMER_DATA',
  'FINANCIAL'
);

CREATE TYPE "RetentionStartEvent" AS ENUM (
  'PROCESSING_START',
  'PROCESSING_END',
  'CONSENT_WITHDRAWAL',
  'CONTRACT_END',
  'LAST_ACTIVITY',
  'MANUAL_ANCHOR'
);

CREATE TYPE "ProcessingActivityDeletionMethod" AS ENUM (
  'HARD_DELETE',
  'ANONYMIZE',
  'REDACT',
  'ARCHIVE_THEN_DELETE'
);

CREATE TYPE "ProcessingActivityDeletionJobStatus" AS ENUM (
  'PLANNED',
  'DRY_RUN_COMPLETED',
  'IN_PROGRESS',
  'COMPLETED',
  'PARTIAL_FAILURE',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE "ProcessingActivityDeletionStepTarget" AS ENUM (
  'POSTGRESQL',
  'CLICKHOUSE',
  'OBJECT_STORAGE',
  'REDIS_CACHE',
  'DERIVED_DATA'
);

CREATE TYPE "ProcessingActivityDeletionStepStatus" AS ENUM (
  'PENDING',
  'SKIPPED',
  'COMPLETED',
  'FAILED',
  'NOT_APPLICABLE'
);

CREATE TYPE "ProcessingActivityDeletionDecisionType" AS ENUM (
  'RETENTION_CONFIGURED',
  'RETENTION_EVALUATED',
  'DELETION_SCHEDULED',
  'DELETION_BLOCKED_LEGAL_HOLD',
  'DELETION_APPROVED',
  'DELETION_EXECUTED',
  'DELETION_DEFERRED',
  'REVOCATION_ASSESSED',
  'ANONYMIZATION_SELECTED',
  'DRY_RUN_COMPLETED'
);

CREATE TABLE "processing_activity_retention_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "data_category" "PrivacyProcessingDataCategory",
  "retention_class" "ProcessingActivityRetentionClass" NOT NULL,
  "retention_duration_days" INTEGER,
  "retention_start_event" "RetentionStartEvent" NOT NULL,
  "deletion_method" "ProcessingActivityDeletionMethod" NOT NULL,
  "anonymization_allowed" BOOLEAN NOT NULL DEFAULT false,
  "legal_hold" BOOLEAN NOT NULL DEFAULT false,
  "legal_hold_reason" TEXT,
  "legal_hold_owner_user_id" TEXT,
  "deletion_due_at" TIMESTAMP(3),
  "deletion_completed_at" TIMESTAMP(3),
  "is_configured" BOOLEAN NOT NULL DEFAULT false,
  "owner_user_id" TEXT,
  "review_date" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "processing_activity_retention_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processing_activity_retention_exceptions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "retention_policy_id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "extends_until" TIMESTAMP(3),
  "approved_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processing_activity_retention_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processing_activity_deletion_decisions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "retention_policy_id" TEXT,
  "decision_type" "ProcessingActivityDeletionDecisionType" NOT NULL,
  "actor_user_id" TEXT,
  "outcome" TEXT NOT NULL,
  "reason" TEXT,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processing_activity_deletion_decisions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processing_activity_deletion_jobs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "retention_policy_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "dry_run" BOOLEAN NOT NULL DEFAULT true,
  "status" "ProcessingActivityDeletionJobStatus" NOT NULL DEFAULT 'PLANNED',
  "trigger" TEXT NOT NULL DEFAULT 'manual',
  "batch_index" INTEGER NOT NULL DEFAULT 0,
  "deletion_due_at" TIMESTAMP(3),
  "partial_failure" BOOLEAN NOT NULL DEFAULT false,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "report" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "processing_activity_deletion_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processing_activity_deletion_job_steps" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "target" "ProcessingActivityDeletionStepTarget" NOT NULL,
  "status" "ProcessingActivityDeletionStepStatus" NOT NULL DEFAULT 'PENDING',
  "rows_affected" INTEGER,
  "error_code" TEXT,
  "error_message" TEXT,
  "executed_at" TIMESTAMP(3),
  "step_key" TEXT NOT NULL,
  "metadata" JSONB,
  CONSTRAINT "processing_activity_deletion_job_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processing_activity_deletion_evidence" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "job_id" TEXT NOT NULL,
  "evidence_type" TEXT NOT NULL,
  "evidence_value" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processing_activity_deletion_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "processing_activity_retention_policies_processing_activity_id_data_category_retention_class_key"
  ON "processing_activity_retention_policies"("processing_activity_id", "data_category", "retention_class");
CREATE INDEX "processing_activity_retention_policies_organization_id_processing_activity_id_idx"
  ON "processing_activity_retention_policies"("organization_id", "processing_activity_id");
CREATE INDEX "processing_activity_retention_policies_organization_id_legal_hold_idx"
  ON "processing_activity_retention_policies"("organization_id", "legal_hold");
CREATE INDEX "processing_activity_retention_policies_organization_id_deletion_due_at_idx"
  ON "processing_activity_retention_policies"("organization_id", "deletion_due_at");

CREATE INDEX "processing_activity_retention_exceptions_organization_id_retention_policy_id_idx"
  ON "processing_activity_retention_exceptions"("organization_id", "retention_policy_id");

CREATE INDEX "processing_activity_deletion_decisions_organization_id_processing_activity_id_created_at_idx"
  ON "processing_activity_deletion_decisions"("organization_id", "processing_activity_id", "created_at");

CREATE UNIQUE INDEX "processing_activity_deletion_jobs_idempotency_key_key"
  ON "processing_activity_deletion_jobs"("idempotency_key");
CREATE INDEX "processing_activity_deletion_jobs_organization_id_processing_activity_id_status_idx"
  ON "processing_activity_deletion_jobs"("organization_id", "processing_activity_id", "status");
CREATE INDEX "processing_activity_deletion_jobs_organization_id_created_at_idx"
  ON "processing_activity_deletion_jobs"("organization_id", "created_at");

CREATE UNIQUE INDEX "processing_activity_deletion_job_steps_job_id_target_step_key_key"
  ON "processing_activity_deletion_job_steps"("job_id", "target", "step_key");
CREATE INDEX "processing_activity_deletion_job_steps_organization_id_job_id_idx"
  ON "processing_activity_deletion_job_steps"("organization_id", "job_id");

CREATE INDEX "processing_activity_deletion_evidence_organization_id_job_id_idx"
  ON "processing_activity_deletion_evidence"("organization_id", "job_id");

ALTER TABLE "processing_activity_retention_policies"
  ADD CONSTRAINT "processing_activity_retention_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_retention_policies"
  ADD CONSTRAINT "processing_activity_retention_policies_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "processing_activity_retention_exceptions"
  ADD CONSTRAINT "processing_activity_retention_exceptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_retention_exceptions"
  ADD CONSTRAINT "processing_activity_retention_exceptions_retention_policy_id_fkey"
  FOREIGN KEY ("retention_policy_id") REFERENCES "processing_activity_retention_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "processing_activity_deletion_decisions"
  ADD CONSTRAINT "processing_activity_deletion_decisions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_deletion_decisions"
  ADD CONSTRAINT "processing_activity_deletion_decisions_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_deletion_decisions"
  ADD CONSTRAINT "processing_activity_deletion_decisions_retention_policy_id_fkey"
  FOREIGN KEY ("retention_policy_id") REFERENCES "processing_activity_retention_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "processing_activity_deletion_jobs"
  ADD CONSTRAINT "processing_activity_deletion_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_deletion_jobs"
  ADD CONSTRAINT "processing_activity_deletion_jobs_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_deletion_jobs"
  ADD CONSTRAINT "processing_activity_deletion_jobs_retention_policy_id_fkey"
  FOREIGN KEY ("retention_policy_id") REFERENCES "processing_activity_retention_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "processing_activity_deletion_job_steps"
  ADD CONSTRAINT "processing_activity_deletion_job_steps_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_deletion_job_steps"
  ADD CONSTRAINT "processing_activity_deletion_job_steps_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "processing_activity_deletion_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "processing_activity_deletion_evidence"
  ADD CONSTRAINT "processing_activity_deletion_evidence_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "processing_activity_deletion_evidence"
  ADD CONSTRAINT "processing_activity_deletion_evidence_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "processing_activity_deletion_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Additive Voice AI control-plane models (tenant provisioning metadata).
-- Rollback: DROP tables/enums in reverse dependency order (no changes to legacy voice_assistants columns).

CREATE TYPE "VoiceSubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED', 'CANCELLED');
CREATE TYPE "VoiceControlPlaneProvider" AS ENUM ('TWILIO', 'ELEVENLABS');
CREATE TYPE "VoiceProviderAccountType" AS ENUM ('PARENT', 'SUBACCOUNT', 'WORKSPACE');
CREATE TYPE "VoiceProviderAccountStatus" AS ENUM ('PENDING', 'ACTIVE', 'DEGRADED', 'SUSPENDED', 'ERROR', 'ARCHIVED');
CREATE TYPE "VoicePhoneNumberLifecycle" AS ENUM ('DRAFT', 'PROVISIONING', 'ACTIVE', 'SUSPENDED', 'RELEASED', 'ARCHIVED');
CREATE TYPE "VoicePhoneRegulatoryStatus" AS ENUM ('UNKNOWN', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "VoiceElevenLabsImportStatus" AS ENUM ('NOT_APPLICABLE', 'NOT_IMPORTED', 'IMPORTING', 'IMPORTED', 'FAILED');
CREATE TYPE "VoiceAgentDeploymentStatus" AS ENUM ('DRAFT', 'PROVISIONING', 'ACTIVE', 'FAILED', 'ROLLED_BACK');
CREATE TYPE "VoiceProvisioningJobType" AS ENUM (
  'TWILIO_SUBACCOUNT_CREATE',
  'TWILIO_NUMBER_SEARCH',
  'TWILIO_NUMBER_PURCHASE',
  'ELEVENLABS_AGENT_CREATE',
  'ELEVENLABS_AGENT_UPDATE',
  'ELEVENLABS_NUMBER_IMPORT',
  'VOICE_ACTIVATION_ORCHESTRATION'
);
CREATE TYPE "VoiceProvisioningJobStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED', 'DEAD_LETTER');
CREATE TYPE "VoiceProvisioningErrorClass" AS ENUM ('TRANSIENT', 'PROVIDER', 'CONFIGURATION', 'PERMISSION', 'BILLING', 'UNKNOWN');

CREATE TABLE "voice_subscriptions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "plan_code" TEXT NOT NULL,
  "plan_reference" TEXT,
  "status" "VoiceSubscriptionStatus" NOT NULL DEFAULT 'PENDING',
  "current_period_start" TIMESTAMP(3),
  "current_period_end" TIMESTAMP(3),
  "activated_at" TIMESTAMP(3),
  "suspended_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_provider_accounts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "provider" "VoiceControlPlaneProvider" NOT NULL,
  "account_type" "VoiceProviderAccountType" NOT NULL,
  "masked_external_ref" TEXT NOT NULL,
  "secret_ref" TEXT,
  "region" TEXT,
  "edge" TEXT,
  "status" "VoiceProviderAccountStatus" NOT NULL DEFAULT 'PENDING',
  "last_health_check_at" TIMESTAMP(3),
  "last_synced_at" TIMESTAMP(3),
  "health_message" TEXT,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_provider_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_phone_numbers" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "provider_account_id" TEXT NOT NULL,
  "masked_phone_number" TEXT NOT NULL,
  "protected_e164" TEXT,
  "protected_external_ref" TEXT,
  "e164_digest" TEXT,
  "external_ref_digest" TEXT,
  "region" TEXT,
  "capabilities" JSONB,
  "lifecycle" "VoicePhoneNumberLifecycle" NOT NULL DEFAULT 'DRAFT',
  "regulatory_status" "VoicePhoneRegulatoryStatus" NOT NULL DEFAULT 'UNKNOWN',
  "elevenlabs_import_status" "VoiceElevenLabsImportStatus" NOT NULL DEFAULT 'NOT_IMPORTED',
  "voice_assistant_id" TEXT,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_phone_numbers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_agent_deployments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "voice_assistant_id" TEXT NOT NULL,
  "provider" "VoiceControlPlaneProvider" NOT NULL,
  "masked_external_ref" TEXT,
  "protected_external_ref" TEXT,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" "VoiceAgentDeploymentStatus" NOT NULL DEFAULT 'DRAFT',
  "config_hash" TEXT,
  "activated_version" INTEGER,
  "previous_version" INTEGER,
  "provisioned_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "rolled_back_at" TIMESTAMP(3),
  "created_by_user_id" TEXT,
  "updated_by_user_id" TEXT,
  "archived_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_agent_deployments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voice_provisioning_jobs" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "job_type" "VoiceProvisioningJobType" NOT NULL,
  "status" "VoiceProvisioningJobStatus" NOT NULL DEFAULT 'PENDING',
  "idempotency_key" TEXT NOT NULL,
  "current_step" TEXT,
  "progress_pct" INTEGER,
  "error_class" "VoiceProvisioningErrorClass",
  "error_message" TEXT,
  "retry_count" INTEGER NOT NULL DEFAULT 0,
  "payload" JSONB,
  "voice_assistant_id" TEXT,
  "provider_account_id" TEXT,
  "phone_number_id" TEXT,
  "deployment_id" TEXT,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "failed_at" TIMESTAMP(3),
  "cancelled_at" TIMESTAMP(3),
  "archived_at" TIMESTAMP(3),
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_provisioning_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "voice_subscriptions_organization_id_status_idx" ON "voice_subscriptions"("organization_id", "status");
CREATE INDEX "voice_subscriptions_organization_id_archived_at_idx" ON "voice_subscriptions"("organization_id", "archived_at");

CREATE UNIQUE INDEX "voice_provider_accounts_organization_id_provider_account_type_key"
  ON "voice_provider_accounts"("organization_id", "provider", "account_type");
CREATE INDEX "voice_provider_accounts_organization_id_status_idx" ON "voice_provider_accounts"("organization_id", "status");
CREATE INDEX "voice_provider_accounts_provider_status_idx" ON "voice_provider_accounts"("provider", "status");

CREATE UNIQUE INDEX "voice_phone_numbers_e164_digest_key" ON "voice_phone_numbers"("e164_digest");
CREATE UNIQUE INDEX "voice_phone_numbers_external_ref_digest_key" ON "voice_phone_numbers"("external_ref_digest");
CREATE INDEX "voice_phone_numbers_organization_id_lifecycle_idx" ON "voice_phone_numbers"("organization_id", "lifecycle");
CREATE INDEX "voice_phone_numbers_provider_account_id_idx" ON "voice_phone_numbers"("provider_account_id");
CREATE INDEX "voice_phone_numbers_voice_assistant_id_idx" ON "voice_phone_numbers"("voice_assistant_id");
CREATE INDEX "voice_phone_numbers_organization_id_archived_at_idx" ON "voice_phone_numbers"("organization_id", "archived_at");

CREATE INDEX "voice_agent_deployments_organization_id_voice_assistant_id_status_idx"
  ON "voice_agent_deployments"("organization_id", "voice_assistant_id", "status");
CREATE INDEX "voice_agent_deployments_voice_assistant_id_version_idx"
  ON "voice_agent_deployments"("voice_assistant_id", "version");
CREATE INDEX "voice_agent_deployments_organization_id_archived_at_idx"
  ON "voice_agent_deployments"("organization_id", "archived_at");

CREATE UNIQUE INDEX "voice_provisioning_jobs_organization_id_idempotency_key_key"
  ON "voice_provisioning_jobs"("organization_id", "idempotency_key");
CREATE INDEX "voice_provisioning_jobs_organization_id_job_type_status_idx"
  ON "voice_provisioning_jobs"("organization_id", "job_type", "status");
CREATE INDEX "voice_provisioning_jobs_status_updated_at_idx" ON "voice_provisioning_jobs"("status", "updated_at");
CREATE INDEX "voice_provisioning_jobs_organization_id_archived_at_idx"
  ON "voice_provisioning_jobs"("organization_id", "archived_at");

-- At most one non-archived ACTIVE subscription per tenant.
CREATE UNIQUE INDEX "voice_subscriptions_one_active_per_org_idx"
  ON "voice_subscriptions"("organization_id")
  WHERE "status" = 'ACTIVE' AND "archived_at" IS NULL;

ALTER TABLE "voice_subscriptions"
  ADD CONSTRAINT "voice_subscriptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_provider_accounts"
  ADD CONSTRAINT "voice_provider_accounts_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_phone_numbers"
  ADD CONSTRAINT "voice_phone_numbers_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_phone_numbers"
  ADD CONSTRAINT "voice_phone_numbers_provider_account_id_fkey"
  FOREIGN KEY ("provider_account_id") REFERENCES "voice_provider_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voice_phone_numbers"
  ADD CONSTRAINT "voice_phone_numbers_voice_assistant_id_fkey"
  FOREIGN KEY ("voice_assistant_id") REFERENCES "voice_assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "voice_agent_deployments"
  ADD CONSTRAINT "voice_agent_deployments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_agent_deployments"
  ADD CONSTRAINT "voice_agent_deployments_voice_assistant_id_fkey"
  FOREIGN KEY ("voice_assistant_id") REFERENCES "voice_assistants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "voice_provisioning_jobs"
  ADD CONSTRAINT "voice_provisioning_jobs_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "voice_provisioning_jobs"
  ADD CONSTRAINT "voice_provisioning_jobs_voice_assistant_id_fkey"
  FOREIGN KEY ("voice_assistant_id") REFERENCES "voice_assistants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

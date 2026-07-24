-- Versioned policy lifecycle for ProcessingActivity, LegalBasisAssessment, EnforcementPolicy (Prompt 11)

-- CreateEnum
CREATE TYPE "PrivacyPolicyLifecycleStatus" AS ENUM (
  'DRAFT',
  'IN_REVIEW',
  'APPROVED',
  'SCHEDULED',
  'ACTIVE',
  'SUSPENDED',
  'SUPERSEDED',
  'REVOKED',
  'EXPIRED',
  'REJECTED'
);

CREATE TYPE "PrivacyPolicyLifecycleEventType" AS ENUM (
  'SUBMITTED_FOR_REVIEW',
  'REQUESTED_CHANGES',
  'APPROVED',
  'REJECTED',
  'SCHEDULED',
  'ACTIVATED',
  'SUSPENDED',
  'RESUMED',
  'REVOKED',
  'SUPERSEDED',
  'EXPIRED',
  'VERSION_CREATED'
);

-- ProcessingActivity: add versioning + lifecycle columns
ALTER TABLE "processing_activities"
  ADD COLUMN IF NOT EXISTS "policy_family_id" TEXT,
  ADD COLUMN IF NOT EXISTS "version_number" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "is_current_version" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "status_new" "PrivacyPolicyLifecycleStatus",
  ADD COLUMN IF NOT EXISTS "superseded_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "valid_from" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "revocation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "suspension_reason" TEXT;

UPDATE "processing_activities"
SET "policy_family_id" = "id"
WHERE "policy_family_id" IS NULL;

UPDATE "processing_activities"
SET "status_new" = CASE "status"::text
  WHEN 'ARCHIVED' THEN 'SUPERSEDED'::"PrivacyPolicyLifecycleStatus"
  WHEN 'DRAFT' THEN 'DRAFT'::"PrivacyPolicyLifecycleStatus"
  WHEN 'ACTIVE' THEN 'ACTIVE'::"PrivacyPolicyLifecycleStatus"
  WHEN 'SUSPENDED' THEN 'SUSPENDED'::"PrivacyPolicyLifecycleStatus"
  ELSE 'DRAFT'::"PrivacyPolicyLifecycleStatus"
END
WHERE "status_new" IS NULL;

ALTER TABLE "processing_activities"
  ALTER COLUMN "policy_family_id" SET NOT NULL,
  ALTER COLUMN "status_new" SET NOT NULL;

ALTER TABLE "processing_activities" DROP COLUMN "status";
ALTER TABLE "processing_activities" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "processing_activities" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE IF EXISTS "ProcessingActivityStatus";

-- LegalBasisAssessment: migrate status enum
ALTER TABLE "legal_basis_assessments"
  ADD COLUMN IF NOT EXISTS "status_new" "PrivacyPolicyLifecycleStatus",
  ADD COLUMN IF NOT EXISTS "superseded_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revocation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "suspension_reason" TEXT;

UPDATE "legal_basis_assessments"
SET "status_new" = CASE "status"::text
  WHEN 'UNDER_REVIEW' THEN 'IN_REVIEW'::"PrivacyPolicyLifecycleStatus"
  WHEN 'DRAFT' THEN 'DRAFT'::"PrivacyPolicyLifecycleStatus"
  WHEN 'APPROVED' THEN 'ACTIVE'::"PrivacyPolicyLifecycleStatus"
  WHEN 'REJECTED' THEN 'REJECTED'::"PrivacyPolicyLifecycleStatus"
  WHEN 'SUPERSEDED' THEN 'SUPERSEDED'::"PrivacyPolicyLifecycleStatus"
  WHEN 'EXPIRED' THEN 'EXPIRED'::"PrivacyPolicyLifecycleStatus"
  ELSE 'DRAFT'::"PrivacyPolicyLifecycleStatus"
END
WHERE "status_new" IS NULL;

UPDATE "legal_basis_assessments"
SET "activated_at" = COALESCE("approved_at", "updated_at")
WHERE "status_new" = 'ACTIVE' AND "activated_at" IS NULL;

ALTER TABLE "legal_basis_assessments"
  ALTER COLUMN "status_new" SET NOT NULL;

ALTER TABLE "legal_basis_assessments" DROP COLUMN "status";
ALTER TABLE "legal_basis_assessments" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "legal_basis_assessments" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE IF EXISTS "LegalBasisAssessmentStatus";

-- EnforcementPolicy: migrate status enum + lifecycle columns
ALTER TABLE "enforcement_policies"
  ADD COLUMN IF NOT EXISTS "status_new" "PrivacyPolicyLifecycleStatus",
  ADD COLUMN IF NOT EXISTS "superseded_by_id" TEXT,
  ADD COLUMN IF NOT EXISTS "valid_from" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "activated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "suspended_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revoked_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "revocation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "suspension_reason" TEXT;

UPDATE "enforcement_policies"
SET "status_new" = CASE "status"::text
  WHEN 'DISABLED' THEN 'SUSPENDED'::"PrivacyPolicyLifecycleStatus"
  WHEN 'DRAFT' THEN 'DRAFT'::"PrivacyPolicyLifecycleStatus"
  WHEN 'ACTIVE' THEN 'ACTIVE'::"PrivacyPolicyLifecycleStatus"
  ELSE 'DRAFT'::"PrivacyPolicyLifecycleStatus"
END
WHERE "status_new" IS NULL;

UPDATE "enforcement_policies"
SET "activated_at" = "updated_at"
WHERE "status_new" = 'ACTIVE' AND "activated_at" IS NULL;

UPDATE "enforcement_policies"
SET "suspended_at" = "updated_at"
WHERE "status_new" = 'SUSPENDED' AND "suspended_at" IS NULL;

ALTER TABLE "enforcement_policies"
  ALTER COLUMN "status_new" SET NOT NULL;

ALTER TABLE "enforcement_policies" DROP COLUMN "status";
ALTER TABLE "enforcement_policies" RENAME COLUMN "status_new" TO "status";
ALTER TABLE "enforcement_policies" ALTER COLUMN "status" SET DEFAULT 'DRAFT';

DROP TYPE IF EXISTS "EnforcementPolicyStatus";

-- Drop old unique constraint on processing_activities (organization_id, activity_code)
DROP INDEX IF EXISTS "processing_activities_organization_id_activity_code_key";

-- CreateIndex / constraints
CREATE UNIQUE INDEX IF NOT EXISTS "processing_activities_policy_family_id_version_number_key"
  ON "processing_activities"("policy_family_id", "version_number");

CREATE UNIQUE INDEX IF NOT EXISTS "processing_activities_organization_id_activity_code_version_number_key"
  ON "processing_activities"("organization_id", "activity_code", "version_number");

CREATE INDEX IF NOT EXISTS "processing_activities_policy_family_id_is_current_version_idx"
  ON "processing_activities"("policy_family_id", "is_current_version");

-- Partial unique: one ACTIVE per policy family
CREATE UNIQUE INDEX IF NOT EXISTS "processing_activities_single_active_per_family_key"
  ON "processing_activities"("policy_family_id")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "legal_basis_assessments_single_active_per_family_key"
  ON "legal_basis_assessments"("policy_family_id")
  WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX IF NOT EXISTS "enforcement_policies_single_active_per_family_key"
  ON "enforcement_policies"("policy_family_id")
  WHERE "status" = 'ACTIVE';

-- Supersession foreign keys
ALTER TABLE "processing_activities"
  ADD CONSTRAINT "processing_activities_superseded_by_id_fkey"
  FOREIGN KEY ("superseded_by_id") REFERENCES "processing_activities"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "legal_basis_assessments"
  ADD CONSTRAINT "legal_basis_assessments_superseded_by_id_fkey"
  FOREIGN KEY ("superseded_by_id") REFERENCES "legal_basis_assessments"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "enforcement_policies"
  ADD CONSTRAINT "enforcement_policies_superseded_by_id_fkey"
  FOREIGN KEY ("superseded_by_id") REFERENCES "enforcement_policies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Lifecycle event tables (append-only)
CREATE TABLE IF NOT EXISTS "processing_activity_lifecycle_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "event_type" "PrivacyPolicyLifecycleEventType" NOT NULL,
  "previous_status" "PrivacyPolicyLifecycleStatus",
  "new_status" "PrivacyPolicyLifecycleStatus" NOT NULL,
  "actor_user_id" TEXT,
  "actor_type" "AuthorizationActorType" NOT NULL DEFAULT 'SYSTEM',
  "reason" TEXT,
  "superseded_by_id" TEXT,
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "processing_activity_lifecycle_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "legal_basis_assessment_lifecycle_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "legal_basis_assessment_id" TEXT NOT NULL,
  "event_type" "PrivacyPolicyLifecycleEventType" NOT NULL,
  "previous_status" "PrivacyPolicyLifecycleStatus",
  "new_status" "PrivacyPolicyLifecycleStatus" NOT NULL,
  "actor_user_id" TEXT,
  "actor_type" "AuthorizationActorType" NOT NULL DEFAULT 'SYSTEM',
  "reason" TEXT,
  "superseded_by_id" TEXT,
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "legal_basis_assessment_lifecycle_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "enforcement_policy_lifecycle_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "enforcement_policy_id" TEXT NOT NULL,
  "event_type" "PrivacyPolicyLifecycleEventType" NOT NULL,
  "previous_status" "PrivacyPolicyLifecycleStatus",
  "new_status" "PrivacyPolicyLifecycleStatus" NOT NULL,
  "actor_user_id" TEXT,
  "actor_type" "AuthorizationActorType" NOT NULL DEFAULT 'SYSTEM',
  "reason" TEXT,
  "superseded_by_id" TEXT,
  "valid_from" TIMESTAMP(3),
  "valid_until" TIMESTAMP(3),
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "enforcement_policy_lifecycle_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "processing_activity_lifecycle_events"
  ADD CONSTRAINT "processing_activity_lifecycle_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "processing_activity_lifecycle_events"
  ADD CONSTRAINT "processing_activity_lifecycle_events_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_basis_assessment_lifecycle_events"
  ADD CONSTRAINT "legal_basis_assessment_lifecycle_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_basis_assessment_lifecycle_events"
  ADD CONSTRAINT "legal_basis_assessment_lifecycle_events_legal_basis_assessment_id_fkey"
  FOREIGN KEY ("legal_basis_assessment_id") REFERENCES "legal_basis_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enforcement_policy_lifecycle_events"
  ADD CONSTRAINT "enforcement_policy_lifecycle_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enforcement_policy_lifecycle_events"
  ADD CONSTRAINT "enforcement_policy_lifecycle_events_enforcement_policy_id_fkey"
  FOREIGN KEY ("enforcement_policy_id") REFERENCES "enforcement_policies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "processing_activity_lifecycle_events_org_created_idx"
  ON "processing_activity_lifecycle_events"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "processing_activity_lifecycle_events_activity_created_idx"
  ON "processing_activity_lifecycle_events"("processing_activity_id", "created_at");

CREATE INDEX IF NOT EXISTS "legal_basis_assessment_lifecycle_events_org_created_idx"
  ON "legal_basis_assessment_lifecycle_events"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "legal_basis_assessment_lifecycle_events_assessment_created_idx"
  ON "legal_basis_assessment_lifecycle_events"("legal_basis_assessment_id", "created_at");

CREATE INDEX IF NOT EXISTS "enforcement_policy_lifecycle_events_org_created_idx"
  ON "enforcement_policy_lifecycle_events"("organization_id", "created_at");

CREATE INDEX IF NOT EXISTS "enforcement_policy_lifecycle_events_policy_created_idx"
  ON "enforcement_policy_lifecycle_events"("enforcement_policy_id", "created_at");

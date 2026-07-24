-- Prompt 31: Processor, DPA, subprocessor, and third-country transfer management

CREATE TYPE "ProcessorPartyRole" AS ENUM (
  'CONTROLLER',
  'PROCESSOR',
  'SUBPROCESSOR',
  'JOINT_CONTROLLER',
  'INDEPENDENT_RECIPIENT'
);

CREATE TYPE "DpaSubprocessorStatus" AS ENUM (
  'DRAFT',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'REVOKED',
  'EXPIRED'
);

CREATE TYPE "TransferAssessmentStatus" AS ENUM (
  'NOT_ASSESSED',
  'ASSESSED',
  'REQUIRES_REVIEW'
);

CREATE TYPE "DpaAuditEventType" AS ENUM (
  'CREATED',
  'UPDATED',
  'ACTIVATED',
  'TERMINATED',
  'EXPIRED',
  'SUBPROCESSOR_ADDED',
  'SUBPROCESSOR_CHANGED',
  'SUBPROCESSOR_REVIEW_REQUIRED',
  'TRANSFER_UPDATED',
  'SHARING_LINKED',
  'VERSION_CREATED'
);

-- Migrate DataTransferMechanism enum
CREATE TYPE "DataTransferMechanism_new" AS ENUM (
  'NONE_REQUIRED',
  'ADEQUACY_DECISION',
  'STANDARD_CONTRACTUAL_CLAUSES',
  'BINDING_CORPORATE_RULES',
  'OTHER_APPROVED_MECHANISM',
  'NOT_ASSESSED'
);

ALTER TABLE "data_sharing_authorizations"
  ALTER COLUMN "transfer_mechanism" TYPE "DataTransferMechanism_new"
  USING (
    CASE "transfer_mechanism"::text
      WHEN 'EXPLICIT_CONSENT' THEN 'OTHER_APPROVED_MECHANISM'
      WHEN 'OTHER_SAFEGUARD' THEN 'OTHER_APPROVED_MECHANISM'
      WHEN 'ADEQUACY_DECISION' THEN 'ADEQUACY_DECISION'
      WHEN 'STANDARD_CONTRACTUAL_CLAUSES' THEN 'STANDARD_CONTRACTUAL_CLAUSES'
      WHEN 'BINDING_CORPORATE_RULES' THEN 'BINDING_CORPORATE_RULES'
      ELSE NULL
    END
  )::"DataTransferMechanism_new";

DROP TYPE "DataTransferMechanism";
ALTER TYPE "DataTransferMechanism_new" RENAME TO "DataTransferMechanism";

-- Extend data_processing_agreements
ALTER TABLE "data_processing_agreements" RENAME COLUMN "processor_label" TO "processor_name";
ALTER TABLE "data_processing_agreements" RENAME COLUMN "agreement_ref" TO "contract_reference";

ALTER TABLE "data_processing_agreements"
  ADD COLUMN IF NOT EXISTS "policy_family_id" TEXT,
  ADD COLUMN IF NOT EXISTS "version_number" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "is_current_version" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "processor_role" "ProcessorPartyRole" NOT NULL DEFAULT 'PROCESSOR',
  ADD COLUMN IF NOT EXISTS "review_date" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "owner_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "safeguards" TEXT,
  ADD COLUMN IF NOT EXISTS "primary_transfer_mechanism" "DataTransferMechanism",
  ADD COLUMN IF NOT EXISTS "transfer_assessment_status" "TransferAssessmentStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  ADD COLUMN IF NOT EXISTS "document_storage_ref" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_kind" TEXT;

UPDATE "data_processing_agreements"
SET "policy_family_id" = "id"
WHERE "policy_family_id" IS NULL;

ALTER TABLE "data_processing_agreements"
  ALTER COLUMN "policy_family_id" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "data_processing_agreements_policy_family_id_version_number_key"
  ON "data_processing_agreements"("policy_family_id", "version_number");

CREATE INDEX IF NOT EXISTS "data_processing_agreements_organization_id_status_is_current_version_idx"
  ON "data_processing_agreements"("organization_id", "status", "is_current_version");

CREATE INDEX IF NOT EXISTS "data_processing_agreements_organization_id_review_date_idx"
  ON "data_processing_agreements"("organization_id", "review_date");

CREATE TABLE "data_processing_agreement_activities" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agreement_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_processing_agreement_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_processing_agreement_subprocessors" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agreement_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "processor_role" "ProcessorPartyRole" NOT NULL DEFAULT 'SUBPROCESSOR',
  "data_location_country" TEXT,
  "processing_partner_country" TEXT,
  "status" "DpaSubprocessorStatus" NOT NULL DEFAULT 'DRAFT',
  "effective_from" TIMESTAMP(3),
  "effective_until" TIMESTAMP(3),
  "review_required" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_processing_agreement_subprocessors_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_processing_agreement_data_locations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agreement_id" TEXT NOT NULL,
  "country_code" TEXT NOT NULL,
  "region_label" TEXT,
  "is_primary" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_processing_agreement_data_locations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_processing_agreement_transfer_countries" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agreement_id" TEXT NOT NULL,
  "country_code" TEXT NOT NULL,
  "transfer_mechanism" "DataTransferMechanism" NOT NULL,
  "assessment_status" "TransferAssessmentStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
  "safeguards" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "data_processing_agreement_transfer_countries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_processing_agreement_sharing_links" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agreement_id" TEXT NOT NULL,
  "data_sharing_authorization_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_processing_agreement_sharing_links_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_processing_agreement_audit_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "agreement_id" TEXT NOT NULL,
  "event_type" "DpaAuditEventType" NOT NULL,
  "actor_user_id" TEXT,
  "summary" TEXT NOT NULL,
  "metadata" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_processing_agreement_audit_events_pkey" PRIMARY KEY ("id")
);

-- Backfill activity links from legacy processing_activity_id
INSERT INTO "data_processing_agreement_activities" ("id", "organization_id", "agreement_id", "processing_activity_id")
SELECT gen_random_uuid()::text, "organization_id", "id", "processing_activity_id"
FROM "data_processing_agreements"
WHERE "processing_activity_id" IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE UNIQUE INDEX "data_processing_agreement_activities_agreement_id_processing_activity_id_key"
  ON "data_processing_agreement_activities"("agreement_id", "processing_activity_id");
CREATE INDEX "data_processing_agreement_activities_organization_id_processing_activity_id_idx"
  ON "data_processing_agreement_activities"("organization_id", "processing_activity_id");

CREATE INDEX "data_processing_agreement_subprocessors_organization_id_agreement_id_status_idx"
  ON "data_processing_agreement_subprocessors"("organization_id", "agreement_id", "status");

CREATE UNIQUE INDEX "data_processing_agreement_data_locations_agreement_id_country_code_region_label_key"
  ON "data_processing_agreement_data_locations"("agreement_id", "country_code", "region_label");
CREATE INDEX "data_processing_agreement_data_locations_organization_id_agreement_id_idx"
  ON "data_processing_agreement_data_locations"("organization_id", "agreement_id");

CREATE UNIQUE INDEX "data_processing_agreement_transfer_countries_agreement_id_country_code_key"
  ON "data_processing_agreement_transfer_countries"("agreement_id", "country_code");
CREATE INDEX "data_processing_agreement_transfer_countries_organization_id_agreement_id_idx"
  ON "data_processing_agreement_transfer_countries"("organization_id", "agreement_id");

CREATE UNIQUE INDEX "data_processing_agreement_sharing_links_agreement_id_data_sharing_authorization_id_key"
  ON "data_processing_agreement_sharing_links"("agreement_id", "data_sharing_authorization_id");
CREATE INDEX "data_processing_agreement_sharing_links_organization_id_data_sharing_authorization_id_idx"
  ON "data_processing_agreement_sharing_links"("organization_id", "data_sharing_authorization_id");

CREATE INDEX "data_processing_agreement_audit_events_organization_id_agreement_id_created_at_idx"
  ON "data_processing_agreement_audit_events"("organization_id", "agreement_id", "created_at");

ALTER TABLE "data_processing_agreement_activities"
  ADD CONSTRAINT "data_processing_agreement_activities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_processing_agreement_activities"
  ADD CONSTRAINT "data_processing_agreement_activities_agreement_id_fkey"
  FOREIGN KEY ("agreement_id") REFERENCES "data_processing_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_processing_agreement_activities"
  ADD CONSTRAINT "data_processing_agreement_activities_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_processing_agreement_subprocessors"
  ADD CONSTRAINT "data_processing_agreement_subprocessors_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_processing_agreement_subprocessors"
  ADD CONSTRAINT "data_processing_agreement_subprocessors_agreement_id_fkey"
  FOREIGN KEY ("agreement_id") REFERENCES "data_processing_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_processing_agreement_data_locations"
  ADD CONSTRAINT "data_processing_agreement_data_locations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_processing_agreement_data_locations"
  ADD CONSTRAINT "data_processing_agreement_data_locations_agreement_id_fkey"
  FOREIGN KEY ("agreement_id") REFERENCES "data_processing_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_processing_agreement_transfer_countries"
  ADD CONSTRAINT "data_processing_agreement_transfer_countries_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_processing_agreement_transfer_countries"
  ADD CONSTRAINT "data_processing_agreement_transfer_countries_agreement_id_fkey"
  FOREIGN KEY ("agreement_id") REFERENCES "data_processing_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_processing_agreement_sharing_links"
  ADD CONSTRAINT "data_processing_agreement_sharing_links_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_processing_agreement_sharing_links"
  ADD CONSTRAINT "data_processing_agreement_sharing_links_agreement_id_fkey"
  FOREIGN KEY ("agreement_id") REFERENCES "data_processing_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_processing_agreement_sharing_links"
  ADD CONSTRAINT "data_processing_agreement_sharing_links_data_sharing_authorization_id_fkey"
  FOREIGN KEY ("data_sharing_authorization_id") REFERENCES "data_sharing_authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_processing_agreement_audit_events"
  ADD CONSTRAINT "data_processing_agreement_audit_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "data_processing_agreement_audit_events"
  ADD CONSTRAINT "data_processing_agreement_audit_events_agreement_id_fkey"
  FOREIGN KEY ("agreement_id") REFERENCES "data_processing_agreements"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

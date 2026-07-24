-- Prompt 8: Consent, ProviderAccessGrant, DataSharingAuthorization domain separation

-- CreateEnum
CREATE TYPE "ConsentInteractionChannel" AS ENUM ('IN_PERSON', 'EMAIL', 'APP', 'PHONE', 'WEB_FORM', 'API', 'OTHER');
CREATE TYPE "DataSharingRecipientRole" AS ENUM ('PROCESSOR', 'CONTROLLER', 'PARTNER', 'INSURER', 'OTHER');
CREATE TYPE "DataTransferMechanism" AS ENUM ('ADEQUACY_DECISION', 'STANDARD_CONTRACTUAL_CLAUSES', 'BINDING_CORPORATE_RULES', 'EXPLICIT_CONSENT', 'OTHER_SAFEGUARD');

-- data_subject_consents: reshape columns
ALTER TABLE "data_subject_consents"
  ADD COLUMN IF NOT EXISTS "data_subject_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "purpose" "PrivacyProcessingPurpose",
  ADD COLUMN IF NOT EXISTS "consent_text_version" TEXT,
  ADD COLUMN IF NOT EXISTS "privacy_notice_version" TEXT,
  ADD COLUMN IF NOT EXISTS "consent_status" "DataSubjectConsentStatus",
  ADD COLUMN IF NOT EXISTS "granted_channel" "ConsentInteractionChannel",
  ADD COLUMN IF NOT EXISTS "evidence_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "withdrawal_channel" "ConsentInteractionChannel";

UPDATE "data_subject_consents"
SET
  "data_subject_reference" = COALESCE("subject_ref_id", 'legacy-unresolved'),
  "consent_status" = COALESCE("status", 'PENDING'::"DataSubjectConsentStatus"),
  "consent_text_version" = COALESCE("consent_text_version", 'legacy'),
  "privacy_notice_version" = COALESCE("privacy_notice_version", 'legacy'),
  "purpose" = COALESCE("purpose", 'CUSTOMER_CONSENT'::"PrivacyProcessingPurpose")
WHERE "data_subject_reference" IS NULL OR "consent_status" IS NULL;

ALTER TABLE "data_subject_consents"
  ALTER COLUMN "data_subject_reference" SET NOT NULL,
  ALTER COLUMN "consent_text_version" SET NOT NULL,
  ALTER COLUMN "privacy_notice_version" SET NOT NULL,
  ALTER COLUMN "consent_status" SET NOT NULL,
  ALTER COLUMN "purpose" SET NOT NULL;

ALTER TABLE "data_subject_consents"
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "subject_ref_id",
  DROP COLUMN IF EXISTS "recorded_by_user_id",
  DROP COLUMN IF EXISTS "legal_basis_assessment_id";

DROP INDEX IF EXISTS "data_subject_consents_organization_id_status_idx";
DROP INDEX IF EXISTS "data_subject_consents_subject_type_subject_ref_id_idx";
CREATE INDEX IF NOT EXISTS "data_subject_consents_organization_id_consent_status_idx"
  ON "data_subject_consents"("organization_id", "consent_status");
CREATE INDEX IF NOT EXISTS "data_subject_consents_subject_type_data_subject_reference_idx"
  ON "data_subject_consents"("subject_type", "data_subject_reference");

-- provider_access_grants: reshape columns
ALTER TABLE "provider_access_grants"
  ADD COLUMN IF NOT EXISTS "provider_account_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_grant_reference" TEXT,
  ADD COLUMN IF NOT EXISTS "provider_status" "ProviderAccessGrantStatus",
  ADD COLUMN IF NOT EXISTS "last_verified_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "technical_owner_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "linked_vehicle_count" INTEGER NOT NULL DEFAULT 0;

UPDATE "provider_access_grants"
SET
  "provider_status" = COALESCE("status", 'PENDING'::"ProviderAccessGrantStatus"),
  "provider_grant_reference" = COALESCE("provider_grant_reference", "proof_reference"),
  "technical_owner_user_id" = COALESCE("technical_owner_user_id", "granted_by_user_id")
WHERE "provider_status" IS NULL;

ALTER TABLE "provider_access_grants"
  ALTER COLUMN "provider_status" SET NOT NULL;

ALTER TABLE "provider_access_grants"
  DROP COLUMN IF EXISTS "status",
  DROP COLUMN IF EXISTS "granted_by_user_id",
  DROP COLUMN IF EXISTS "proof_reference";

DROP INDEX IF EXISTS "provider_access_grants_organization_id_status_idx";
DROP INDEX IF EXISTS "provider_access_grants_vehicle_id_provider_status_idx";
CREATE INDEX IF NOT EXISTS "provider_access_grants_organization_id_provider_status_idx"
  ON "provider_access_grants"("organization_id", "provider_status");
CREATE INDEX IF NOT EXISTS "provider_access_grants_vehicle_id_provider_provider_status_idx"
  ON "provider_access_grants"("vehicle_id", "provider", "provider_status");

-- data_sharing_authorizations: reshape columns
ALTER TABLE "data_sharing_authorizations"
  ADD COLUMN IF NOT EXISTS "recipient" TEXT,
  ADD COLUMN IF NOT EXISTS "recipient_role" "DataSharingRecipientRole",
  ADD COLUMN IF NOT EXISTS "purpose" "PrivacyProcessingPurpose",
  ADD COLUMN IF NOT EXISTS "legal_basis_assessment_id" TEXT,
  ADD COLUMN IF NOT EXISTS "transfer_country" TEXT,
  ADD COLUMN IF NOT EXISTS "transfer_mechanism" "DataTransferMechanism",
  ADD COLUMN IF NOT EXISTS "valid_from" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "valid_until" TIMESTAMP(3);

UPDATE "data_sharing_authorizations"
SET
  "recipient" = COALESCE("recipient", "partner_label", 'legacy-recipient'),
  "recipient_role" = COALESCE("recipient_role", 'OTHER'::"DataSharingRecipientRole"),
  "purpose" = COALESCE("purpose", 'PARTNER_SERVICE'::"PrivacyProcessingPurpose"),
  "valid_from" = COALESCE("valid_from", "authorized_at"),
  "valid_until" = COALESCE("valid_until", "expires_at")
WHERE "recipient" IS NULL;

ALTER TABLE "data_sharing_authorizations"
  ALTER COLUMN "recipient" SET NOT NULL,
  ALTER COLUMN "recipient_role" SET NOT NULL,
  ALTER COLUMN "purpose" SET NOT NULL;

ALTER TABLE "data_sharing_authorizations"
  DROP COLUMN IF EXISTS "partner_label",
  DROP COLUMN IF EXISTS "destination_summary",
  DROP COLUMN IF EXISTS "authorized_by_user_id",
  DROP COLUMN IF EXISTS "authorized_at",
  DROP COLUMN IF EXISTS "revoked_at",
  DROP COLUMN IF EXISTS "expires_at";

CREATE INDEX IF NOT EXISTS "data_sharing_authorizations_legal_basis_assessment_id_idx"
  ON "data_sharing_authorizations"("legal_basis_assessment_id");

-- Status event tables (append-only)
CREATE TABLE IF NOT EXISTS "data_subject_consent_status_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "data_subject_consent_id" TEXT NOT NULL,
  "from_status" "DataSubjectConsentStatus",
  "to_status" "DataSubjectConsentStatus" NOT NULL,
  "actor_type" "AuthorizationActorType" NOT NULL,
  "actor_id" TEXT,
  "channel" "ConsentInteractionChannel",
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_subject_consent_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "consent_withdrawal_propagations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "data_subject_consent_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "enforcement_policy_id" TEXT,
  "action" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "consent_withdrawal_propagations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "provider_access_grant_status_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "provider_access_grant_id" TEXT NOT NULL,
  "from_status" "ProviderAccessGrantStatus",
  "to_status" "ProviderAccessGrantStatus" NOT NULL,
  "actor_type" "AuthorizationActorType" NOT NULL,
  "actor_id" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "provider_access_grant_status_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "data_sharing_authorization_categories" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "data_sharing_authorization_id" TEXT NOT NULL,
  "data_category" "PrivacyProcessingDataCategory" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_sharing_authorization_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "data_sharing_authorization_status_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "data_sharing_authorization_id" TEXT NOT NULL,
  "from_status" "DataSharingAuthorizationStatus",
  "to_status" "DataSharingAuthorizationStatus" NOT NULL,
  "actor_type" "AuthorizationActorType" NOT NULL,
  "actor_id" TEXT,
  "reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "data_sharing_authorization_status_events_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX IF NOT EXISTS "data_subject_consent_status_events_organization_id_created_at_idx"
  ON "data_subject_consent_status_events"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "data_subject_consent_status_events_data_subject_consent_id_created_at_idx"
  ON "data_subject_consent_status_events"("data_subject_consent_id", "created_at");

CREATE INDEX IF NOT EXISTS "consent_withdrawal_propagations_organization_id_created_at_idx"
  ON "consent_withdrawal_propagations"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "consent_withdrawal_propagations_data_subject_consent_id_idx"
  ON "consent_withdrawal_propagations"("data_subject_consent_id");

CREATE INDEX IF NOT EXISTS "provider_access_grant_status_events_organization_id_created_at_idx"
  ON "provider_access_grant_status_events"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "provider_access_grant_status_events_provider_access_grant_id_created_at_idx"
  ON "provider_access_grant_status_events"("provider_access_grant_id", "created_at");

CREATE UNIQUE INDEX IF NOT EXISTS "data_sharing_authorization_categories_data_sharing_authorization_id_data_category_key"
  ON "data_sharing_authorization_categories"("data_sharing_authorization_id", "data_category");
CREATE INDEX IF NOT EXISTS "data_sharing_authorization_categories_organization_id_idx"
  ON "data_sharing_authorization_categories"("organization_id");

CREATE INDEX IF NOT EXISTS "data_sharing_authorization_status_events_organization_id_created_at_idx"
  ON "data_sharing_authorization_status_events"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "data_sharing_authorization_status_events_data_sharing_authorization_id_created_at_idx"
  ON "data_sharing_authorization_status_events"("data_sharing_authorization_id", "created_at");

-- Foreign keys
ALTER TABLE "data_subject_consent_status_events"
  ADD CONSTRAINT "data_subject_consent_status_events_data_subject_consent_id_fkey"
  FOREIGN KEY ("data_subject_consent_id") REFERENCES "data_subject_consents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "consent_withdrawal_propagations"
  ADD CONSTRAINT "consent_withdrawal_propagations_data_subject_consent_id_fkey"
  FOREIGN KEY ("data_subject_consent_id") REFERENCES "data_subject_consents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "provider_access_grant_status_events"
  ADD CONSTRAINT "provider_access_grant_status_events_provider_access_grant_id_fkey"
  FOREIGN KEY ("provider_access_grant_id") REFERENCES "provider_access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_sharing_authorization_categories"
  ADD CONSTRAINT "data_sharing_authorization_categories_data_sharing_authorization_id_fkey"
  FOREIGN KEY ("data_sharing_authorization_id") REFERENCES "data_sharing_authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_sharing_authorization_status_events"
  ADD CONSTRAINT "data_sharing_authorization_status_events_data_sharing_authorization_id_fkey"
  FOREIGN KEY ("data_sharing_authorization_id") REFERENCES "data_sharing_authorizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_sharing_authorizations"
  DROP CONSTRAINT IF EXISTS "data_sharing_authorizations_legal_basis_assessment_id_fkey";

ALTER TABLE "data_sharing_authorizations"
  ADD CONSTRAINT "data_sharing_authorizations_legal_basis_assessment_id_fkey"
  FOREIGN KEY ("legal_basis_assessment_id") REFERENCES "legal_basis_assessments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

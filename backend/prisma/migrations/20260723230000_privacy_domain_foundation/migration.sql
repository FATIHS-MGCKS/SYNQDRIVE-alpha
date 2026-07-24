-- Privacy domain foundation: fachliche Trennung der Data-Authorization-Domäne.
-- Legacy org_data_authorizations bleibt unverändert lesbar.

-- CreateEnum
CREATE TYPE "ProcessingActivityStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ARCHIVED');
CREATE TYPE "ProcessingActivityOwnerRole" AS ENUM ('ORG_ADMIN', 'DATA_PROTECTION_OFFICER', 'FLEET_MANAGER', 'SYSTEM');
CREATE TYPE "PrivacyLegalBasisType" AS ENUM ('CONSENT', 'CONTRACT', 'LEGAL_OBLIGATION', 'VITAL_INTEREST', 'PUBLIC_INTEREST', 'LEGITIMATE_INTEREST');
CREATE TYPE "LegalBasisAssessmentStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'CONFIRMED', 'SUPERSEDED');
CREATE TYPE "DataSubjectConsentStatus" AS ENUM ('PENDING', 'GRANTED', 'WITHDRAWN', 'EXPIRED');
CREATE TYPE "DataSubjectType" AS ENUM ('CUSTOMER', 'DRIVER', 'EMPLOYEE', 'VEHICLE_OWNER', 'OTHER');
CREATE TYPE "ProviderAccessGrantStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED');
CREATE TYPE "ProviderAccessGrantMechanism" AS ENUM ('OAUTH', 'WEBHOOK', 'MANUAL', 'SYSTEM_SYNC');
CREATE TYPE "DataSharingAuthorizationStatus" AS ENUM ('PENDING', 'AUTHORIZED', 'REVOKED', 'EXPIRED');
CREATE TYPE "DataProcessingAgreementStatus" AS ENUM ('DRAFT', 'ACTIVE', 'TERMINATED', 'EXPIRED');
CREATE TYPE "EnforcementPolicyStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED');
CREATE TYPE "PrivacyEnforcementMode" AS ENUM ('OFF', 'SHADOW', 'ENFORCE');
CREATE TYPE "PrivacyEnforcementScopeType" AS ENUM ('ORGANIZATION', 'CONNECTED_VEHICLES', 'VEHICLE', 'CUSTOMER', 'BOOKING');
CREATE TYPE "PrivacyProcessingDataCategory" AS ENUM (
  'GPS_LOCATION',
  'TELEMETRY_DATA',
  'VEHICLE_IDENTITY',
  'VEHICLE_STATUS',
  'ODOMETER',
  'TRIP_DATA',
  'DRIVING_BEHAVIOR',
  'HEALTH_SIGNALS',
  'DTC_CODES',
  'BOOKING_DATA',
  'CUSTOMER_DATA',
  'FINANCIAL_DATA',
  'DOCUMENT_DATA'
);
CREATE TYPE "PrivacyProcessingPurpose" AS ENUM (
  'LIVE_MAP',
  'TRIPS',
  'VEHICLE_HEALTH',
  'ALERTS',
  'FLEET_ANALYTICS',
  'RENTAL_ANALYTICS',
  'TECHNICAL_OVERVIEW',
  'ABUSE_MISUSE_DETECTION',
  'DOCUMENT_PROCESSING',
  'CUSTOMER_CONSENT',
  'PARTNER_SERVICE'
);
CREATE TYPE "AuthorizationDecisionEventType" AS ENUM ('ALLOW', 'DENY', 'SHADOW_WOULD_DENY', 'INGESTION_SKIPPED');
CREATE TYPE "AuthorizationActorType" AS ENUM ('USER', 'SYSTEM', 'WORKER');

-- CreateTable
CREATE TABLE "processing_activities" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "activity_code" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "ProcessingActivityStatus" NOT NULL DEFAULT 'DRAFT',
  "owner_user_id" TEXT,
  "owner_role" "ProcessingActivityOwnerRole" NOT NULL DEFAULT 'ORG_ADMIN',
  "legacy_org_data_authorization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "processing_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processing_activity_categories" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "data_category" "PrivacyProcessingDataCategory" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "processing_activity_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "processing_activity_purposes" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "purpose" "PrivacyProcessingPurpose" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "processing_activity_purposes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_basis_assessments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "legal_basis_type" "PrivacyLegalBasisType" NOT NULL,
  "status" "LegalBasisAssessmentStatus" NOT NULL DEFAULT 'DRAFT',
  "assessed_by_user_id" TEXT,
  "assessed_at" TIMESTAMP(3),
  "rationale_summary" TEXT,
  "legacy_org_data_authorization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "legal_basis_assessments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_subject_consents" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "legal_basis_assessment_id" TEXT,
  "status" "DataSubjectConsentStatus" NOT NULL DEFAULT 'PENDING',
  "subject_type" "DataSubjectType" NOT NULL,
  "subject_ref_id" TEXT,
  "recorded_by_user_id" TEXT,
  "granted_at" TIMESTAMP(3),
  "withdrawn_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "withdrawal_reason" TEXT,
  "legacy_org_data_authorization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "data_subject_consents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_access_grants" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT,
  "vehicle_id" TEXT,
  "provider" TEXT NOT NULL,
  "status" "ProviderAccessGrantStatus" NOT NULL DEFAULT 'PENDING',
  "grant_mechanism" "ProviderAccessGrantMechanism" NOT NULL,
  "granted_by_user_id" TEXT,
  "granted_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "proof_reference" TEXT,
  "legacy_vehicle_provider_consent_id" TEXT,
  "legacy_org_data_authorization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "provider_access_grants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "provider_access_grant_scopes" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "provider_access_grant_id" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "provider_access_grant_scopes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_sharing_authorizations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "partner_label" TEXT NOT NULL,
  "destination_summary" TEXT,
  "status" "DataSharingAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
  "authorized_by_user_id" TEXT,
  "authorized_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "legacy_org_data_authorization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "data_sharing_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "data_processing_agreements" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT,
  "processor_label" TEXT NOT NULL,
  "agreement_ref" TEXT,
  "status" "DataProcessingAgreementStatus" NOT NULL DEFAULT 'DRAFT',
  "effective_from" TIMESTAMP(3),
  "effective_until" TIMESTAMP(3),
  "signed_by_user_id" TEXT,
  "signed_at" TIMESTAMP(3),
  "terminated_at" TIMESTAMP(3),
  "legacy_org_data_authorization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "data_processing_agreements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "enforcement_policies" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT NOT NULL,
  "status" "EnforcementPolicyStatus" NOT NULL DEFAULT 'DRAFT',
  "enforcement_mode" "PrivacyEnforcementMode" NOT NULL DEFAULT 'OFF',
  "data_category" "PrivacyProcessingDataCategory" NOT NULL,
  "processing_purpose" "PrivacyProcessingPurpose" NOT NULL,
  "scope_type" "PrivacyEnforcementScopeType" NOT NULL DEFAULT 'ORGANIZATION',
  "scope_vehicle_id" TEXT,
  "scope_customer_id" TEXT,
  "scope_booking_id" TEXT,
  "path_id" TEXT,
  "legacy_org_data_authorization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "enforcement_policies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "authorization_decision_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "processing_activity_id" TEXT,
  "enforcement_policy_id" TEXT,
  "event_type" "AuthorizationDecisionEventType" NOT NULL,
  "path_id" TEXT,
  "data_category" "PrivacyProcessingDataCategory",
  "processing_purpose" "PrivacyProcessingPurpose",
  "vehicle_id" TEXT,
  "actor_type" "AuthorizationActorType" NOT NULL,
  "actor_id" TEXT,
  "decision_reason" TEXT,
  "correlation_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "authorization_decision_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "processing_activities_legacy_org_data_authorization_id_key"
  ON "processing_activities"("legacy_org_data_authorization_id");
CREATE UNIQUE INDEX "processing_activities_organization_id_activity_code_key"
  ON "processing_activities"("organization_id", "activity_code");
CREATE INDEX "processing_activities_organization_id_status_idx"
  ON "processing_activities"("organization_id", "status");
CREATE INDEX "processing_activities_owner_user_id_idx"
  ON "processing_activities"("owner_user_id");

CREATE UNIQUE INDEX "processing_activity_categories_processing_activity_id_data_category_key"
  ON "processing_activity_categories"("processing_activity_id", "data_category");
CREATE INDEX "processing_activity_categories_organization_id_idx"
  ON "processing_activity_categories"("organization_id");

CREATE UNIQUE INDEX "processing_activity_purposes_processing_activity_id_purpose_key"
  ON "processing_activity_purposes"("processing_activity_id", "purpose");
CREATE INDEX "processing_activity_purposes_organization_id_idx"
  ON "processing_activity_purposes"("organization_id");

CREATE UNIQUE INDEX "legal_basis_assessments_legacy_org_data_authorization_id_key"
  ON "legal_basis_assessments"("legacy_org_data_authorization_id");
CREATE INDEX "legal_basis_assessments_organization_id_status_idx"
  ON "legal_basis_assessments"("organization_id", "status");
CREATE INDEX "legal_basis_assessments_processing_activity_id_idx"
  ON "legal_basis_assessments"("processing_activity_id");

CREATE UNIQUE INDEX "data_subject_consents_legacy_org_data_authorization_id_key"
  ON "data_subject_consents"("legacy_org_data_authorization_id");
CREATE INDEX "data_subject_consents_organization_id_status_idx"
  ON "data_subject_consents"("organization_id", "status");
CREATE INDEX "data_subject_consents_processing_activity_id_idx"
  ON "data_subject_consents"("processing_activity_id");
CREATE INDEX "data_subject_consents_subject_type_subject_ref_id_idx"
  ON "data_subject_consents"("subject_type", "subject_ref_id");

CREATE UNIQUE INDEX "provider_access_grants_legacy_vehicle_provider_consent_id_key"
  ON "provider_access_grants"("legacy_vehicle_provider_consent_id");
CREATE UNIQUE INDEX "provider_access_grants_legacy_org_data_authorization_id_key"
  ON "provider_access_grants"("legacy_org_data_authorization_id");
CREATE INDEX "provider_access_grants_organization_id_status_idx"
  ON "provider_access_grants"("organization_id", "status");
CREATE INDEX "provider_access_grants_processing_activity_id_idx"
  ON "provider_access_grants"("processing_activity_id");
CREATE INDEX "provider_access_grants_vehicle_id_provider_status_idx"
  ON "provider_access_grants"("vehicle_id", "provider", "status");

CREATE UNIQUE INDEX "provider_access_grant_scopes_provider_access_grant_id_scope_key_key"
  ON "provider_access_grant_scopes"("provider_access_grant_id", "scope_key");
CREATE INDEX "provider_access_grant_scopes_organization_id_idx"
  ON "provider_access_grant_scopes"("organization_id");

CREATE UNIQUE INDEX "data_sharing_authorizations_legacy_org_data_authorization_id_key"
  ON "data_sharing_authorizations"("legacy_org_data_authorization_id");
CREATE INDEX "data_sharing_authorizations_organization_id_status_idx"
  ON "data_sharing_authorizations"("organization_id", "status");
CREATE INDEX "data_sharing_authorizations_processing_activity_id_idx"
  ON "data_sharing_authorizations"("processing_activity_id");

CREATE UNIQUE INDEX "data_processing_agreements_legacy_org_data_authorization_id_key"
  ON "data_processing_agreements"("legacy_org_data_authorization_id");
CREATE INDEX "data_processing_agreements_organization_id_status_idx"
  ON "data_processing_agreements"("organization_id", "status");
CREATE INDEX "data_processing_agreements_processing_activity_id_idx"
  ON "data_processing_agreements"("processing_activity_id");

CREATE UNIQUE INDEX "enforcement_policies_legacy_org_data_authorization_id_key"
  ON "enforcement_policies"("legacy_org_data_authorization_id");
CREATE INDEX "enforcement_policies_organization_id_status_idx"
  ON "enforcement_policies"("organization_id", "status");
CREATE INDEX "enforcement_policies_processing_activity_id_data_category_processing_purpose_idx"
  ON "enforcement_policies"("processing_activity_id", "data_category", "processing_purpose");
CREATE INDEX "enforcement_policies_path_id_idx"
  ON "enforcement_policies"("path_id");

CREATE INDEX "authorization_decision_events_organization_id_created_at_idx"
  ON "authorization_decision_events"("organization_id", "created_at");
CREATE INDEX "authorization_decision_events_processing_activity_id_idx"
  ON "authorization_decision_events"("processing_activity_id");
CREATE INDEX "authorization_decision_events_enforcement_policy_id_idx"
  ON "authorization_decision_events"("enforcement_policy_id");
CREATE INDEX "authorization_decision_events_event_type_created_at_idx"
  ON "authorization_decision_events"("event_type", "created_at");

-- AddForeignKey
ALTER TABLE "processing_activities"
  ADD CONSTRAINT "processing_activities_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "processing_activities"
  ADD CONSTRAINT "processing_activities_legacy_org_data_authorization_id_fkey"
  FOREIGN KEY ("legacy_org_data_authorization_id") REFERENCES "org_data_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "processing_activity_categories"
  ADD CONSTRAINT "processing_activity_categories_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "processing_activity_purposes"
  ADD CONSTRAINT "processing_activity_purposes_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_basis_assessments"
  ADD CONSTRAINT "legal_basis_assessments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_basis_assessments"
  ADD CONSTRAINT "legal_basis_assessments_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "legal_basis_assessments"
  ADD CONSTRAINT "legal_basis_assessments_legacy_org_data_authorization_id_fkey"
  FOREIGN KEY ("legacy_org_data_authorization_id") REFERENCES "org_data_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "data_subject_consents"
  ADD CONSTRAINT "data_subject_consents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_subject_consents"
  ADD CONSTRAINT "data_subject_consents_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_subject_consents"
  ADD CONSTRAINT "data_subject_consents_legal_basis_assessment_id_fkey"
  FOREIGN KEY ("legal_basis_assessment_id") REFERENCES "legal_basis_assessments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "data_subject_consents"
  ADD CONSTRAINT "data_subject_consents_legacy_org_data_authorization_id_fkey"
  FOREIGN KEY ("legacy_org_data_authorization_id") REFERENCES "org_data_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "provider_access_grants"
  ADD CONSTRAINT "provider_access_grants_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "provider_access_grants"
  ADD CONSTRAINT "provider_access_grants_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "provider_access_grants"
  ADD CONSTRAINT "provider_access_grants_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "provider_access_grants"
  ADD CONSTRAINT "provider_access_grants_legacy_vehicle_provider_consent_id_fkey"
  FOREIGN KEY ("legacy_vehicle_provider_consent_id") REFERENCES "vehicle_provider_consents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "provider_access_grants"
  ADD CONSTRAINT "provider_access_grants_legacy_org_data_authorization_id_fkey"
  FOREIGN KEY ("legacy_org_data_authorization_id") REFERENCES "org_data_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "provider_access_grant_scopes"
  ADD CONSTRAINT "provider_access_grant_scopes_provider_access_grant_id_fkey"
  FOREIGN KEY ("provider_access_grant_id") REFERENCES "provider_access_grants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_sharing_authorizations"
  ADD CONSTRAINT "data_sharing_authorizations_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_sharing_authorizations"
  ADD CONSTRAINT "data_sharing_authorizations_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_sharing_authorizations"
  ADD CONSTRAINT "data_sharing_authorizations_legacy_org_data_authorization_id_fkey"
  FOREIGN KEY ("legacy_org_data_authorization_id") REFERENCES "org_data_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "data_processing_agreements"
  ADD CONSTRAINT "data_processing_agreements_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "data_processing_agreements"
  ADD CONSTRAINT "data_processing_agreements_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "data_processing_agreements"
  ADD CONSTRAINT "data_processing_agreements_legacy_org_data_authorization_id_fkey"
  FOREIGN KEY ("legacy_org_data_authorization_id") REFERENCES "org_data_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "enforcement_policies"
  ADD CONSTRAINT "enforcement_policies_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enforcement_policies"
  ADD CONSTRAINT "enforcement_policies_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "enforcement_policies"
  ADD CONSTRAINT "enforcement_policies_legacy_org_data_authorization_id_fkey"
  FOREIGN KEY ("legacy_org_data_authorization_id") REFERENCES "org_data_authorizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "authorization_decision_events"
  ADD CONSTRAINT "authorization_decision_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "authorization_decision_events"
  ADD CONSTRAINT "authorization_decision_events_processing_activity_id_fkey"
  FOREIGN KEY ("processing_activity_id") REFERENCES "processing_activities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "authorization_decision_events"
  ADD CONSTRAINT "authorization_decision_events_enforcement_policy_id_fkey"
  FOREIGN KEY ("enforcement_policy_id") REFERENCES "enforcement_policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

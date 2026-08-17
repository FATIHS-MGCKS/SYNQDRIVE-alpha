-- CreateEnum
CREATE TYPE "DeviceConnectionWebhookMappingStatus" AS ENUM ('UNKNOWN', 'MAPPED', 'UNMAPPED_VEHICLE', 'UNMAPPED_BINDING', 'PARSE_FAILED');

-- CreateEnum
CREATE TYPE "BrakeDtcCategory" AS ENUM ('BRAKE_SYSTEM', 'ABS', 'ESC', 'PARKING_BRAKE', 'BRAKE_SENSOR', 'BRAKE_FLUID', 'COMMUNICATION_RELATED', 'NOT_BRAKE_RELATED');

-- CreateEnum
CREATE TYPE "BrakeDtcFreshness" AS ENUM ('FRESH', 'STALE', 'UNKNOWN');

-- AlterEnum
BEGIN;
CREATE TYPE "BookingPaymentRequestStatus_new" AS ENUM ('DRAFT', 'OPEN', 'LINK_PENDING', 'CHECKOUT_READY', 'LINK_SENT', 'PROCESSING', 'PAID', 'PARTIALLY_REFUNDED', 'REFUNDED', 'FAILED', 'CANCELLED', 'EXPIRED', 'DISPUTED');
ALTER TABLE "booking_payment_requests" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "booking_payment_requests" ALTER COLUMN "status" TYPE "BookingPaymentRequestStatus_new" USING ("status"::text::"BookingPaymentRequestStatus_new");
ALTER TYPE "BookingPaymentRequestStatus" RENAME TO "BookingPaymentRequestStatus_old";
ALTER TYPE "BookingPaymentRequestStatus_new" RENAME TO "BookingPaymentRequestStatus";
DROP TYPE "BookingPaymentRequestStatus_old";
ALTER TABLE "booking_payment_requests" ALTER COLUMN "status" SET DEFAULT 'DRAFT';
COMMIT;

-- DropForeignKey
ALTER TABLE "authorization_decision_events" DROP CONSTRAINT "authorization_decision_events_enforcement_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "authorization_decision_events" DROP CONSTRAINT "authorization_decision_events_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "authorization_decision_events" DROP CONSTRAINT "authorization_decision_events_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "brake_evidence" DROP CONSTRAINT "brake_evidence_prediction_snapshot_id_fkey";

-- DropForeignKey
ALTER TABLE "brake_evidence" DROP CONSTRAINT "brake_evidence_superseded_by_fkey";

-- DropForeignKey
ALTER TABLE "brake_evidence" DROP CONSTRAINT "brake_evidence_vehicle_dtc_event_id_fkey";

-- DropForeignKey
ALTER TABLE "brake_health_alerts" DROP CONSTRAINT "brake_health_alerts_vehicle_fkey";

-- DropForeignKey
ALTER TABLE "brake_health_snapshots" DROP CONSTRAINT "brake_health_snapshots_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "compliance_evidence_report_audit_events" DROP CONSTRAINT "compliance_evidence_report_audit_events_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "compliance_evidence_reports" DROP CONSTRAINT "compliance_evidence_reports_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "consent_withdrawal_propagations" DROP CONSTRAINT "consent_withdrawal_propagations_data_subject_consent_id_fkey";

-- DropForeignKey
ALTER TABLE "data_authorization_audit_outbox" DROP CONSTRAINT "data_authorization_audit_outbox_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_authorization_deny_switches" DROP CONSTRAINT "data_authorization_deny_switches_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_authorization_downstream_revocation_notifies" DROP CONSTRAINT "data_authorization_downstream_revocation_notifies_workflow_id_f";

-- DropForeignKey
ALTER TABLE "data_authorization_legacy_migration_entries" DROP CONSTRAINT "data_authorization_legacy_migration_entries_organization_id_fke";

-- DropForeignKey
ALTER TABLE "data_authorization_legacy_migration_entries" DROP CONSTRAINT "data_authorization_legacy_migration_entries_run_id_fkey";

-- DropForeignKey
ALTER TABLE "data_authorization_legacy_migration_runs" DROP CONSTRAINT "data_authorization_legacy_migration_runs_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_authorization_revocation_queue_actions" DROP CONSTRAINT "data_authorization_revocation_queue_actions_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "data_authorization_revocation_step_events" DROP CONSTRAINT "data_authorization_revocation_step_events_workflow_id_fkey";

-- DropForeignKey
ALTER TABLE "data_authorization_revocation_workflows" DROP CONSTRAINT "data_authorization_revocation_workflows_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_activities" DROP CONSTRAINT "data_processing_agreement_activities_agreement_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_activities" DROP CONSTRAINT "data_processing_agreement_activities_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_activities" DROP CONSTRAINT "data_processing_agreement_activities_processing_activity_id_fke";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_audit_events" DROP CONSTRAINT "data_processing_agreement_audit_events_agreement_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_audit_events" DROP CONSTRAINT "data_processing_agreement_audit_events_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_data_locations" DROP CONSTRAINT "data_processing_agreement_data_locations_agreement_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_data_locations" DROP CONSTRAINT "data_processing_agreement_data_locations_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_sharing_links" DROP CONSTRAINT "data_processing_agreement_sharing_links_agreement_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_sharing_links" DROP CONSTRAINT "data_processing_agreement_sharing_links_data_sharing_authorizat";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_sharing_links" DROP CONSTRAINT "data_processing_agreement_sharing_links_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_subprocessors" DROP CONSTRAINT "data_processing_agreement_subprocessors_agreement_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_subprocessors" DROP CONSTRAINT "data_processing_agreement_subprocessors_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_transfer_countries" DROP CONSTRAINT "data_processing_agreement_transfer_countries_agreement_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreement_transfer_countries" DROP CONSTRAINT "data_processing_agreement_transfer_countries_organization_id_fk";

-- DropForeignKey
ALTER TABLE "data_processing_agreements" DROP CONSTRAINT "data_processing_agreements_legacy_org_data_authorization_id_fke";

-- DropForeignKey
ALTER TABLE "data_processing_agreements" DROP CONSTRAINT "data_processing_agreements_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_agreements" DROP CONSTRAINT "data_processing_agreements_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_review_cycles" DROP CONSTRAINT "data_processing_review_cycles_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_review_cycles" DROP CONSTRAINT "data_processing_review_cycles_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_review_cycles" DROP CONSTRAINT "data_processing_review_cycles_superseded_by_cycle_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_review_decisions" DROP CONSTRAINT "data_processing_review_decisions_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_processing_review_decisions" DROP CONSTRAINT "data_processing_review_decisions_review_cycle_id_fkey";

-- DropForeignKey
ALTER TABLE "data_sharing_authorization_categories" DROP CONSTRAINT "data_sharing_authorization_categories_data_sharing_authorizatio";

-- DropForeignKey
ALTER TABLE "data_sharing_authorization_status_events" DROP CONSTRAINT "data_sharing_authorization_status_events_data_sharing_authoriza";

-- DropForeignKey
ALTER TABLE "data_sharing_authorizations" DROP CONSTRAINT "data_sharing_authorizations_legacy_org_data_authorization_id_fk";

-- DropForeignKey
ALTER TABLE "data_sharing_authorizations" DROP CONSTRAINT "data_sharing_authorizations_legal_basis_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "data_sharing_authorizations" DROP CONSTRAINT "data_sharing_authorizations_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_sharing_authorizations" DROP CONSTRAINT "data_sharing_authorizations_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "data_subject_consent_status_events" DROP CONSTRAINT "data_subject_consent_status_events_data_subject_consent_id_fkey";

-- DropForeignKey
ALTER TABLE "data_subject_consents" DROP CONSTRAINT "data_subject_consents_legacy_org_data_authorization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_subject_consents" DROP CONSTRAINT "data_subject_consents_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "data_subject_consents" DROP CONSTRAINT "data_subject_consents_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policies" DROP CONSTRAINT "enforcement_policies_legacy_org_data_authorization_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policies" DROP CONSTRAINT "enforcement_policies_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policies" DROP CONSTRAINT "enforcement_policies_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policies" DROP CONSTRAINT "enforcement_policies_superseded_by_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_bookings" DROP CONSTRAINT "enforcement_policy_bookings_booking_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_bookings" DROP CONSTRAINT "enforcement_policy_bookings_enforcement_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_bookings" DROP CONSTRAINT "enforcement_policy_bookings_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_customers" DROP CONSTRAINT "enforcement_policy_customers_customer_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_customers" DROP CONSTRAINT "enforcement_policy_customers_enforcement_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_customers" DROP CONSTRAINT "enforcement_policy_customers_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_lifecycle_events" DROP CONSTRAINT "enforcement_policy_lifecycle_events_enforcement_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_lifecycle_events" DROP CONSTRAINT "enforcement_policy_lifecycle_events_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_scope_migration_findings" DROP CONSTRAINT "enforcement_policy_scope_migration_findings_enforcement_policy_";

-- DropForeignKey
ALTER TABLE "enforcement_policy_scope_migration_findings" DROP CONSTRAINT "enforcement_policy_scope_migration_findings_organization_id_fke";

-- DropForeignKey
ALTER TABLE "enforcement_policy_stations" DROP CONSTRAINT "enforcement_policy_stations_enforcement_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_stations" DROP CONSTRAINT "enforcement_policy_stations_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_stations" DROP CONSTRAINT "enforcement_policy_stations_station_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_vehicles" DROP CONSTRAINT "enforcement_policy_vehicles_enforcement_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_vehicles" DROP CONSTRAINT "enforcement_policy_vehicles_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "enforcement_policy_vehicles" DROP CONSTRAINT "enforcement_policy_vehicles_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "legal_basis_assessment_evidence_refs" DROP CONSTRAINT "legal_basis_assessment_evidence_refs_legal_basis_assessment_id_";

-- DropForeignKey
ALTER TABLE "legal_basis_assessment_lifecycle_events" DROP CONSTRAINT "legal_basis_assessment_lifecycle_events_legal_basis_assessment_";

-- DropForeignKey
ALTER TABLE "legal_basis_assessment_lifecycle_events" DROP CONSTRAINT "legal_basis_assessment_lifecycle_events_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "legal_basis_assessments" DROP CONSTRAINT "legal_basis_assessments_legacy_org_data_authorization_id_fkey";

-- DropForeignKey
ALTER TABLE "legal_basis_assessments" DROP CONSTRAINT "legal_basis_assessments_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "legal_basis_assessments" DROP CONSTRAINT "legal_basis_assessments_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "legal_basis_assessments" DROP CONSTRAINT "legal_basis_assessments_superseded_by_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activities" DROP CONSTRAINT "processing_activities_legacy_org_data_authorization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activities" DROP CONSTRAINT "processing_activities_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activities" DROP CONSTRAINT "processing_activities_superseded_by_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_categories" DROP CONSTRAINT "processing_activity_categories_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_data_subject_types" DROP CONSTRAINT "processing_activity_data_subject_types_processing_activity_id_f";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_decisions" DROP CONSTRAINT "processing_activity_deletion_decisions_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_decisions" DROP CONSTRAINT "processing_activity_deletion_decisions_processing_activity_id_f";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_decisions" DROP CONSTRAINT "processing_activity_deletion_decisions_retention_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_evidence" DROP CONSTRAINT "processing_activity_deletion_evidence_job_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_evidence" DROP CONSTRAINT "processing_activity_deletion_evidence_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_job_steps" DROP CONSTRAINT "processing_activity_deletion_job_steps_job_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_job_steps" DROP CONSTRAINT "processing_activity_deletion_job_steps_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_jobs" DROP CONSTRAINT "processing_activity_deletion_jobs_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_jobs" DROP CONSTRAINT "processing_activity_deletion_jobs_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_deletion_jobs" DROP CONSTRAINT "processing_activity_deletion_jobs_retention_policy_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_dpia_decisions" DROP CONSTRAINT "processing_activity_dpia_decisions_dpia_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_dpias" DROP CONSTRAINT "processing_activity_dpias_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_dpias" DROP CONSTRAINT "processing_activity_dpias_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_dpias" DROP CONSTRAINT "processing_activity_dpias_risk_assessment_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_lifecycle_events" DROP CONSTRAINT "processing_activity_lifecycle_events_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_lifecycle_events" DROP CONSTRAINT "processing_activity_lifecycle_events_processing_activity_id_fke";

-- DropForeignKey
ALTER TABLE "processing_activity_purposes" DROP CONSTRAINT "processing_activity_purposes_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_register_audit_events" DROP CONSTRAINT "processing_activity_register_audit_events_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_register_audit_events" DROP CONSTRAINT "processing_activity_register_audit_events_processing_activity_i";

-- DropForeignKey
ALTER TABLE "processing_activity_register_exports" DROP CONSTRAINT "processing_activity_register_exports_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_register_exports" DROP CONSTRAINT "processing_activity_register_exports_processing_activity_id_fke";

-- DropForeignKey
ALTER TABLE "processing_activity_retention_exceptions" DROP CONSTRAINT "processing_activity_retention_exceptions_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_retention_exceptions" DROP CONSTRAINT "processing_activity_retention_exceptions_retention_policy_id_fk";

-- DropForeignKey
ALTER TABLE "processing_activity_retention_policies" DROP CONSTRAINT "processing_activity_retention_policies_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_retention_policies" DROP CONSTRAINT "processing_activity_retention_policies_processing_activity_id_f";

-- DropForeignKey
ALTER TABLE "processing_activity_risk_assessments" DROP CONSTRAINT "processing_activity_risk_assessments_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "processing_activity_risk_assessments" DROP CONSTRAINT "processing_activity_risk_assessments_processing_activity_id_fke";

-- DropForeignKey
ALTER TABLE "provider_access_grant_scopes" DROP CONSTRAINT "provider_access_grant_scopes_provider_access_grant_id_fkey";

-- DropForeignKey
ALTER TABLE "provider_access_grant_status_events" DROP CONSTRAINT "provider_access_grant_status_events_provider_access_grant_id_fk";

-- DropForeignKey
ALTER TABLE "provider_access_grants" DROP CONSTRAINT "provider_access_grants_legacy_org_data_authorization_id_fkey";

-- DropForeignKey
ALTER TABLE "provider_access_grants" DROP CONSTRAINT "provider_access_grants_legacy_vehicle_provider_consent_id_fkey";

-- DropForeignKey
ALTER TABLE "provider_access_grants" DROP CONSTRAINT "provider_access_grants_organization_id_fkey";

-- DropForeignKey
ALTER TABLE "provider_access_grants" DROP CONSTRAINT "provider_access_grants_processing_activity_id_fkey";

-- DropForeignKey
ALTER TABLE "provider_access_grants" DROP CONSTRAINT "provider_access_grants_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "rental_driving_analyses" DROP CONSTRAINT "rental_driving_analyses_driver_id_fkey";

-- DropIndex
DROP INDEX "bookings_payment_intent_idx";

-- DropIndex
DROP INDEX "document_extraction_archive_index_search_text_trgm_idx";

-- DropIndex
DROP INDEX "misuse_cases_actual_driver_id_idx";

-- DropIndex
DROP INDEX "misuse_cases_assigned_driver_id_idx";

-- DropIndex
DROP INDEX "org_invoices_generated_document_id_idx";

-- DropIndex
DROP INDEX "org_tasks_organization_id_assigned_to_status_idx";

-- DropIndex
DROP INDEX "rental_contracts_legal_snapshot_frozen_at_idx";

-- DropIndex
DROP INDEX "rental_driving_analyses_booking_id_assessment_status_idx";

-- DropIndex
DROP INDEX "rental_driving_analyses_booking_id_key";

-- DropIndex
DROP INDEX "vehicle_document_extractions_organization_id_created_at_idx";

-- DropIndex
DROP INDEX "vehicle_document_extractions_vehicle_id_created_at_idx";

-- AlterTable
ALTER TABLE "booking_document_generation_jobs" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "brake_evidence" ALTER COLUMN "prediction_snapshot_id" SET DATA TYPE TEXT,
DROP COLUMN "dtc_category",
ADD COLUMN     "dtc_category" "BrakeDtcCategory",
ALTER COLUMN "dtc_first_seen_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "dtc_last_seen_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "dtc_resolved_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "source_timestamp" SET DATA TYPE TIMESTAMP(3),
DROP COLUMN "dtc_freshness",
ADD COLUMN     "dtc_freshness" "BrakeDtcFreshness",
ALTER COLUMN "first_observed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_observed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "resolved_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "expires_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "confirmed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "recalculation_enqueued_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "brake_health_alerts" DROP CONSTRAINT "brake_health_alerts_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "model_snapshot_id" SET DATA TYPE TEXT,
ALTER COLUMN "resolved_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "opened_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "last_seen_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "brake_health_alerts_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "brake_health_snapshots" DROP CONSTRAINT "brake_health_snapshots_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "generated_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ADD CONSTRAINT "brake_health_snapshots_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "device_connection_episode_resolution_outbox" DROP COLUMN "event_type",
ADD COLUMN     "eventType" "DeviceConnectionEpisodeResolutionOutboxEventType" NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "misuse_cases" ALTER COLUMN "model_version" SET DEFAULT 'misuse-fingerprint-v1';

-- AlterTable
ALTER TABLE "organization_legal_document_events" ALTER COLUMN "document_type" SET NOT NULL;

-- AlterTable
ALTER TABLE "organization_memberships" ALTER COLUMN "membership_version" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "organization_rental_rules" DROP COLUMN "additional_driver_policy",
DROP COLUMN "credit_card_required",
DROP COLUMN "foreign_travel_policy",
DROP COLUMN "young_driver_policy";

-- AlterTable
ALTER TABLE "organizations" DROP COLUMN "data_processing_four_eyes_enabled";

-- AlterTable
ALTER TABLE "rental_contracts" ALTER COLUMN "legal_snapshot_frozen_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rental_vehicle_categories" DROP COLUMN "additional_driver_policy",
DROP COLUMN "foreign_travel_policy",
DROP COLUMN "young_driver_policy";

-- AlterTable
ALTER TABLE "tire_health_snapshots" ALTER COLUMN "prediction_generated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trip_driving_impact" ALTER COLUMN "calculated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "vehicle_rental_requirement_overrides" DROP COLUMN "additional_driver_policy",
DROP COLUMN "foreign_travel_policy",
DROP COLUMN "young_driver_policy";

-- AlterTable
ALTER TABLE "voice_assistants" DROP COLUMN "onboarding_completed_steps",
DROP COLUMN "onboarding_step",
DROP COLUMN "phone_onboarding";

-- DropTable
DROP TABLE "authorization_decision_events";

-- DropTable
DROP TABLE "compliance_evidence_report_audit_events";

-- DropTable
DROP TABLE "compliance_evidence_reports";

-- DropTable
DROP TABLE "consent_withdrawal_propagations";

-- DropTable
DROP TABLE "data_authorization_audit_outbox";

-- DropTable
DROP TABLE "data_authorization_deny_switches";

-- DropTable
DROP TABLE "data_authorization_downstream_revocation_notifies";

-- DropTable
DROP TABLE "data_authorization_legacy_migration_entries";

-- DropTable
DROP TABLE "data_authorization_legacy_migration_runs";

-- DropTable
DROP TABLE "data_authorization_revocation_queue_actions";

-- DropTable
DROP TABLE "data_authorization_revocation_step_events";

-- DropTable
DROP TABLE "data_authorization_revocation_workflows";

-- DropTable
DROP TABLE "data_authorization_scheduled_job_pauses";

-- DropTable
DROP TABLE "data_processing_agreement_activities";

-- DropTable
DROP TABLE "data_processing_agreement_audit_events";

-- DropTable
DROP TABLE "data_processing_agreement_data_locations";

-- DropTable
DROP TABLE "data_processing_agreement_sharing_links";

-- DropTable
DROP TABLE "data_processing_agreement_subprocessors";

-- DropTable
DROP TABLE "data_processing_agreement_transfer_countries";

-- DropTable
DROP TABLE "data_processing_agreements";

-- DropTable
DROP TABLE "data_processing_review_cycles";

-- DropTable
DROP TABLE "data_processing_review_decisions";

-- DropTable
DROP TABLE "data_sharing_authorization_categories";

-- DropTable
DROP TABLE "data_sharing_authorization_status_events";

-- DropTable
DROP TABLE "data_sharing_authorizations";

-- DropTable
DROP TABLE "data_subject_consent_status_events";

-- DropTable
DROP TABLE "data_subject_consents";

-- DropTable
DROP TABLE "enforcement_policies";

-- DropTable
DROP TABLE "enforcement_policy_bookings";

-- DropTable
DROP TABLE "enforcement_policy_customers";

-- DropTable
DROP TABLE "enforcement_policy_lifecycle_events";

-- DropTable
DROP TABLE "enforcement_policy_scope_migration_findings";

-- DropTable
DROP TABLE "enforcement_policy_stations";

-- DropTable
DROP TABLE "enforcement_policy_vehicles";

-- DropTable
DROP TABLE "legal_basis_assessment_evidence_refs";

-- DropTable
DROP TABLE "legal_basis_assessment_lifecycle_events";

-- DropTable
DROP TABLE "legal_basis_assessments";

-- DropTable
DROP TABLE "organization_legal_document_repair_log";

-- DropTable
DROP TABLE "processing_activities";

-- DropTable
DROP TABLE "processing_activity_categories";

-- DropTable
DROP TABLE "processing_activity_data_subject_types";

-- DropTable
DROP TABLE "processing_activity_deletion_decisions";

-- DropTable
DROP TABLE "processing_activity_deletion_evidence";

-- DropTable
DROP TABLE "processing_activity_deletion_job_steps";

-- DropTable
DROP TABLE "processing_activity_deletion_jobs";

-- DropTable
DROP TABLE "processing_activity_dpia_decisions";

-- DropTable
DROP TABLE "processing_activity_dpias";

-- DropTable
DROP TABLE "processing_activity_lifecycle_events";

-- DropTable
DROP TABLE "processing_activity_purposes";

-- DropTable
DROP TABLE "processing_activity_register_audit_events";

-- DropTable
DROP TABLE "processing_activity_register_exports";

-- DropTable
DROP TABLE "processing_activity_retention_exceptions";

-- DropTable
DROP TABLE "processing_activity_retention_policies";

-- DropTable
DROP TABLE "processing_activity_risk_assessments";

-- DropTable
DROP TABLE "provider_access_grant_scopes";

-- DropTable
DROP TABLE "provider_access_grant_status_events";

-- DropTable
DROP TABLE "provider_access_grants";

-- DropTable
DROP TABLE "rental_rules_integrity_repair_log";

-- DropEnum
DROP TYPE "AuthorizationActorType";

-- DropEnum
DROP TYPE "AuthorizationDecisionEventType";

-- DropEnum
DROP TYPE "ComplianceEvidenceAuditAction";

-- DropEnum
DROP TYPE "ComplianceEvidenceReportFormat";

-- DropEnum
DROP TYPE "ComplianceEvidenceReportStatus";

-- DropEnum
DROP TYPE "ComplianceEvidenceReportType";

-- DropEnum
DROP TYPE "ConsentInteractionChannel";

-- DropEnum
DROP TYPE "DataAuthorizationAuditEventKind";

-- DropEnum
DROP TYPE "DataAuthorizationAuditOutboxStatus";

-- DropEnum
DROP TYPE "DataAuthorizationAuditRetentionClass";

-- DropEnum
DROP TYPE "DataAuthorizationDenySwitchScopeType";

-- DropEnum
DROP TYPE "DataAuthorizationDenySwitchTrigger";

-- DropEnum
DROP TYPE "DataAuthorizationDownstreamRevocationNotifyStatus";

-- DropEnum
DROP TYPE "DataAuthorizationLegacyMigrationEntryStatus";

-- DropEnum
DROP TYPE "DataAuthorizationLegacyMigrationMode";

-- DropEnum
DROP TYPE "DataAuthorizationLegacyMigrationReviewReason";

-- DropEnum
DROP TYPE "DataAuthorizationLegacyMigrationRunStatus";

-- DropEnum
DROP TYPE "DataAuthorizationLegacyMigrationSourceType";

-- DropEnum
DROP TYPE "DataAuthorizationLegacyMigrationTargetType";

-- DropEnum
DROP TYPE "DataAuthorizationRevocationQueueActionType";

-- DropEnum
DROP TYPE "DataAuthorizationRevocationQueueJobState";

-- DropEnum
DROP TYPE "DataAuthorizationRevocationTriggerType";

-- DropEnum
DROP TYPE "DataAuthorizationRevocationWorkflowStatus";

-- DropEnum
DROP TYPE "DataProcessingAgreementStatus";

-- DropEnum
DROP TYPE "DataProcessingReviewCycleStatus";

-- DropEnum
DROP TYPE "DataProcessingReviewDecisionOutcome";

-- DropEnum
DROP TYPE "DataProcessingReviewEntityType";

-- DropEnum
DROP TYPE "DataProcessingReviewStepType";

-- DropEnum
DROP TYPE "DataSharingAuthorizationStatus";

-- DropEnum
DROP TYPE "DataSharingRecipientRole";

-- DropEnum
DROP TYPE "DataSubjectConsentStatus";

-- DropEnum
DROP TYPE "DataSubjectType";

-- DropEnum
DROP TYPE "DataTransferMechanism";

-- DropEnum
DROP TYPE "DpaAuditEventType";

-- DropEnum
DROP TYPE "DpaSubprocessorStatus";

-- DropEnum
DROP TYPE "EnforcementPolicyScopeMigrationFindingCode";

-- DropEnum
DROP TYPE "EnforcementPolicyScopeMigrationSource";

-- DropEnum
DROP TYPE "EnforcementPolicyScopeResourceType";

-- DropEnum
DROP TYPE "LegalBasisConsentRequirement";

-- DropEnum
DROP TYPE "PrivacyEnforcementMode";

-- DropEnum
DROP TYPE "PrivacyEnforcementScopeType";

-- DropEnum
DROP TYPE "PrivacyLegalBasisType";

-- DropEnum
DROP TYPE "PrivacyPolicyLifecycleEventType";

-- DropEnum
DROP TYPE "PrivacyPolicyLifecycleStatus";

-- DropEnum
DROP TYPE "PrivacyProcessingDataCategory";

-- DropEnum
DROP TYPE "PrivacyProcessingPurpose";

-- DropEnum
DROP TYPE "PrivacyResidualRiskLevel";

-- DropEnum
DROP TYPE "PrivacyRiskDataVolume";

-- DropEnum
DROP TYPE "PrivacyRiskDuration";

-- DropEnum
DROP TYPE "PrivacyRiskFrequency";

-- DropEnum
DROP TYPE "PrivacyRiskLikelihood";

-- DropEnum
DROP TYPE "PrivacyRiskSubjectScale";

-- DropEnum
DROP TYPE "ProcessingActivityDeletionDecisionType";

-- DropEnum
DROP TYPE "ProcessingActivityDeletionJobStatus";

-- DropEnum
DROP TYPE "ProcessingActivityDeletionMethod";

-- DropEnum
DROP TYPE "ProcessingActivityDeletionStatus";

-- DropEnum
DROP TYPE "ProcessingActivityDeletionStepStatus";

-- DropEnum
DROP TYPE "ProcessingActivityDeletionStepTarget";

-- DropEnum
DROP TYPE "ProcessingActivityDpiaDecisionType";

-- DropEnum
DROP TYPE "ProcessingActivityDpiaStatus";

-- DropEnum
DROP TYPE "ProcessingActivityOwnerRole";

-- DropEnum
DROP TYPE "ProcessingActivityRegisterAuditAction";

-- DropEnum
DROP TYPE "ProcessingActivityRegisterExportFormat";

-- DropEnum
DROP TYPE "ProcessingActivityRetentionClass";

-- DropEnum
DROP TYPE "ProcessorPartyRole";

-- DropEnum
DROP TYPE "ProviderAccessGrantMechanism";

-- DropEnum
DROP TYPE "ProviderAccessGrantStatus";

-- DropEnum
DROP TYPE "RetentionStartEvent";

-- DropEnum
DROP TYPE "TransferAssessmentStatus";

-- DropEnum
DROP TYPE "brake_dtc_category";

-- DropEnum
DROP TYPE "brake_dtc_freshness";

-- CreateTable
CREATE TABLE "organization_role_assignment_drift_reconciliation_applications" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "evidence_hash" TEXT NOT NULL,
    "expected_git_commit" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "classification" TEXT NOT NULL,
    "result" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_role_assignment_drift_reconciliation_applicat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_role_assignment_drift_reconciliation_applicati_key" ON "organization_role_assignment_drift_reconciliation_applications"("idempotency_key");

-- CreateIndex
CREATE INDEX "organization_role_assignment_drift_reconciliation_applicati_idx" ON "organization_role_assignment_drift_reconciliation_applications"("organization_id", "membership_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "billing_usage_snapshots_idempotency_key_key" ON "billing_usage_snapshots"("idempotency_key");

-- CreateIndex
CREATE INDEX "brake_evidence_prediction_snapshot_id_idx" ON "brake_evidence"("prediction_snapshot_id");

-- CreateIndex
CREATE INDEX "brake_evidence_vehicle_id_dtc_code_dtc_active_idx" ON "brake_evidence"("vehicle_id", "dtc_code", "dtc_active");

-- CreateIndex
CREATE INDEX "brake_evidence_vehicle_id_dedupe_key_idx" ON "brake_evidence"("vehicle_id", "dedupe_key");

-- CreateIndex
CREATE INDEX "brake_evidence_organization_id_vehicle_id_dedupe_key_idx" ON "brake_evidence"("organization_id", "vehicle_id", "dedupe_key");

-- CreateIndex
CREATE UNIQUE INDEX "brake_evidence_document_extraction_id_axle_key" ON "brake_evidence"("document_extraction_id", "axle");

-- CreateIndex
CREATE INDEX "brake_health_alerts_dedupe_key_status_idx" ON "brake_health_alerts"("dedupe_key", "status");

-- CreateIndex
CREATE UNIQUE INDEX "fines_organization_id_document_extraction_id_key" ON "fines"("organization_id", "document_extraction_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_document_delivery_evidence_org_request_id_key" ON "legal_document_delivery_evidence"("organization_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_invoices_generated_document_id_key" ON "org_invoices"("generated_document_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_invoices_organization_id_document_extraction_id_key" ON "org_invoices"("organization_id", "document_extraction_id");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_emails_org_send_idempotency_key" ON "outbound_emails"("organization_id", "send_idempotency_key");

-- CreateIndex
CREATE INDEX "rental_driving_analyses_assigned_driver_id_idx" ON "rental_driving_analyses"("assigned_driver_id");

-- CreateIndex
CREATE INDEX "rental_driving_analyses_actual_driver_id_idx" ON "rental_driving_analyses"("actual_driver_id");

-- CreateIndex
CREATE INDEX "tire_health_snapshots_setup_model_fingerprint_idx" ON "tire_health_snapshots"("tire_set_id", "model_version", "input_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_damages_organization_id_document_extraction_id_key" ON "vehicle_damages"("organization_id", "document_extraction_id");

-- CreateIndex
CREATE INDEX "vehicle_document_extractions_organization_id_created_at_idx" ON "vehicle_document_extractions"("organization_id", "created_at");

-- CreateIndex
CREATE INDEX "vehicle_document_extractions_vehicle_id_created_at_idx" ON "vehicle_document_extractions"("vehicle_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_service_events_organization_id_document_extraction__key" ON "vehicle_service_events"("organization_id", "document_extraction_id");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_tire_tread_measurements_vehicle_id_document_extract_key" ON "vehicle_tire_tread_measurements"("vehicle_id", "document_extraction_id");

-- CreateIndex
CREATE UNIQUE INDEX "voice_phone_numbers_elevenlabs_ref_digest_key" ON "voice_phone_numbers"("elevenlabs_ref_digest");

-- RenameForeignKey
ALTER TABLE "device_connection_telemetry_recovery_observations" RENAME CONSTRAINT "device_connection_telemetry_recovery_observations_episode_id_fk" TO "device_connection_telemetry_recovery_observations_episode__fkey";

-- RenameForeignKey
ALTER TABLE "document_extraction_content_anchors" RENAME CONSTRAINT "document_extraction_content_anchors_canonical_extraction_id_fke" TO "document_extraction_content_anchors_canonical_extraction_i_fkey";

-- RenameForeignKey
ALTER TABLE "org_task_automation_rule_override_revisions" RENAME CONSTRAINT "org_task_automation_rule_override_revisions_changed_by_user_id_" TO "org_task_automation_rule_override_revisions_changed_by_use_fkey";

-- RenameForeignKey
ALTER TABLE "organization_legal_document_retention_policies" RENAME CONSTRAINT "organization_legal_document_retention_policies_organization_id_" TO "organization_legal_document_retention_policies_organizatio_fkey";

-- RenameForeignKey
ALTER TABLE "organization_role_change_applications" RENAME CONSTRAINT "organization_role_change_applications_created_role_version_id_f" TO "organization_role_change_applications_created_role_version_fkey";

-- RenameForeignKey
ALTER TABLE "task_automation_workflow_migration_records" RENAME CONSTRAINT "task_automation_workflow_migration_records_run_fkey" TO "task_automation_workflow_migration_records_migration_run_i_fkey";

-- RenameForeignKey
ALTER TABLE "vehicle_battery_reference_capacity_changes" RENAME CONSTRAINT "vehicle_battery_reference_capacity_changes_reference_capacity_i" TO "vehicle_battery_reference_capacity_changes_reference_capac_fkey";

-- AddForeignKey
ALTER TABLE "iam_session_revocation_intents" ADD CONSTRAINT "iam_session_revocation_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_role_assignment_drift_reconciliation_applications" ADD CONSTRAINT "org_role_assignment_drift_recon_app_org_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_role_assignment_drift_reconciliation_applications" ADD CONSTRAINT "org_role_assignment_drift_recon_app_mem_fkey" FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_driving_analyses" ADD CONSTRAINT "rental_driving_analyses_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_connection_episode_resolution_audits" ADD CONSTRAINT "device_connection_episode_resolution_audits_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "device_connection_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "device_connection_episode_resolution_outbox" ADD CONSTRAINT "device_connection_episode_resolution_outbox_episode_id_fkey" FOREIGN KEY ("episode_id") REFERENCES "device_connection_episodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_evidence" ADD CONSTRAINT "brake_evidence_prediction_snapshot_id_fkey" FOREIGN KEY ("prediction_snapshot_id") REFERENCES "brake_health_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_evidence" ADD CONSTRAINT "brake_evidence_vehicle_dtc_event_id_fkey" FOREIGN KEY ("vehicle_dtc_event_id") REFERENCES "vehicle_dtc_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_evidence" ADD CONSTRAINT "brake_evidence_superseded_by_evidence_id_fkey" FOREIGN KEY ("superseded_by_evidence_id") REFERENCES "brake_evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_health_alerts" ADD CONSTRAINT "brake_health_alerts_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_health_alerts" ADD CONSTRAINT "brake_health_alerts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_health_alerts" ADD CONSTRAINT "brake_health_alerts_model_snapshot_id_fkey" FOREIGN KEY ("model_snapshot_id") REFERENCES "brake_health_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_health_snapshots" ADD CONSTRAINT "brake_health_snapshots_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "brake_recalculation_audit" ADD CONSTRAINT "brake_recalculation_audit_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "battery_retention_aggregates_organization_id_bucket_start_at_id" RENAME TO "battery_retention_aggregates_organization_id_bucket_start_a_idx";

-- RenameIndex
ALTER INDEX "battery_retention_aggregates_vehicle_id_bucket_type_bucket_star" RENAME TO "battery_retention_aggregates_vehicle_id_bucket_type_bucket__idx";

-- RenameIndex
ALTER INDEX "billing_billable_vehicle_assignments_organization_id_vehicle_id" RENAME TO "billing_billable_vehicle_assignments_organization_id_vehicl_idx";

-- RenameIndex
ALTER INDEX "billing_billable_vehicle_assignments_subscription_item_id_billa" RENAME TO "billing_billable_vehicle_assignments_subscription_item_id_b_idx";

-- RenameIndex
ALTER INDEX "billing_billable_vehicle_assignments_vehicle_id_billable_from_i" RENAME TO "billing_billable_vehicle_assignments_vehicle_id_billable_fr_idx";

-- RenameIndex
ALTER INDEX "billing_domain_event_outbox_deliveries_outbox_event_id_consumer" RENAME TO "billing_domain_event_outbox_deliveries_outbox_event_id_cons_key";

-- RenameIndex
ALTER INDEX "billing_reconciliation_drifts_organization_id_resolved_at_detec" RENAME TO "billing_reconciliation_drifts_organization_id_resolved_at_d_idx";

-- RenameIndex
ALTER INDEX "billing_stripe_catalog_mappings_billing_product_id_stripe_mode_" RENAME TO "billing_stripe_catalog_mappings_billing_product_id_stripe_m_idx";

-- RenameIndex
ALTER INDEX "billing_stripe_catalog_mappings_price_version_id_stripe_mode_ke" RENAME TO "billing_stripe_catalog_mappings_price_version_id_stripe_mod_key";

-- RenameIndex
ALTER INDEX "billing_subscription_items_stripe_item_id_stripe_mode_key" RENAME TO "billing_subscription_items_stripe_subscription_item_id_stri_key";

-- RenameIndex
ALTER INDEX "brake_component_installations_vehicle_id_component_type_instal_" RENAME TO "brake_component_installations_vehicle_id_component_type_ins_idx";

-- RenameIndex
ALTER INDEX "brake_evidence_vehicle_active_idx" RENAME TO "brake_evidence_vehicle_id_active_last_observed_at_idx";

-- RenameIndex
ALTER INDEX "brake_health_alerts_org_status_idx" RENAME TO "brake_health_alerts_organization_id_status_idx";

-- RenameIndex
ALTER INDEX "brake_health_alerts_vehicle_category_idx" RENAME TO "brake_health_alerts_vehicle_id_category_status_idx";

-- RenameIndex
ALTER INDEX "brake_health_alerts_vehicle_status_idx" RENAME TO "brake_health_alerts_vehicle_id_status_idx";

-- RenameIndex
ALTER INDEX "brake_health_snapshots_vehicle_generated_idx" RENAME TO "brake_health_snapshots_vehicle_id_generated_at_idx";

-- RenameIndex
ALTER INDEX "brake_service_applications_org_vehicle_idempotency_key_key" RENAME TO "brake_service_applications_organization_id_vehicle_id_idemp_key";

-- RenameIndex
ALTER INDEX "customer_verification_checks_organization_id_customer_id_kind_s" RENAME TO "customer_verification_checks_organization_id_customer_id_ki_idx";

-- RenameIndex
ALTER INDEX "device_connection_episode_resolution_outbox_status_next_retry_a" RENAME TO "device_connection_episode_resolution_outbox_status_next_ret_idx";

-- RenameIndex
ALTER INDEX "device_connection_telemetry_recovery_observations_episode_id_pr" RENAME TO "device_connection_telemetry_recovery_observations_episode_i_idx";

-- RenameIndex
ALTER INDEX "device_connection_telemetry_recovery_observations_organization_" RENAME TO "device_connection_telemetry_recovery_observations_organizat_idx";

-- RenameIndex
ALTER INDEX "device_connection_telemetry_recovery_observations_vehicle_id_id" RENAME TO "device_connection_telemetry_recovery_observations_vehicle_i_idx";

-- RenameIndex
ALTER INDEX "device_connection_webhook_inbox_processing_status_next_retry__i" RENAME TO "device_connection_webhook_inbox_processing_status_next_retr_idx";

-- RenameIndex
ALTER INDEX "dimo_device_connection_events_provider_vehicle_id_event_type_de" RENAME TO "dimo_device_connection_events_provider_vehicle_id_event_typ_key";

-- RenameIndex
ALTER INDEX "document_extraction_content_anchors_organization_id_content_sha" RENAME TO "document_extraction_content_anchors_organization_id_content_key";

-- RenameIndex
ALTER INDEX "driver_attributions_org_trip_run_model_source_key" RENAME TO "driver_attributions_organization_id_trip_id_analysis_run_id_key";

-- RenameIndex
ALTER INDEX "driver_attributions_org_trip_type_idx" RENAME TO "driver_attributions_organization_id_trip_id_attribution_typ_idx";

-- RenameIndex
ALTER INDEX "driving_analysis_stages_stage_key_model_version_input_finger_id" RENAME TO "driving_analysis_stages_stage_key_model_version_input_finge_idx";

-- RenameIndex
ALTER INDEX "driving_decision_audits_organization_id_subject_type_subject_id" RENAME TO "driving_decision_audits_organization_id_subject_type_subjec_idx";

-- RenameIndex
ALTER INDEX "membership_permission_overrides_membership_id_module_key_revoke" RENAME TO "membership_permission_overrides_membership_id_module_key_re_idx";

-- RenameIndex
ALTER INDEX "membership_permission_overrides_organization_id_membership_id_i" RENAME TO "membership_permission_overrides_organization_id_membership__idx";

-- RenameIndex
ALTER INDEX "notification_retention_purge_runs_org_started_idx" RENAME TO "notification_retention_purge_runs_organization_id_started_a_idx";

-- RenameIndex
ALTER INDEX "notifications_org_legal_hold_idx" RENAME TO "notifications_organization_id_legal_hold_idx";

-- RenameIndex
ALTER INDEX "notifications_org_retention_eligible_idx" RENAME TO "notifications_organization_id_retention_class_deletion_elig_idx";

-- RenameIndex
ALTER INDEX "notifications_organization_id_fingerprint_lifecycle_genera_idx" RENAME TO "notifications_organization_id_fingerprint_lifecycle_generat_idx";

-- RenameIndex
ALTER INDEX "org_invoices_organization_id_vendor_id_invoice_number_display_i" RENAME TO "org_invoices_organization_id_vendor_id_invoice_number_displ_idx";

-- RenameIndex
ALTER INDEX "org_task_automation_rule_override_revisions_organization_id_rul" RENAME TO "org_task_automation_rule_override_revisions_organization_id_idx";

-- RenameIndex
ALTER INDEX "org_task_automation_rule_override_revisions_override_id_created" RENAME TO "org_task_automation_rule_override_revisions_override_id_cre_idx";

-- RenameIndex
ALTER INDEX "org_workflow_change_requests_organization_id_workflow_id_status" RENAME TO "org_workflow_change_requests_organization_id_workflow_id_st_idx";

-- RenameIndex
ALTER INDEX "org_workflow_shadow_comparisons_organization_id_has_deviation_i" RENAME TO "org_workflow_shadow_comparisons_organization_id_has_deviati_idx";

-- RenameIndex
ALTER INDEX "org_workflow_shadow_runs_organization_id_event_idempotency_key_" RENAME TO "org_workflow_shadow_runs_organization_id_event_idempotency__key";

-- RenameIndex
ALTER INDEX "organization_legal_document_retention_policies_organization_id_" RENAME TO "organization_legal_document_retention_policies_organization_key";

-- RenameIndex
ALTER INDEX "organization_legal_documents_organization_id_document_type__idx" RENAME TO "organization_legal_documents_org_type_status_idx";

-- RenameIndex
ALTER INDEX "organization_role_assignments_organization_id_membership_id_is_" RENAME TO "organization_role_assignments_organization_id_membership_id_idx";

-- RenameIndex
ALTER INDEX "organization_role_change_applications_organization_id_organizat" RENAME TO "organization_role_change_applications_organization_id_organ_idx";

-- RenameIndex
ALTER INDEX "organization_role_versions_organization_role_id_status_version_" RENAME TO "organization_role_versions_organization_role_id_status_vers_idx";

-- RenameIndex
ALTER INDEX "password_reset_attempts_scope_key_created_at_idx" RENAME TO "password_reset_attempts_scope_scope_key_created_at_idx";

-- RenameIndex
ALTER INDEX "payment_transactions_provider_object_type_provider_object_id_id" RENAME TO "payment_transactions_provider_object_type_provider_object_i_idx";

-- RenameIndex
ALTER INDEX "rental_driving_analyses_booking_id_calculation_version_input_fi" RENAME TO "rental_driving_analyses_booking_id_calculation_version_inpu_key";

-- RenameIndex
ALTER INDEX "rpm_webhook_candidates_provider_vehicle_id_trigger_type_dedup_b" RENAME TO "rpm_webhook_candidates_provider_vehicle_id_trigger_type_ded_key";

-- RenameIndex
ALTER INDEX "task_automation_workflow_migration_records_org_idx" RENAME TO "task_automation_workflow_migration_records_organization_id_idx";

-- RenameIndex
ALTER INDEX "task_automation_workflow_migration_records_org_legacy_key" RENAME TO "task_automation_workflow_migration_records_organization_id__key";

-- RenameIndex
ALTER INDEX "task_automation_workflow_migration_records_run_idx" RENAME TO "task_automation_workflow_migration_records_migration_run_id_idx";

-- RenameIndex
ALTER INDEX "task_automation_workflow_migration_runs_org_idx" RENAME TO "task_automation_workflow_migration_runs_organization_id_idx";

-- RenameIndex
ALTER INDEX "vehicle_battery_capability_changes_vehicle_id_signal_key_change" RENAME TO "vehicle_battery_capability_changes_vehicle_id_signal_key_ch_idx";

-- RenameIndex
ALTER INDEX "vehicle_battery_reference_capacities_vehicle_id_effective_from_" RENAME TO "vehicle_battery_reference_capacities_vehicle_id_effective_f_idx";

-- RenameIndex
ALTER INDEX "vehicle_battery_reference_capacity_changes_reference_capacity_i" RENAME TO "vehicle_battery_reference_capacity_changes_reference_capaci_idx";

-- RenameIndex
ALTER INDEX "vehicle_battery_reference_capacity_changes_vehicle_id_changed_a" RENAME TO "vehicle_battery_reference_capacity_changes_vehicle_id_chang_idx";

-- RenameIndex
ALTER INDEX "vehicle_document_extractions_organization_id_upload_duplicate_s" RENAME TO "vehicle_document_extractions_organization_id_upload_duplica_idx";

-- RenameIndex
ALTER INDEX "vehicle_document_extractions_upload_context_idx" RENAME TO "vehicle_document_extractions_organization_id_upload_context_idx";

-- RenameIndex
ALTER INDEX "vehicle_driving_capabilities_org_vehicle_provider_key_key" RENAME TO "vehicle_driving_capabilities_organization_id_vehicle_id_pro_key";

-- RenameIndex
ALTER INDEX "vehicle_tire_setup_mount_periods_org_setup_idx" RENAME TO "vehicle_tire_setup_mount_periods_organization_id_tire_setup_idx";

-- RenameIndex
ALTER INDEX "voice_agent_deployments_organization_id_voice_assistant_id_stat" RENAME TO "voice_agent_deployments_organization_id_voice_assistant_id__idx";

-- RenameIndex
ALTER INDEX "voice_billing_periods_organization_id_period_start_period_end_k" RENAME TO "voice_billing_periods_organization_id_period_start_period_e_key";

-- RenameIndex
ALTER INDEX "voice_budget_warning_states_organization_id_period_start_warned" RENAME TO "voice_budget_warning_states_organization_id_period_start_wa_key";

-- RenameIndex
ALTER INDEX "voice_provider_accounts_organization_id_provider_account_type_k" RENAME TO "voice_provider_accounts_organization_id_provider_account_ty_key";

-- RenameIndex
ALTER INDEX "workflow_runtime_rollout_change_requests_organization_id_status" RENAME TO "workflow_runtime_rollout_change_requests_organization_id_st_idx";

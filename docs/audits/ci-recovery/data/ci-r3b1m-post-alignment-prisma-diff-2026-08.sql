-- CreateEnum
CREATE TYPE "DriveType" AS ENUM ('FWD', 'RWD', 'AWD', 'FOUR_WD');

-- CreateEnum
CREATE TYPE "TireSetupCondition" AS ENUM ('NEW_INSTALLED', 'ALREADY_MOUNTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TireChangeType" AS ENUM ('INSTALL', 'ROTATE', 'REPLACE', 'REMOVE', 'CORRECTION');

-- CreateEnum
CREATE TYPE "DeviceConnectionWebhookMappingStatus" AS ENUM ('UNKNOWN', 'MAPPED', 'UNMAPPED_VEHICLE', 'UNMAPPED_BINDING', 'PARSE_FAILED');

-- CreateEnum
CREATE TYPE "BrakeDtcCategory" AS ENUM ('BRAKE_SYSTEM', 'ABS', 'ESC', 'PARKING_BRAKE', 'BRAKE_SENSOR', 'BRAKE_FLUID', 'COMMUNICATION_RELATED', 'NOT_BRAKE_RELATED');

-- CreateEnum
CREATE TYPE "BrakeDtcFreshness" AS ENUM ('FRESH', 'STALE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InsuranceCommunicationChannel" AS ENUM ('EMAIL', 'API', 'WEBHOOK', 'MANUAL');

-- CreateEnum
CREATE TYPE "InsurerHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "InsurerEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "VehicleInsuranceStatus" AS ENUM ('ACTIVE', 'EXPIRING_SOON', 'EXPIRED', 'MISSING', 'PENDING_INQUIRY');

-- CreateEnum
CREATE TYPE "InsuranceInquiryStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'PARTIALLY_SENT', 'FAILED', 'AWAITING_RESPONSE', 'RESPONDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InquiryRecipientDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "InquiryRecipientResponseStatus" AS ENUM ('AWAITING', 'RECEIVED', 'DECLINED', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "LiveSharingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'REVOKED', 'EXPIRED');

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

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DimoPollJobType" ADD VALUE 'DTC_POLL';
ALTER TYPE "DimoPollJobType" ADD VALUE 'DRIVING_EVENTS';
ALTER TYPE "DimoPollJobType" ADD VALUE 'TRIP_TRACKING';

-- AlterEnum
ALTER TYPE "EnrichmentJobType" ADD VALUE 'AI_SPEC';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ServiceEventType" ADD VALUE 'TUV_INSPECTION';
ALTER TYPE "ServiceEventType" ADD VALUE 'BOKRAFT_INSPECTION';
ALTER TYPE "ServiceEventType" ADD VALUE 'FULL_SERVICE';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TireSeason" ADD VALUE 'TRACK';
ALTER TYPE "TireSeason" ADD VALUE 'OTHER';

-- AlterEnum
ALTER TYPE "TripStatus" ADD VALUE 'CANCELLED';

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
ALTER TABLE "high_mobility_health_sync_logs" DROP CONSTRAINT "high_mobility_health_sync_logs_vehicle_fk";

-- DropForeignKey
ALTER TABLE "high_mobility_status_history" DROP CONSTRAINT "high_mobility_status_history_vehicle_fk";

-- DropForeignKey
ALTER TABLE "high_mobility_stream_sync_logs" DROP CONSTRAINT "hm_stream_sync_logs_vehicle_fk";

-- DropForeignKey
ALTER TABLE "hm_signal_group_states" DROP CONSTRAINT "hm_signal_group_states_hm_vehicle_id_fkey";

-- DropForeignKey
ALTER TABLE "hm_signal_group_states" DROP CONSTRAINT "hm_signal_group_states_vehicle_id_fkey";

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

-- DropIndex
DROP INDEX "whatsapp_conversations_organization_id_contact_phone_key";

-- AlterTable
ALTER TABLE "booking_deposits" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "booking_document_bundles" ALTER COLUMN "updated_at" DROP DEFAULT;

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
ALTER TABLE "dimo_vehicles" DROP COLUMN "last_snapshot_at",
DROP COLUMN "snapshot_ev_soc",
DROP COLUMN "snapshot_fuel_level_pct",
DROP COLUMN "snapshot_odometer_km",
ADD COLUMN     "battery_percent" DOUBLE PRECISION,
ADD COLUMN     "fuel_percent" DOUBLE PRECISION,
ADD COLUMN     "powertrain_type" TEXT;

-- AlterTable
ALTER TABLE "generated_documents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "high_mobility_stream_consumer_states" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "high_mobility_vehicles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "hm_signal_group_states" DROP CONSTRAINT "hm_signal_group_states_pkey",
ALTER COLUMN "id" SET DATA TYPE TEXT,
ALTER COLUMN "vehicle_id" SET DATA TYPE TEXT,
ALTER COLUMN "hm_vehicle_id" SET DATA TYPE TEXT,
ADD CONSTRAINT "hm_signal_group_states_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "misuse_case_evidence" DROP COLUMN "event_type",
ADD COLUMN     "eventType" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "misuse_cases" ALTER COLUMN "model_version" SET DEFAULT 'misuse-fingerprint-v1';

-- AlterTable
ALTER TABLE "organization_legal_document_events" ALTER COLUMN "document_type" SET NOT NULL;

-- AlterTable
ALTER TABLE "organization_legal_documents" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "organization_memberships" ADD COLUMN     "department" TEXT,
ADD COLUMN     "field_agent_access" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "position" TEXT,
ADD COLUMN     "role_label" TEXT,
ALTER COLUMN "membership_version" SET DEFAULT 1;

-- AlterTable
ALTER TABLE "organization_rental_rules" DROP COLUMN "additional_driver_policy",
DROP COLUMN "credit_card_required",
DROP COLUMN "foreign_travel_policy",
DROP COLUMN "young_driver_policy",
ADD COLUMN     "additionalDriverPolicy" "RentalAdditionalDriverPolicy",
ADD COLUMN     "creditCardRequired" BOOLEAN,
ADD COLUMN     "foreignTravelPolicy" "RentalForeignTravelPolicy",
ADD COLUMN     "youngDriverPolicy" "RentalYoungDriverPolicy";

-- AlterTable
ALTER TABLE "organization_role_assignment_drift_reconciliation_applications" RENAME CONSTRAINT "org_role_asgn_drift_recon_apps_pkey" TO "organization_role_assignment_drift_reconciliation_applicat_pkey";

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "short_code" TEXT;

-- AlterTable
ALTER TABLE "refresh_tokens" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "rental_contracts" ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "legal_snapshot_frozen_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rental_vehicle_categories" DROP COLUMN "additional_driver_policy",
DROP COLUMN "foreign_travel_policy",
DROP COLUMN "young_driver_policy",
ADD COLUMN     "additionalDriverPolicy" "RentalAdditionalDriverPolicy",
ADD COLUMN     "foreignTravelPolicy" "RentalForeignTravelPolicy",
ADD COLUMN     "youngDriverPolicy" "RentalYoungDriverPolicy";

-- AlterTable
ALTER TABLE "tire_health_snapshots" ALTER COLUMN "prediction_generated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "address" TEXT,
ADD COLUMN     "date_format" TEXT DEFAULT 'DD.MM.YYYY',
ADD COLUMN     "first_name" TEXT,
ADD COLUMN     "language" TEXT DEFAULT 'de',
ADD COLUMN     "last_login_device" TEXT,
ADD COLUMN     "last_login_ip" TEXT,
ADD COLUMN     "last_name" TEXT,
ADD COLUMN     "mobile" TEXT,
ADD COLUMN     "must_change_password" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "password_hash" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "timezone" TEXT DEFAULT 'Europe/Berlin';

-- AlterTable
ALTER TABLE "vehicle_energy_events" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vehicle_enrichment_jobs" ALTER COLUMN "vehicle_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "vehicle_latest_states" ADD COLUMN     "dtc_poll_error" TEXT,
ADD COLUMN     "dtc_poll_status" TEXT,
ADD COLUMN     "last_dtc_poll_at" TIMESTAMP(3),
ADD COLUMN     "last_dtc_successful_check_at" TIMESTAMP(3),
ADD COLUMN     "obd_dtc_list" JSONB,
ADD COLUMN     "traction_battery_added_energy_kwh" DOUBLE PRECISION,
ADD COLUMN     "traction_battery_charging_cable_connected" BOOLEAN,
ADD COLUMN     "traction_battery_charging_power_kw" DOUBLE PRECISION,
ADD COLUMN     "traction_battery_current_energy_kwh" DOUBLE PRECISION,
ADD COLUMN     "traction_battery_current_voltage" DOUBLE PRECISION,
ADD COLUMN     "traction_battery_gross_capacity_kwh" DOUBLE PRECISION,
ADD COLUMN     "traction_battery_is_charging" BOOLEAN,
ADD COLUMN     "traction_battery_power_kw" DOUBLE PRECISION,
ADD COLUMN     "traction_battery_soh_percent" DOUBLE PRECISION,
ADD COLUMN     "traction_battery_temperature_c" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "vehicle_provider_consents" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "scopes" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vehicle_rental_requirement_overrides" DROP COLUMN "additional_driver_policy",
DROP COLUMN "foreign_travel_policy",
DROP COLUMN "young_driver_policy",
ADD COLUMN     "additionalDriverPolicy" "RentalAdditionalDriverPolicy",
ADD COLUMN     "foreignTravelPolicy" "RentalForeignTravelPolicy",
ADD COLUMN     "youngDriverPolicy" "RentalYoungDriverPolicy";

-- AlterTable
ALTER TABLE "vehicle_service_events" ADD COLUMN     "cost_cents" INTEGER,
ADD COLUMN     "document_url" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "workshop_name" TEXT;

-- AlterTable
ALTER TABLE "vehicle_tire_setups" ADD COLUMN     "ai_tire_spec" JSONB,
ADD COLUMN     "burnout_events" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "city_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "confidence_label" TEXT,
ADD COLUMN     "confidence_score" DOUBLE PRECISION,
ADD COLUMN     "created_by" TEXT,
ADD COLUMN     "data_completeness_confidence" DOUBLE PRECISION,
ADD COLUMN     "dot_code_front" TEXT,
ADD COLUMN     "dot_code_rear" TEXT,
ADD COLUMN     "expected_life_km" INTEGER,
ADD COLUMN     "expected_life_km_front" INTEGER,
ADD COLUMN     "expected_life_km_rear" INTEGER,
ADD COLUMN     "front_tire_width_mm" INTEGER,
ADD COLUMN     "harsh_accel_events" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "harsh_brake_events" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "harsh_corner_events" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "health_status" "TireHealthStatus" NOT NULL DEFAULT 'EXCELLENT',
ADD COLUMN     "highway_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "initial_tread_depth_mm" DOUBLE PRECISION,
ADD COLUMN     "initial_tread_front_mm" DOUBLE PRECISION,
ADD COLUMN     "initial_tread_rear_mm" DOUBLE PRECISION,
ADD COLUMN     "initial_tread_source" TEXT,
ADD COLUMN     "installed_odometer_km" DOUBLE PRECISION,
ADD COLUMN     "is_staggered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "k_factor_calibration_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "k_factor_front" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "k_factor_rear" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "last_recalculated_at" TIMESTAMP(3),
ADD COLUMN     "legal_minimum_mm" DOUBLE PRECISION,
ADD COLUMN     "load_index_front" TEXT,
ADD COLUMN     "load_index_rear" TEXT,
ADD COLUMN     "model_confidence" DOUBLE PRECISION,
ADD COLUMN     "name" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "operational_replacement_mm" DOUBLE PRECISION,
ADD COLUMN     "organization_id" TEXT,
ADD COLUMN     "overall_health_percent" DOUBLE PRECISION,
ADD COLUMN     "overall_remaining_km" INTEGER,
ADD COLUMN     "rear_tire_width_mm" INTEGER,
ADD COLUMN     "recommended_replacement_mm" DOUBLE PRECISION,
ADD COLUMN     "reference_new_tread_mm" DOUBLE PRECISION,
ADD COLUMN     "reference_new_tread_source" TEXT,
ADD COLUMN     "regen_braking_factor" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
ADD COLUMN     "regen_braking_factor_front" DOUBLE PRECISION,
ADD COLUMN     "regen_braking_factor_rear" DOUBLE PRECISION,
ADD COLUMN     "removed_odometer_km" DOUBLE PRECISION,
ADD COLUMN     "replacement_threshold_source" TEXT,
ADD COLUMN     "rural_km" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "speed_index_front" TEXT,
ADD COLUMN     "speed_index_rear" TEXT,
ADD COLUMN     "tire_condition" "TireSetupCondition" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "tire_spec_confidence" DOUBLE PRECISION,
ADD COLUMN     "total_km_on_set" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "updated_by" TEXT,
ADD COLUMN     "wear_rate_mm_per_1000km" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "vehicle_tire_tread_measurements" ADD COLUMN     "is_calibration_point" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "odometer_at_measurement" DOUBLE PRECISION,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual',
ADD COLUMN     "workshop_name" TEXT;

-- AlterTable
ALTER TABLE "vehicles" ADD COLUMN     "brake_force_front_percent" DOUBLE PRECISION,
ADD COLUMN     "drive_type" "DriveType",
ADD COLUMN     "front_weight_distribution_pct" DOUBLE PRECISION,
ADD COLUMN     "hv_battery_capacity_kwh" DOUBLE PRECISION,
ADD COLUMN     "last_bokraft_date" TIMESTAMP(3),
ADD COLUMN     "last_oil_change_date" TIMESTAMP(3),
ADD COLUMN     "last_oil_change_odometer_km" INTEGER,
ADD COLUMN     "last_service_date" TIMESTAMP(3),
ADD COLUMN     "last_service_odometer_km" INTEGER,
ADD COLUMN     "last_tuv_date" TIMESTAMP(3),
ADD COLUMN     "next_bokraft_date" TIMESTAMP(3),
ADD COLUMN     "next_service_due_date" TIMESTAMP(3),
ADD COLUMN     "next_tuv_date" TIMESTAMP(3),
ADD COLUMN     "oil_change_interval_km" INTEGER,
ADD COLUMN     "oil_change_interval_months" INTEGER,
ADD COLUMN     "service_interval_manufacturer_km" INTEGER,
ADD COLUMN     "service_interval_manufacturer_months" INTEGER,
ADD COLUMN     "tank_capacity_liters" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "vendor_vehicles" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "vendors" ADD COLUMN     "service_areas" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "whatsapp_messages" ALTER COLUMN "updated_at" DROP DEFAULT;

-- DropTable
DROP TABLE "organization_legal_document_repair_log";

-- DropTable
DROP TABLE "rental_rules_integrity_repair_log";

-- DropEnum
DROP TYPE "brake_dtc_category";

-- DropEnum
DROP TYPE "brake_dtc_freshness";

-- CreateTable
CREATE TABLE "tire_position_history" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "tire_set_id" TEXT,
    "tire_id" TEXT,
    "from_position" "TirePosition",
    "to_position" "TirePosition" NOT NULL,
    "changed_at" TIMESTAMP(3) NOT NULL,
    "odometer_km" DOUBLE PRECISION,
    "change_type" "TireChangeType" NOT NULL,
    "rotation_template" TEXT,
    "notes" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_position_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_measurements" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "tire_id" TEXT NOT NULL,
    "measured_tread_mm" DOUBLE PRECISION NOT NULL,
    "measured_at" TIMESTAMP(3) NOT NULL,
    "odometer_km" DOUBLE PRECISION,
    "measured_by" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_measurements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tire_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "tire_id" TEXT,
    "tire_set_id" TEXT,
    "type" "TireEventType" NOT NULL,
    "payload" JSONB,
    "created_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tire_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_chat_agents" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "dimo_agent_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_chat_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_partners" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "country_scope" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supported_inquiry_types" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "supported_insurance_models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accepted_historical_data" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accepted_live_data" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "communication_channel" "InsuranceCommunicationChannel" NOT NULL DEFAULT 'EMAIL',
    "config_json" JSONB,
    "credentials_json" JSONB,
    "health_status" "InsurerHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "environment" "InsurerEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "last_tested_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "last_failure_reason" TEXT,
    "sla_info" TEXT,
    "max_lookback_days" INTEGER,
    "supports_dynamic_insurance" BOOLEAN NOT NULL DEFAULT false,
    "supports_usage_based" BOOLEAN NOT NULL DEFAULT false,
    "supports_kilometer_based" BOOLEAN NOT NULL DEFAULT false,
    "supports_driving_score_based" BOOLEAN NOT NULL DEFAULT false,
    "ranking_weight" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_partners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_partner_contacts" (
    "id" TEXT NOT NULL,
    "insurance_partner_id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "role_title" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_partner_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_partner_org_access" (
    "id" TEXT NOT NULL,
    "insurance_partner_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_partner_org_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_disclosure_templates" (
    "id" TEXT NOT NULL,
    "insurer_key" TEXT,
    "inquiry_type" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_disclosure_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_inquiry_templates" (
    "id" TEXT NOT NULL,
    "insurer_key" TEXT,
    "inquiry_type" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "subject_template" TEXT NOT NULL,
    "body_template" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_inquiry_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_insurance_records" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "insurer_name" TEXT,
    "policy_number" TEXT,
    "insurance_type" TEXT,
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "status" "VehicleInsuranceStatus" NOT NULL DEFAULT 'MISSING',
    "linked_document_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_insurance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_inquiries" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "inquiry_type" TEXT NOT NULL,
    "selected_historical_data" JSONB NOT NULL,
    "selected_live_data" JSONB NOT NULL,
    "selected_time_range" JSONB NOT NULL,
    "selected_insurance_models" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "review_snapshot_json" JSONB,
    "status" "InsuranceInquiryStatus" NOT NULL DEFAULT 'DRAFT',
    "correlation_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_inquiry_recipients" (
    "id" TEXT NOT NULL,
    "inquiry_id" TEXT NOT NULL,
    "insurer_id" TEXT NOT NULL,
    "channel_type" "InsuranceCommunicationChannel" NOT NULL,
    "delivery_status" "InquiryRecipientDeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "sent_at" TIMESTAMP(3),
    "response_status" "InquiryRecipientResponseStatus" NOT NULL DEFAULT 'AWAITING',
    "response_received_at" TIMESTAMP(3),
    "failure_reason" TEXT,
    "external_reference" TEXT,
    "payload_snapshot_json" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_inquiry_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_data_authorization_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "insurer_id" TEXT NOT NULL,
    "inquiry_id" TEXT,
    "disclosed_historical_data" JSONB NOT NULL,
    "authorized_live_data" JSONB NOT NULL,
    "selected_time_range" JSONB NOT NULL,
    "aggregation_settings" JSONB,
    "purpose" TEXT NOT NULL,
    "notice_version" INTEGER NOT NULL,
    "notice_title_snapshot" TEXT NOT NULL,
    "notice_body_snapshot" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "session_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "transmission_channel" TEXT,
    "transmission_result" TEXT,
    "failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insurance_data_authorization_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insurance_live_sharing_permissions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "insurer_id" TEXT NOT NULL,
    "inquiry_id" TEXT,
    "enabled_data_categories" JSONB NOT NULL,
    "aggregation_settings" JSONB,
    "reporting_frequency" TEXT,
    "status" "LiveSharingStatus" NOT NULL DEFAULT 'DRAFT',
    "valid_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "valid_until" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "revoked_by" TEXT,
    "revoke_reason" TEXT,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insurance_live_sharing_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_changelogs" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT[],
    "reason" TEXT,
    "previous_behavior" TEXT,
    "details" TEXT,
    "affects_architecture" BOOLEAN NOT NULL DEFAULT false,
    "module" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "platform_changelogs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_logbook_configs" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "enabled_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "enabled_by" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vehicle_logbook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenant_insight_policies" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "refresh_interval_min" INTEGER NOT NULL DEFAULT 30,
    "max_visible_insights" INTEGER NOT NULL DEFAULT 4,
    "enabled_types" JSONB,
    "policy_overrides" JSONB,
    "use_llm_formatting" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenant_insight_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_tire_spec_jobs" (
    "id" TEXT NOT NULL,
    "vehicle_id" TEXT,
    "tire_setup_id" TEXT,
    "brand" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "tire_size" TEXT NOT NULL,
    "load_index" TEXT NOT NULL,
    "speed_index" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "raw_response" TEXT,
    "normalized_result" JSONB,
    "confidence_score" DOUBLE PRECISION,
    "error_message" TEXT,
    "applied_at" TIMESTAMP(3),
    "applied_to_setup_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "ai_tire_spec_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tire_position_history_vehicle_id_idx" ON "tire_position_history"("vehicle_id");

-- CreateIndex
CREATE INDEX "tire_position_history_tire_set_id_idx" ON "tire_position_history"("tire_set_id");

-- CreateIndex
CREATE INDEX "tire_position_history_tire_id_changed_at_idx" ON "tire_position_history"("tire_id", "changed_at");

-- CreateIndex
CREATE INDEX "tire_measurements_vehicle_id_idx" ON "tire_measurements"("vehicle_id");

-- CreateIndex
CREATE INDEX "tire_measurements_tire_id_measured_at_idx" ON "tire_measurements"("tire_id", "measured_at");

-- CreateIndex
CREATE INDEX "tire_events_vehicle_id_idx" ON "tire_events"("vehicle_id");

-- CreateIndex
CREATE INDEX "tire_events_tire_set_id_idx" ON "tire_events"("tire_set_id");

-- CreateIndex
CREATE INDEX "tire_events_tire_id_idx" ON "tire_events"("tire_id");

-- CreateIndex
CREATE UNIQUE INDEX "organization_chat_agents_organization_id_key" ON "organization_chat_agents"("organization_id");

-- CreateIndex
CREATE INDEX "organization_chat_agents_organization_id_idx" ON "organization_chat_agents"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_partners_key_key" ON "insurance_partners"("key");

-- CreateIndex
CREATE INDEX "insurance_partners_is_enabled_idx" ON "insurance_partners"("is_enabled");

-- CreateIndex
CREATE INDEX "insurance_partner_contacts_insurance_partner_id_idx" ON "insurance_partner_contacts"("insurance_partner_id");

-- CreateIndex
CREATE INDEX "insurance_partner_org_access_organization_id_idx" ON "insurance_partner_org_access"("organization_id");

-- CreateIndex
CREATE UNIQUE INDEX "insurance_partner_org_access_insurance_partner_id_organizat_key" ON "insurance_partner_org_access"("insurance_partner_id", "organization_id");

-- CreateIndex
CREATE INDEX "insurance_disclosure_templates_insurer_key_idx" ON "insurance_disclosure_templates"("insurer_key");

-- CreateIndex
CREATE INDEX "insurance_disclosure_templates_is_active_idx" ON "insurance_disclosure_templates"("is_active");

-- CreateIndex
CREATE INDEX "insurance_inquiry_templates_insurer_key_idx" ON "insurance_inquiry_templates"("insurer_key");

-- CreateIndex
CREATE INDEX "insurance_inquiry_templates_is_active_idx" ON "insurance_inquiry_templates"("is_active");

-- CreateIndex
CREATE INDEX "vehicle_insurance_records_organization_id_idx" ON "vehicle_insurance_records"("organization_id");

-- CreateIndex
CREATE INDEX "vehicle_insurance_records_vehicle_id_idx" ON "vehicle_insurance_records"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_insurance_records_status_idx" ON "vehicle_insurance_records"("status");

-- CreateIndex
CREATE INDEX "insurance_inquiries_organization_id_idx" ON "insurance_inquiries"("organization_id");

-- CreateIndex
CREATE INDEX "insurance_inquiries_user_id_idx" ON "insurance_inquiries"("user_id");

-- CreateIndex
CREATE INDEX "insurance_inquiries_vehicle_id_idx" ON "insurance_inquiries"("vehicle_id");

-- CreateIndex
CREATE INDEX "insurance_inquiries_status_idx" ON "insurance_inquiries"("status");

-- CreateIndex
CREATE INDEX "insurance_inquiries_correlation_id_idx" ON "insurance_inquiries"("correlation_id");

-- CreateIndex
CREATE INDEX "insurance_inquiry_recipients_inquiry_id_idx" ON "insurance_inquiry_recipients"("inquiry_id");

-- CreateIndex
CREATE INDEX "insurance_inquiry_recipients_insurer_id_idx" ON "insurance_inquiry_recipients"("insurer_id");

-- CreateIndex
CREATE INDEX "insurance_inquiry_recipients_delivery_status_idx" ON "insurance_inquiry_recipients"("delivery_status");

-- CreateIndex
CREATE INDEX "insurance_data_authorization_logs_organization_id_idx" ON "insurance_data_authorization_logs"("organization_id");

-- CreateIndex
CREATE INDEX "insurance_data_authorization_logs_user_id_idx" ON "insurance_data_authorization_logs"("user_id");

-- CreateIndex
CREATE INDEX "insurance_data_authorization_logs_vehicle_id_idx" ON "insurance_data_authorization_logs"("vehicle_id");

-- CreateIndex
CREATE INDEX "insurance_data_authorization_logs_insurer_id_idx" ON "insurance_data_authorization_logs"("insurer_id");

-- CreateIndex
CREATE INDEX "insurance_data_authorization_logs_inquiry_id_idx" ON "insurance_data_authorization_logs"("inquiry_id");

-- CreateIndex
CREATE INDEX "insurance_data_authorization_logs_correlation_id_idx" ON "insurance_data_authorization_logs"("correlation_id");

-- CreateIndex
CREATE INDEX "insurance_data_authorization_logs_confirmed_at_idx" ON "insurance_data_authorization_logs"("confirmed_at");

-- CreateIndex
CREATE INDEX "insurance_live_sharing_permissions_organization_id_idx" ON "insurance_live_sharing_permissions"("organization_id");

-- CreateIndex
CREATE INDEX "insurance_live_sharing_permissions_vehicle_id_idx" ON "insurance_live_sharing_permissions"("vehicle_id");

-- CreateIndex
CREATE INDEX "insurance_live_sharing_permissions_insurer_id_idx" ON "insurance_live_sharing_permissions"("insurer_id");

-- CreateIndex
CREATE INDEX "insurance_live_sharing_permissions_status_idx" ON "insurance_live_sharing_permissions"("status");

-- CreateIndex
CREATE INDEX "platform_changelogs_created_at_idx" ON "platform_changelogs"("created_at");

-- CreateIndex
CREATE INDEX "platform_changelogs_module_idx" ON "platform_changelogs"("module");

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_logbook_configs_vehicle_id_key" ON "vehicle_logbook_configs"("vehicle_id");

-- CreateIndex
CREATE UNIQUE INDEX "tenant_insight_policies_organization_id_key" ON "tenant_insight_policies"("organization_id");

-- CreateIndex
CREATE INDEX "ai_tire_spec_jobs_vehicle_id_idx" ON "ai_tire_spec_jobs"("vehicle_id");

-- CreateIndex
CREATE INDEX "ai_tire_spec_jobs_status_idx" ON "ai_tire_spec_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_usage_snapshots_idempotency_key_key" ON "billing_usage_snapshots"("idempotency_key");

-- CreateIndex
CREATE INDEX "booking_deposits_booking_id_idx" ON "booking_deposits"("booking_id");

-- CreateIndex
CREATE INDEX "booking_document_bundles_booking_id_idx" ON "booking_document_bundles"("booking_id");

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
CREATE UNIQUE INDEX "org_invoices_organization_id_sequence_year_sequence_number_key" ON "org_invoices"("organization_id", "sequence_year", "sequence_number");

-- CreateIndex
CREATE UNIQUE INDEX "org_invoices_organization_id_document_extraction_id_key" ON "org_invoices"("organization_id", "document_extraction_id");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_short_code_key" ON "organizations"("short_code");

-- CreateIndex
CREATE UNIQUE INDEX "outbound_emails_org_send_idempotency_key" ON "outbound_emails"("organization_id", "send_idempotency_key");

-- CreateIndex
CREATE INDEX "rental_contracts_booking_id_idx" ON "rental_contracts"("booking_id");

-- CreateIndex
CREATE INDEX "rental_driving_analyses_assigned_driver_id_idx" ON "rental_driving_analyses"("assigned_driver_id");

-- CreateIndex
CREATE INDEX "rental_driving_analyses_actual_driver_id_idx" ON "rental_driving_analyses"("actual_driver_id");

-- CreateIndex
CREATE UNIQUE INDEX "stations_organization_id_code_key" ON "stations"("organization_id", "code");

-- CreateIndex
CREATE INDEX "support_tickets_ticket_number_idx" ON "support_tickets"("ticket_number");

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
CREATE INDEX "vehicle_tire_setups_organization_id_vehicle_id_idx" ON "vehicle_tire_setups"("organization_id", "vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_tire_setups_status_idx" ON "vehicle_tire_setups"("status");

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
ALTER TABLE "organization_role_assignment_drift_reconciliation_applications" RENAME CONSTRAINT "org_role_asgn_drift_recon_apps_mbr_id_fkey" TO "org_role_assignment_drift_recon_app_mem_fkey";

-- RenameForeignKey
ALTER TABLE "organization_role_assignment_drift_reconciliation_applications" RENAME CONSTRAINT "org_role_asgn_drift_recon_apps_org_id_fkey" TO "org_role_assignment_drift_recon_app_org_fkey";

-- RenameForeignKey
ALTER TABLE "organization_role_change_applications" RENAME CONSTRAINT "organization_role_change_applications_created_role_version_id_f" TO "organization_role_change_applications_created_role_version_fkey";

-- RenameForeignKey
ALTER TABLE "task_automation_workflow_migration_records" RENAME CONSTRAINT "task_automation_workflow_migration_records_run_fkey" TO "task_automation_workflow_migration_records_migration_run_i_fkey";

-- RenameForeignKey
ALTER TABLE "vehicle_battery_reference_capacity_changes" RENAME CONSTRAINT "vehicle_battery_reference_capacity_changes_reference_capacity_i" TO "vehicle_battery_reference_capacity_changes_reference_capac_fkey";

-- AddForeignKey
ALTER TABLE "iam_session_revocation_intents" ADD CONSTRAINT "iam_session_revocation_intents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_position_history" ADD CONSTRAINT "tire_position_history_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_position_history" ADD CONSTRAINT "tire_position_history_tire_set_id_fkey" FOREIGN KEY ("tire_set_id") REFERENCES "vehicle_tire_setups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_position_history" ADD CONSTRAINT "tire_position_history_tire_id_fkey" FOREIGN KEY ("tire_id") REFERENCES "tires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_measurements" ADD CONSTRAINT "tire_measurements_tire_id_fkey" FOREIGN KEY ("tire_id") REFERENCES "tires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_events" ADD CONSTRAINT "tire_events_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_events" ADD CONSTRAINT "tire_events_tire_id_fkey" FOREIGN KEY ("tire_id") REFERENCES "tires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tire_events" ADD CONSTRAINT "tire_events_tire_set_id_fkey" FOREIGN KEY ("tire_set_id") REFERENCES "vehicle_tire_setups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_driving_analyses" ADD CONSTRAINT "rental_driving_analyses_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_invoices" ADD CONSTRAINT "org_invoices_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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

-- AddForeignKey
ALTER TABLE "organization_chat_agents" ADD CONSTRAINT "organization_chat_agents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_partner_contacts" ADD CONSTRAINT "insurance_partner_contacts_insurance_partner_id_fkey" FOREIGN KEY ("insurance_partner_id") REFERENCES "insurance_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_partner_org_access" ADD CONSTRAINT "insurance_partner_org_access_insurance_partner_id_fkey" FOREIGN KEY ("insurance_partner_id") REFERENCES "insurance_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_disclosure_templates" ADD CONSTRAINT "insurance_disclosure_templates_insurer_key_fkey" FOREIGN KEY ("insurer_key") REFERENCES "insurance_partners"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_inquiry_templates" ADD CONSTRAINT "insurance_inquiry_templates_insurer_key_fkey" FOREIGN KEY ("insurer_key") REFERENCES "insurance_partners"("key") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_inquiry_recipients" ADD CONSTRAINT "insurance_inquiry_recipients_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "insurance_inquiries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_inquiry_recipients" ADD CONSTRAINT "insurance_inquiry_recipients_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "insurance_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_data_authorization_logs" ADD CONSTRAINT "insurance_data_authorization_logs_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "insurance_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_data_authorization_logs" ADD CONSTRAINT "insurance_data_authorization_logs_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "insurance_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_live_sharing_permissions" ADD CONSTRAINT "insurance_live_sharing_permissions_insurer_id_fkey" FOREIGN KEY ("insurer_id") REFERENCES "insurance_partners"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insurance_live_sharing_permissions" ADD CONSTRAINT "insurance_live_sharing_permissions_inquiry_id_fkey" FOREIGN KEY ("inquiry_id") REFERENCES "insurance_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_logbook_configs" ADD CONSTRAINT "vehicle_logbook_configs_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenant_insight_policies" ADD CONSTRAINT "tenant_insight_policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "high_mobility_status_history" ADD CONSTRAINT "high_mobility_status_history_high_mobility_vehicle_id_fkey" FOREIGN KEY ("high_mobility_vehicle_id") REFERENCES "high_mobility_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "high_mobility_health_sync_logs" ADD CONSTRAINT "high_mobility_health_sync_logs_high_mobility_vehicle_id_fkey" FOREIGN KEY ("high_mobility_vehicle_id") REFERENCES "high_mobility_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_data_source_links" ADD CONSTRAINT "vehicle_data_source_links_source_reference_id_fkey" FOREIGN KEY ("source_reference_id") REFERENCES "high_mobility_vehicles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "high_mobility_stream_sync_logs" ADD CONSTRAINT "high_mobility_stream_sync_logs_high_mobility_vehicle_id_fkey" FOREIGN KEY ("high_mobility_vehicle_id") REFERENCES "high_mobility_vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hm_signal_group_states" ADD CONSTRAINT "hm_signal_group_states_hm_vehicle_id_fkey" FOREIGN KEY ("hm_vehicle_id") REFERENCES "high_mobility_vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hm_signal_group_states" ADD CONSTRAINT "hm_signal_group_states_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

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
ALTER INDEX "idx_hm_sync_logs_requested" RENAME TO "high_mobility_health_sync_logs_requested_at_idx";

-- RenameIndex
ALTER INDEX "idx_hm_sync_logs_vehicle" RENAME TO "high_mobility_health_sync_logs_high_mobility_vehicle_id_idx";

-- RenameIndex
ALTER INDEX "idx_hm_status_history_created" RENAME TO "high_mobility_status_history_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_hm_status_history_vehicle" RENAME TO "high_mobility_status_history_high_mobility_vehicle_id_idx";

-- RenameIndex
ALTER INDEX "idx_hm_consumer_state_env" RENAME TO "high_mobility_stream_consumer_states_environment_idx";

-- RenameIndex
ALTER INDEX "uq_hm_consumer_state" RENAME TO "high_mobility_stream_consumer_states_environment_applicatio_key";

-- RenameIndex
ALTER INDEX "idx_hm_stream_logs_created" RENAME TO "high_mobility_stream_sync_logs_created_at_idx";

-- RenameIndex
ALTER INDEX "idx_hm_stream_logs_status" RENAME TO "high_mobility_stream_sync_logs_ingest_status_idx";

-- RenameIndex
ALTER INDEX "idx_hm_stream_logs_topic" RENAME TO "high_mobility_stream_sync_logs_topic_idx";

-- RenameIndex
ALTER INDEX "idx_hm_stream_logs_vehicle" RENAME TO "high_mobility_stream_sync_logs_high_mobility_vehicle_id_idx";

-- RenameIndex
ALTER INDEX "idx_hm_stream_logs_vin" RENAME TO "high_mobility_stream_sync_logs_vin_idx";

-- RenameIndex
ALTER INDEX "uq_hm_stream_message_id" RENAME TO "high_mobility_stream_sync_logs_message_id_key";

-- RenameIndex
ALTER INDEX "idx_hm_vehicles_clearance" RENAME TO "high_mobility_vehicles_clearance_status_idx";

-- RenameIndex
ALTER INDEX "idx_hm_vehicles_org" RENAME TO "high_mobility_vehicles_organization_id_idx";

-- RenameIndex
ALTER INDEX "idx_hm_vehicles_package" RENAME TO "high_mobility_vehicles_package_type_idx";

-- RenameIndex
ALTER INDEX "idx_hm_vehicles_source" RENAME TO "high_mobility_vehicles_source_mode_idx";

-- RenameIndex
ALTER INDEX "idx_hm_vehicles_sq_vehicle" RENAME TO "high_mobility_vehicles_synqdrive_vehicle_id_idx";

-- RenameIndex
ALTER INDEX "idx_hm_vehicles_vin" RENAME TO "high_mobility_vehicles_vin_idx";

-- RenameIndex
ALTER INDEX "uq_hm_vehicle_active" RENAME TO "high_mobility_vehicles_vin_package_type_source_mode_is_acti_key";

-- RenameIndex
ALTER INDEX "hm_compatibility_records_brand_model_model_year_from_model_year" RENAME TO "hm_compatibility_records_brand_model_model_year_from_model__key";

-- RenameIndex
ALTER INDEX "uq_signal_group_vehicle" RENAME TO "hm_signal_group_states_vehicle_id_signal_group_key";

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
ALTER INDEX "org_tasks_org_dedup_key" RENAME TO "org_tasks_organization_id_dedup_key_key";

-- RenameIndex
ALTER INDEX "org_workflow_change_requests_organization_id_workflow_id_status" RENAME TO "org_workflow_change_requests_organization_id_workflow_id_st_idx";

-- RenameIndex
ALTER INDEX "org_workflow_shadow_comparisons_organization_id_has_deviation_i" RENAME TO "org_workflow_shadow_comparisons_organization_id_has_deviati_idx";

-- RenameIndex
ALTER INDEX "org_workflow_shadow_runs_organization_id_event_idempotency_key_" RENAME TO "org_workflow_shadow_runs_organization_id_event_idempotency__key";

-- RenameIndex
ALTER INDEX "organization_legal_document_retention_policies_organization_id_" RENAME TO "organization_legal_document_retention_policies_organization_key";

-- RenameIndex
ALTER INDEX "org_role_asgn_drift_recon_apps_idem_key" RENAME TO "organization_role_assignment_drift_reconciliation_applicati_key";

-- RenameIndex
ALTER INDEX "org_role_asgn_drift_recon_apps_org_mbr_created_idx" RENAME TO "organization_role_assignment_drift_reconciliation_applicati_idx";

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
ALTER INDEX "user_notification_preferences_user_id_organization_id_category_" RENAME TO "user_notification_preferences_user_id_organization_id_categ_key";

-- RenameIndex
ALTER INDEX "vehicle_battery_capability_changes_vehicle_id_signal_key_change" RENAME TO "vehicle_battery_capability_changes_vehicle_id_signal_key_ch_idx";

-- RenameIndex
ALTER INDEX "vehicle_battery_reference_capacities_vehicle_id_effective_from_" RENAME TO "vehicle_battery_reference_capacities_vehicle_id_effective_f_idx";

-- RenameIndex
ALTER INDEX "vehicle_battery_reference_capacity_changes_reference_capacity_i" RENAME TO "vehicle_battery_reference_capacity_changes_reference_capaci_idx";

-- RenameIndex
ALTER INDEX "vehicle_battery_reference_capacity_changes_vehicle_id_changed_a" RENAME TO "vehicle_battery_reference_capacity_changes_vehicle_id_chang_idx";

-- RenameIndex
ALTER INDEX "idx_data_source_links_ref" RENAME TO "vehicle_data_source_links_source_reference_id_idx";

-- RenameIndex
ALTER INDEX "idx_data_source_links_type" RENAME TO "vehicle_data_source_links_source_type_idx";

-- RenameIndex
ALTER INDEX "idx_data_source_links_vehicle" RENAME TO "vehicle_data_source_links_vehicle_id_idx";

-- RenameIndex
ALTER INDEX "uq_data_source_link_active" RENAME TO "vehicle_data_source_links_vehicle_id_source_type_source_sub_key";

-- RenameIndex
ALTER INDEX "vdsl_consent_id_idx" RENAME TO "vehicle_data_source_links_consent_id_idx";

-- RenameIndex
ALTER INDEX "vdsl_provider_idx" RENAME TO "vehicle_data_source_links_provider_idx";

-- RenameIndex
ALTER INDEX "vehicle_document_extractions_organization_id_upload_duplicate_s" RENAME TO "vehicle_document_extractions_organization_id_upload_duplica_idx";

-- RenameIndex
ALTER INDEX "vehicle_document_extractions_upload_context_idx" RENAME TO "vehicle_document_extractions_organization_id_upload_context_idx";

-- RenameIndex
ALTER INDEX "vehicle_driving_capabilities_org_vehicle_provider_key_key" RENAME TO "vehicle_driving_capabilities_organization_id_vehicle_id_pro_key";

-- RenameIndex
ALTER INDEX "vpc_granted_at_idx" RENAME TO "vehicle_provider_consents_granted_at_idx";

-- RenameIndex
ALTER INDEX "vpc_organization_id_idx" RENAME TO "vehicle_provider_consents_organization_id_idx";

-- RenameIndex
ALTER INDEX "vpc_provider_status_idx" RENAME TO "vehicle_provider_consents_provider_status_idx";

-- RenameIndex
ALTER INDEX "vpc_vehicle_id_idx" RENAME TO "vehicle_provider_consents_vehicle_id_idx";

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
ALTER INDEX "whatsapp_ai_suggestions_organization_id_conversation_id_created" RENAME TO "whatsapp_ai_suggestions_organization_id_conversation_id_cre_idx";

-- RenameIndex
ALTER INDEX "whatsapp_conversations_organization_id_contact_phone_normalized" RENAME TO "whatsapp_conversations_organization_id_contact_phone_normal_key";

-- RenameIndex
ALTER INDEX "workflow_runtime_rollout_change_requests_organization_id_status" RENAME TO "workflow_runtime_rollout_change_requests_organization_id_st_idx";

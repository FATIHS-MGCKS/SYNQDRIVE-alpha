-- Battery Health V2 shared enums (P0 — additive only).
-- Idempotent CREATE TYPE pattern for partially-migrated databases.
-- See docs/architecture/battery-health-v2-prisma-plan.md §3.

DO $$ BEGIN
    CREATE TYPE "BatteryMeasurementType" AS ENUM (
        'LIVE_VOLTAGE',
        'LIVE_LOADED_VOLTAGE',
        'CHARGING_VOLTAGE',
        'REST_AFTER_SHUTDOWN',
        'REST_60M',
        'REST_6H',
        'PRE_WAKE_VOLTAGE',
        'PRE_START_VOLTAGE',
        'START_DIP_PROXY',
        'RECOVERY_5S_VOLTAGE',
        'RECOVERY_30S_VOLTAGE',
        'RECOVERY_PROXY_VOLTAGE',
        'WORKSHOP_OCV',
        'WORKSHOP_LOAD_TEST',
        'LIVE_HV_SOC',
        'LIVE_HV_RANGE',
        'LIVE_HV_CURRENT_ENERGY',
        'LIVE_HV_CHARGING_POWER',
        'PROVIDER_HV_SOH',
        'WORKSHOP_HV_SOH',
        'DOCUMENT_HV_SOH',
        'CHARGE_SESSION_CAPACITY',
        'DISCHARGE_SESSION_CAPACITY',
        'SESSION_MISSED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryMeasurementQuality" AS ENUM (
        'VALID',
        'VALID_PROXY',
        'SHADOW',
        'CONTAMINATED_BY_WAKE',
        'CONTAMINATED_BY_CHARGING',
        'CONTAMINATED_BY_LOAD',
        'CONTAMINATED_BY_ACTIVE_TRIP',
        'INSUFFICIENT_CADENCE',
        'INSUFFICIENT_COVERAGE',
        'TIMESTAMP_INCONSISTENT',
        'STALE',
        'MISSED',
        'UNSUPPORTED_PROFILE',
        'PROVIDER_DELAY',
        'PROVIDER_ERROR'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryMeasurementSessionType" AS ENUM (
        'LV_REST_WINDOW',
        'LV_ICE_START',
        'HV_DIMO_RECHARGE_SEGMENT',
        'HV_POLL_CHARGE_WINDOW',
        'HV_DISCHARGE_WINDOW'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryMeasurementSessionStatus" AS ENUM (
        'PLANNED',
        'ACTIVE',
        'COMPLETED',
        'MISSED',
        'CANCELLED',
        'INVALID'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryAssessmentType" AS ENUM (
        'LV_ESTIMATED_HEALTH',
        'HV_SOH_PROVIDER',
        'HV_CAPACITY_SESSION',
        'HV_CAPACITY_SHADOW'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryAssessmentMaturity" AS ENUM (
        'HIGH',
        'MEDIUM',
        'LOW',
        'INSUFFICIENT_DATA'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryCapabilityStatus" AS ENUM (
        'AVAILABLE',
        'AVAILABLE_STALE',
        'AVAILABLE_NULL',
        'NOT_LISTED',
        'QUERY_ERROR',
        'UNSUPPORTED'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryDriveProfile" AS ENUM (
        'ICE',
        'HEV',
        'PHEV',
        'BEV',
        'UNKNOWN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryChemistry" AS ENUM (
        'LEAD_ACID',
        'AGM',
        'EFB',
        'LITHIUM',
        'UNKNOWN'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryEvidenceStrength" AS ENUM (
        'OVERRIDE',
        'PRIMARY',
        'SUPPLEMENTARY',
        'DIAGNOSTIC',
        'NONE'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "HvCapacityMethod" AS ENUM (
        'SESSION_DELTA_ENERGY_SOC',
        'SHADOW_ROLLING_MEDIAN',
        'PROVIDER_GROSS_CAPACITY',
        'LEGACY_PAIRWISE_POLL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "ReferenceCapacityVerificationStatus" AS ENUM (
        'VERIFIED',
        'UNVERIFIED',
        'PENDING_REVIEW',
        'WEAK_SOURCE_ONLY'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "BatteryReferenceCapacitySource" AS ENUM (
        'WORKSHOP_MEASUREMENT',
        'DOCUMENT_CONFIRMED',
        'MANUAL_REPORT',
        'PROVIDER_GROSS_NOMINAL',
        'VEHICLE_MASTER',
        'DIMO_NOMINAL_SIGNAL'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

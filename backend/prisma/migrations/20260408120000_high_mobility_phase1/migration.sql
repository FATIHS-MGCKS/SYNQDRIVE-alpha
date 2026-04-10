-- High Mobility Phase 1 Integration
-- Adds: HighMobilityVehicle, HighMobilityStatusHistory, HighMobilityHealthSyncLog, VehicleDataSourceLink

-- Enums
CREATE TYPE "HmPackageType" AS ENUM ('HEALTH', 'FULL_TELEMETRY');
CREATE TYPE "HmSourceMode" AS ENUM ('DIMO_PLUS_HM', 'HM_ONLY');
CREATE TYPE "HmEligibilityStatus" AS ENUM ('UNKNOWN', 'PENDING', 'ELIGIBLE', 'INELIGIBLE', 'ERROR');
CREATE TYPE "HmDeliveryMode" AS ENUM ('PULL', 'PUSH', 'BOTH');
CREATE TYPE "HmClearanceStatus" AS ENUM ('DRAFT', 'CLEARANCE_PENDING', 'APPROVED', 'REJECTED', 'ERROR', 'REVOKING', 'REVOKED', 'CANCELED');
CREATE TYPE "HmSyncType" AS ENUM ('MANUAL', 'SCHEDULED', 'POST_APPROVAL_INITIAL');
CREATE TYPE "HmSyncStatus" AS ENUM ('SUCCESS', 'FAILED', 'PARTIAL');

-- high_mobility_vehicles
CREATE TABLE "high_mobility_vehicles" (
    "id"                        TEXT NOT NULL,
    "organization_id"           TEXT,
    "synqdrive_vehicle_id"      TEXT,
    "vin"                       TEXT NOT NULL,
    "brand"                     TEXT NOT NULL,
    "package_type"              "HmPackageType" NOT NULL,
    "source_mode"               "HmSourceMode" NOT NULL DEFAULT 'DIMO_PLUS_HM',
    "eligibility_status"        "HmEligibilityStatus" NOT NULL DEFAULT 'UNKNOWN',
    "eligibility_delivery_mode" "HmDeliveryMode",
    "eligibility_checked_at"    TIMESTAMP(3),
    "clearance_status"          "HmClearanceStatus" NOT NULL DEFAULT 'DRAFT',
    "clearance_requested_at"    TIMESTAMP(3),
    "clearance_approved_at"     TIMESTAMP(3),
    "clearance_last_checked_at" TIMESTAMP(3),
    "hm_vehicle_reference"      TEXT,
    "provider_payload_json"     JSONB,
    "is_linked"                 BOOLEAN NOT NULL DEFAULT false,
    "linked_at"                 TIMESTAMP(3),
    "is_active"                 BOOLEAN NOT NULL DEFAULT true,
    "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "high_mobility_vehicles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_hm_vehicle_active" ON "high_mobility_vehicles"("vin", "package_type", "source_mode", "is_active");
CREATE INDEX "idx_hm_vehicles_vin" ON "high_mobility_vehicles"("vin");
CREATE INDEX "idx_hm_vehicles_clearance" ON "high_mobility_vehicles"("clearance_status");
CREATE INDEX "idx_hm_vehicles_package" ON "high_mobility_vehicles"("package_type");
CREATE INDEX "idx_hm_vehicles_source" ON "high_mobility_vehicles"("source_mode");
CREATE INDEX "idx_hm_vehicles_org" ON "high_mobility_vehicles"("organization_id");
CREATE INDEX "idx_hm_vehicles_sq_vehicle" ON "high_mobility_vehicles"("synqdrive_vehicle_id");

-- high_mobility_status_history
CREATE TABLE "high_mobility_status_history" (
    "id"                        TEXT NOT NULL,
    "high_mobility_vehicle_id"  TEXT NOT NULL,
    "event_type"                TEXT NOT NULL,
    "old_status"                TEXT,
    "new_status"                TEXT,
    "payload_json"              JSONB,
    "created_at"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "high_mobility_status_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_hm_status_history_vehicle" ON "high_mobility_status_history"("high_mobility_vehicle_id");
CREATE INDEX "idx_hm_status_history_created" ON "high_mobility_status_history"("created_at");

ALTER TABLE "high_mobility_status_history"
    ADD CONSTRAINT "high_mobility_status_history_vehicle_fk"
    FOREIGN KEY ("high_mobility_vehicle_id")
    REFERENCES "high_mobility_vehicles"("id") ON DELETE CASCADE;

-- high_mobility_health_sync_logs
CREATE TABLE "high_mobility_health_sync_logs" (
    "id"                        TEXT NOT NULL,
    "high_mobility_vehicle_id"  TEXT NOT NULL,
    "sync_type"                 "HmSyncType" NOT NULL,
    "sync_status"               "HmSyncStatus" NOT NULL,
    "requested_at"              TIMESTAMP(3) NOT NULL,
    "completed_at"              TIMESTAMP(3),
    "error_message"             TEXT,
    "payload_json"              JSONB,

    CONSTRAINT "high_mobility_health_sync_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_hm_sync_logs_vehicle" ON "high_mobility_health_sync_logs"("high_mobility_vehicle_id");
CREATE INDEX "idx_hm_sync_logs_requested" ON "high_mobility_health_sync_logs"("requested_at");

ALTER TABLE "high_mobility_health_sync_logs"
    ADD CONSTRAINT "high_mobility_health_sync_logs_vehicle_fk"
    FOREIGN KEY ("high_mobility_vehicle_id")
    REFERENCES "high_mobility_vehicles"("id") ON DELETE CASCADE;

-- vehicle_data_source_links
CREATE TABLE "vehicle_data_source_links" (
    "id"                   TEXT NOT NULL,
    "vehicle_id"           TEXT NOT NULL,
    "source_type"          TEXT NOT NULL,
    "source_subtype"       TEXT,
    "source_reference_id"  TEXT NOT NULL,
    "is_active"            BOOLEAN NOT NULL DEFAULT true,
    "activated_at"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deactivated_at"       TIMESTAMP(3),
    "metadata"             JSONB,

    CONSTRAINT "vehicle_data_source_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_data_source_link_active" ON "vehicle_data_source_links"("vehicle_id", "source_type", "source_subtype", "is_active");
CREATE INDEX "idx_data_source_links_vehicle" ON "vehicle_data_source_links"("vehicle_id");
CREATE INDEX "idx_data_source_links_type" ON "vehicle_data_source_links"("source_type");
CREATE INDEX "idx_data_source_links_ref" ON "vehicle_data_source_links"("source_reference_id");

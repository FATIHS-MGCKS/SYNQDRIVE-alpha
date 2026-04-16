-- Phase 2: Audit / Consent / Provenance Foundation
-- Applied: 2026-04-12
--
-- Changes:
--   1. Extend ActivityAction and ActivityEntity enums with new trust-layer values
--   2. Add userAgent, route, changeSummary, level columns to activity_logs
--   3. New VehicleProviderConsentStatus and VehicleProviderConsentGrantType enums
--   4. New vehicle_provider_consents table (consent ledger)
--   5. Add provider, consentId, linkedByUserId, lastVerifiedAt to vehicle_data_source_links
--   6. Add provenance columns to vehicle_latest_states
--   7. Add HmSignalGroupState.vehicleId FK (deferred from Phase 1 if not applied)

-- ──────────────────────────────────────────────────────────────────
-- 1. EXTEND ENUMS
-- ──────────────────────────────────────────────────────────────────

-- ActivityAction new values
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'GRANT';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'REVOKE';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'REJECT';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'AUTH_FAIL';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'ADMIN_OVERRIDE';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'PRUNE';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'BACKFILL';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'LINK';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'UNLINK';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'APPROVE';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'RESET';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'REFRESH';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'REVOKE_ALL';

-- ActivityEntity new values
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'SESSION';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'PROVIDER_CONSENT';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'PROVIDER_BINDING';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'AUTH_EVENT';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'ADMIN_OPERATION';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'REFRESH_TOKEN';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'SUPPORT_MESSAGE';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'TASK';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'INVOICE';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'FINE';

-- ──────────────────────────────────────────────────────────────────
-- 2. EXTEND activity_logs
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "activity_logs"
    ADD COLUMN IF NOT EXISTS "change_summary" TEXT,
    ADD COLUMN IF NOT EXISTS "route"          TEXT,
    ADD COLUMN IF NOT EXISTS "user_agent"     TEXT,
    ADD COLUMN IF NOT EXISTS "level"          TEXT;

CREATE INDEX IF NOT EXISTS "activity_logs_level_idx" ON "activity_logs"("level");

-- ──────────────────────────────────────────────────────────────────
-- 3. NEW ENUMS for consent ledger
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleProviderConsentStatus') THEN
        CREATE TYPE "VehicleProviderConsentStatus" AS ENUM (
            'ACTIVE', 'REVOKED', 'EXPIRED', 'REJECTED', 'PENDING'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleProviderConsentGrantType') THEN
        CREATE TYPE "VehicleProviderConsentGrantType" AS ENUM (
            'DIMO_OAUTH', 'DIMO_DIRECT', 'HM_FLEET_CLEARANCE', 'HM_MANUAL', 'MANUAL'
        );
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 4. vehicle_provider_consents TABLE
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "vehicle_provider_consents" (
    "id"                          TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
    "vehicle_id"                  TEXT        NOT NULL,
    "organization_id"             TEXT        NOT NULL,
    "provider"                    TEXT        NOT NULL,
    "grant_type"                  "VehicleProviderConsentGrantType" NOT NULL,
    "status"                      "VehicleProviderConsentStatus"    NOT NULL DEFAULT 'ACTIVE',
    "scopes"                      TEXT[]      NOT NULL DEFAULT '{}',
    "granted_by_user_id"          TEXT,
    "granted_by_external_subject" TEXT,
    "granted_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at"                  TIMESTAMP(3),
    "revoked_at"                  TIMESTAMP(3),
    "revoked_by_user_id"          TEXT,
    "proof_reference"             TEXT,
    "proof_hash"                  TEXT,
    "provider_vehicle_ref"        TEXT,
    "metadata_json"               JSONB,
    "created_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"                  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_provider_consents_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "vehicle_provider_consents"
    ADD CONSTRAINT "vehicle_provider_consents_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "vehicle_provider_consents"
    ADD CONSTRAINT "vehicle_provider_consents_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "vpc_vehicle_id_idx"     ON "vehicle_provider_consents"("vehicle_id");
CREATE INDEX IF NOT EXISTS "vpc_organization_id_idx" ON "vehicle_provider_consents"("organization_id");
CREATE INDEX IF NOT EXISTS "vpc_provider_status_idx" ON "vehicle_provider_consents"("provider", "status");
CREATE INDEX IF NOT EXISTS "vpc_granted_at_idx"      ON "vehicle_provider_consents"("granted_at");

-- ──────────────────────────────────────────────────────────────────
-- 5. EXTEND vehicle_data_source_links (canonical provider binding)
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "vehicle_data_source_links"
    ADD COLUMN IF NOT EXISTS "provider"           TEXT    NOT NULL DEFAULT 'UNKNOWN',
    ADD COLUMN IF NOT EXISTS "consent_id"         TEXT,
    ADD COLUMN IF NOT EXISTS "linked_by_user_id"  TEXT,
    ADD COLUMN IF NOT EXISTS "last_verified_at"   TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "vdsl_provider_idx"    ON "vehicle_data_source_links"("provider");
CREATE INDEX IF NOT EXISTS "vdsl_consent_id_idx"  ON "vehicle_data_source_links"("consent_id");

-- ──────────────────────────────────────────────────────────────────
-- 6. ADD PROVENANCE to vehicle_latest_states
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "vehicle_latest_states"
    ADD COLUMN IF NOT EXISTS "provider_source"     TEXT,
    ADD COLUMN IF NOT EXISTS "provider_fetched_at" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "source_timestamp"    TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "sync_job_ref"        TEXT,
    ADD COLUMN IF NOT EXISTS "provider_binding_id" TEXT;

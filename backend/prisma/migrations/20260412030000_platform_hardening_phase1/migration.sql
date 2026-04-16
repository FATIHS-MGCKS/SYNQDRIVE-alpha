-- Platform Hardening Phase 1 — Migration
-- Applied: 2026-04-12
--
-- Changes:
--   1. refresh_tokens table (refresh token rotation architecture)
--   2. vehicle_data_source_links: add vehicle_id FK to vehicles
--   3. hm_signal_group_states: add vehicle_id FK to vehicles
--   4. org_tasks: add created_by_user_id, updated_by_user_id
--   5. vehicles: add created_by_user_id, updated_by_user_id

-- ──────────────────────────────────────────────────────────────────
-- 1. REFRESH TOKENS
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "refresh_tokens" (
    "id"          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "user_id"     TEXT NOT NULL,
    "token_hash"  TEXT NOT NULL,
    "family"      TEXT NOT NULL,
    "expires_at"  TIMESTAMP(3) NOT NULL,
    "revoked_at"  TIMESTAMP(3),
    "replaced_by" TEXT,
    "user_agent"  TEXT,
    "ip_address"  TEXT,
    "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "refresh_tokens_token_hash_key"
    ON "refresh_tokens"("token_hash");

CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_idx"
    ON "refresh_tokens"("user_id");

CREATE INDEX IF NOT EXISTS "refresh_tokens_family_idx"
    ON "refresh_tokens"("family");

ALTER TABLE "refresh_tokens"
    ADD CONSTRAINT "refresh_tokens_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 2. VehicleDataSourceLink → Vehicle FK
--    Note: vehicleId column already exists; we only add the FK constraint.
--    MIGRATION RISK: rows with vehicleId values that do not match any
--    vehicles.id will violate the constraint. Inspect and clean before
--    applying in production if data quality is uncertain.
-- ──────────────────────────────────────────────────────────────────

-- Only add the constraint if it doesn't already exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'vehicle_data_source_links_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "vehicle_data_source_links"
            ADD CONSTRAINT "vehicle_data_source_links_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id")
            REFERENCES "vehicles"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 3. HmSignalGroupState → Vehicle FK
--    vehicleId column already exists; add FK constraint.
--    Same migration risk note applies.
-- ──────────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'hm_signal_group_states_vehicle_id_fkey'
    ) THEN
        ALTER TABLE "hm_signal_group_states"
            ADD CONSTRAINT "hm_signal_group_states_vehicle_id_fkey"
            FOREIGN KEY ("vehicle_id")
            REFERENCES "vehicles"("id")
            ON DELETE CASCADE
            ON UPDATE CASCADE;
    END IF;
END $$;

-- ──────────────────────────────────────────────────────────────────
-- 4. OrgTask — createdBy / updatedBy
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "org_tasks"
    ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT,
    ADD COLUMN IF NOT EXISTS "updated_by_user_id"  TEXT;

CREATE INDEX IF NOT EXISTS "org_tasks_created_by_user_id_idx"
    ON "org_tasks"("created_by_user_id");

-- ──────────────────────────────────────────────────────────────────
-- 5. Vehicle — createdBy / updatedBy
-- ──────────────────────────────────────────────────────────────────

ALTER TABLE "vehicles"
    ADD COLUMN IF NOT EXISTS "created_by_user_id" TEXT,
    ADD COLUMN IF NOT EXISTS "updated_by_user_id"  TEXT;

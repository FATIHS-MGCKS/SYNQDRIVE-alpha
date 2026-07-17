-- Voice budget, limit, and abuse protection (Prompt 8B)

CREATE TYPE "VoiceDestinationRegionPolicy" AS ENUM ('DE_ONLY', 'DE_EEA', 'CUSTOM');
CREATE TYPE "VoiceProtectionOverrideScope" AS ENUM (
  'OUTBOUND_DESTINATION',
  'MONTHLY_BUDGET',
  'DAILY_OUTBOUND',
  'CONCURRENT_CALLS',
  'ALL_LIMITS'
);
CREATE TYPE "VoiceProtectionAuditAction" AS ENUM (
  'OUTBOUND_BLOCKED',
  'INBOUND_DEGRADED',
  'BUDGET_WARNING',
  'BUDGET_HARD_LIMIT',
  'ABUSE_DETECTED',
  'OVERRIDE_CREATED',
  'OVERRIDE_REVOKED',
  'BUDGET_POLICY_UPDATED',
  'CONCURRENT_LIMIT',
  'ACTIVATION_BLOCKED',
  'DURATION_LIMIT_FLAG'
);

ALTER TABLE "voice_budget_policies"
  ADD COLUMN IF NOT EXISTS "daily_outbound_minutes_limit" INTEGER,
  ADD COLUMN IF NOT EXISTS "max_repeats_per_destination" INTEGER,
  ADD COLUMN IF NOT EXISTS "destination_cooldown_seconds" INTEGER,
  ADD COLUMN IF NOT EXISTS "destination_region_policy" "VoiceDestinationRegionPolicy" NOT NULL DEFAULT 'DE_EEA',
  ADD COLUMN IF NOT EXISTS "hard_limit_grace_minutes" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "voice_protection_overrides" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "scope" "VoiceProtectionOverrideScope" NOT NULL,
  "target_ref" TEXT,
  "reason" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "voice_protection_overrides_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "voice_protection_audit_events" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "action" "VoiceProtectionAuditAction" NOT NULL,
  "reason_code" TEXT NOT NULL,
  "message" TEXT,
  "metadata" JSONB,
  "actor_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_protection_audit_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "voice_budget_warning_states" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "warned_pct" INTEGER NOT NULL,
  "warned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "voice_budget_warning_states_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "voice_protection_overrides_organization_id_scope_expires_at_idx"
  ON "voice_protection_overrides"("organization_id", "scope", "expires_at");
CREATE INDEX IF NOT EXISTS "voice_protection_overrides_organization_id_revoked_at_idx"
  ON "voice_protection_overrides"("organization_id", "revoked_at");
CREATE INDEX IF NOT EXISTS "voice_protection_audit_events_organization_id_created_at_idx"
  ON "voice_protection_audit_events"("organization_id", "created_at");
CREATE INDEX IF NOT EXISTS "voice_protection_audit_events_organization_id_action_idx"
  ON "voice_protection_audit_events"("organization_id", "action");
CREATE UNIQUE INDEX IF NOT EXISTS "voice_budget_warning_states_organization_id_period_start_warned_pct_key"
  ON "voice_budget_warning_states"("organization_id", "period_start", "warned_pct");

ALTER TABLE "voice_protection_overrides"
  ADD CONSTRAINT "voice_protection_overrides_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_protection_audit_events"
  ADD CONSTRAINT "voice_protection_audit_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "voice_budget_warning_states"
  ADD CONSTRAINT "voice_budget_warning_states_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Voice plans, entitlements, and usage ledger (Prompt 8A)

-- AlterEnum
ALTER TYPE "VoiceSubscriptionStatus" ADD VALUE IF NOT EXISTS 'TRIAL';
ALTER TYPE "VoiceSubscriptionStatus" ADD VALUE IF NOT EXISTS 'PAST_DUE';

-- AlterTable voice_subscriptions
ALTER TABLE "voice_subscriptions"
  ADD COLUMN IF NOT EXISTS "plan_catalog_version" TEXT NOT NULL DEFAULT '2026-07-17',
  ADD COLUMN IF NOT EXISTS "setup_fee_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "setup_fee_paid_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pending_plan_code" TEXT,
  ADD COLUMN IF NOT EXISTS "pending_plan_catalog_version" TEXT,
  ADD COLUMN IF NOT EXISTS "pending_plan_effective_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "trial_ends_at" TIMESTAMP(3);

-- AlterTable voice_usage_events
ALTER TABLE "voice_usage_events"
  ADD COLUMN IF NOT EXISTS "twilio_cost_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "elevenlabs_cost_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "llm_cost_cents" INTEGER;

-- AlterTable voice_billing_periods
ALTER TABLE "voice_billing_periods"
  ADD COLUMN IF NOT EXISTS "plan_code" TEXT,
  ADD COLUMN IF NOT EXISTS "plan_catalog_version" TEXT,
  ADD COLUMN IF NOT EXISTS "monthly_base_fee_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "setup_fee_cents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "inbound_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "outbound_minutes" INTEGER NOT NULL DEFAULT 0;

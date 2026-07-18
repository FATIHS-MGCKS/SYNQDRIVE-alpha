-- CreateEnum
CREATE TYPE "VoiceRolloutStatus" AS ENUM ('DISABLED', 'INTERNAL_TEST', 'STAGING', 'CANARY', 'PRODUCTION', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "VoiceRolloutAuditAction" AS ENUM ('STATUS_READ', 'STATUS_CHANGED', 'STATUS_CHANGE_IDEMPOTENT_REPLAY');

-- CreateTable
CREATE TABLE "voice_organization_rollouts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "VoiceRolloutStatus" NOT NULL DEFAULT 'DISABLED',
    "last_reason" TEXT,
    "updated_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "voice_organization_rollouts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "voice_rollout_audit_events" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "action" "VoiceRolloutAuditAction" NOT NULL,
    "previous_status" "VoiceRolloutStatus",
    "new_status" "VoiceRolloutStatus",
    "reason" TEXT NOT NULL,
    "actor_user_id" TEXT,
    "idempotency_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "voice_rollout_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "voice_organization_rollouts_organization_id_key" ON "voice_organization_rollouts"("organization_id");

-- CreateIndex
CREATE INDEX "voice_organization_rollouts_status_idx" ON "voice_organization_rollouts"("status");

-- CreateIndex
CREATE INDEX "voice_rollout_audit_events_organization_id_created_at_idx" ON "voice_rollout_audit_events"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "voice_rollout_audit_events_organization_id_idempotency_key_key" ON "voice_rollout_audit_events"("organization_id", "idempotency_key");

-- AddForeignKey
ALTER TABLE "voice_organization_rollouts" ADD CONSTRAINT "voice_organization_rollouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voice_rollout_audit_events" ADD CONSTRAINT "voice_rollout_audit_events_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill existing voice-enabled organizations as DISABLED (no automatic PRODUCTION activation)
INSERT INTO "voice_organization_rollouts" ("id", "organization_id", "status", "last_reason", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text,
    va."organization_id",
    'DISABLED'::"VoiceRolloutStatus",
    'Initial rollout record — explicit master-admin promotion required',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "voice_assistants" va
WHERE NOT EXISTS (
    SELECT 1 FROM "voice_organization_rollouts" vor WHERE vor."organization_id" = va."organization_id"
);

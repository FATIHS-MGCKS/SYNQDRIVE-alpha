-- IAM session invalidation policy (Prompt 5/22)

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "session_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "organization_memberships"
  ADD COLUMN IF NOT EXISTS "membership_version" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "organization_id" TEXT,
  ADD COLUMN IF NOT EXISTS "membership_id" TEXT,
  ADD COLUMN IF NOT EXISTS "session_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "membership_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "privileged_session" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "refresh_tokens_user_id_organization_id_idx"
  ON "refresh_tokens" ("user_id", "organization_id");

CREATE TYPE "IamSessionRevocationScope" AS ENUM (
  'CURRENT_SESSION',
  'USER_ALL_SESSIONS',
  'ORGANIZATION_MEMBERSHIP_SESSIONS',
  'TOKEN_FAMILY',
  'PRIVILEGED_SESSIONS',
  'NO_IMMEDIATE_REVOCATION'
);

CREATE TYPE "IamSessionRevocationStatus" AS ENUM (
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED'
);

CREATE TABLE "iam_session_revocation_intents" (
  "id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "event_type" TEXT NOT NULL,
  "scope" "IamSessionRevocationScope" NOT NULL,
  "user_id" TEXT NOT NULL,
  "organization_id" TEXT,
  "membership_id" TEXT,
  "refresh_token_id" TEXT,
  "token_family" TEXT,
  "actor_user_id" TEXT,
  "metadata" JSONB,
  "status" "IamSessionRevocationStatus" NOT NULL DEFAULT 'PENDING',
  "processed_at" TIMESTAMP(3),
  "failure_reason" TEXT,
  "revoked_token_count" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "iam_session_revocation_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "iam_session_revocation_intents_idempotency_key_key"
  ON "iam_session_revocation_intents"("idempotency_key");

CREATE INDEX "iam_session_revocation_intents_status_created_at_idx"
  ON "iam_session_revocation_intents"("status", "created_at");

CREATE INDEX "iam_session_revocation_intents_user_id_idx"
  ON "iam_session_revocation_intents"("user_id");

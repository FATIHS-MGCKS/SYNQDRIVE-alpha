-- Secure global password self-service reset (Prompt 6/22)

CREATE TYPE "PasswordResetPurpose" AS ENUM ('ADMIN_INITIATED', 'SELF_SERVICE');

CREATE TABLE "password_reset_tokens" (
  "id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "token_hash" TEXT NOT NULL,
  "token_lookup" TEXT NOT NULL,
  "purpose" "PasswordResetPurpose" NOT NULL,
  "organization_id" TEXT,
  "actor_user_id" TEXT,
  "reason" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "used_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "password_reset_tokens_token_lookup_key"
  ON "password_reset_tokens"("token_lookup");

CREATE INDEX "password_reset_tokens_user_id_purpose_idx"
  ON "password_reset_tokens"("user_id", "purpose");

CREATE INDEX "password_reset_tokens_expires_at_idx"
  ON "password_reset_tokens"("expires_at");

CREATE TABLE "password_reset_attempts" (
  "id" TEXT NOT NULL,
  "scope" TEXT NOT NULL,
  "scope_key" TEXT NOT NULL,
  "organization_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "password_reset_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_reset_attempts_scope_key_created_at_idx"
  ON "password_reset_attempts"("scope", "scope_key", "created_at");

ALTER TABLE "password_reset_tokens"
  ADD CONSTRAINT "password_reset_tokens_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

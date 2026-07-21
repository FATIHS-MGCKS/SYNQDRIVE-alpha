-- CreateEnum
CREATE TYPE "MfaFactorType" AS ENUM ('TOTP', 'WEBAUTHN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "security_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "user_mfa_factors" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "factor_type" "MfaFactorType" NOT NULL,
    "label" TEXT,
    "encrypted_secret" TEXT,
    "credential_id" TEXT,
    "webauthn_public_key" TEXT,
    "sign_count" INTEGER,
    "verified_at" TIMESTAMP(3),
    "enabled_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "last_totp_step" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_mfa_factors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_mfa_recovery_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mfa_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_mfa_step_up_grants" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "idempotency_key" TEXT,
    "token_hash" TEXT NOT NULL,
    "action_scope" TEXT NOT NULL,
    "assurance_level" INTEGER NOT NULL,
    "auth_methods" JSONB NOT NULL,
    "authenticated_at" TIMESTAMP(3) NOT NULL,
    "mfa_authenticated_at" TIMESTAMP(3) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mfa_step_up_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_mfa_factors_user_id_idx" ON "user_mfa_factors"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_mfa_factors_user_id_factor_type_key" ON "user_mfa_factors"("user_id", "factor_type");

-- CreateIndex
CREATE INDEX "user_mfa_recovery_codes_user_id_idx" ON "user_mfa_recovery_codes"("user_id");

-- CreateIndex
CREATE INDEX "user_mfa_step_up_grants_user_id_idx" ON "user_mfa_step_up_grants"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_mfa_step_up_grants_idempotency_key_key" ON "user_mfa_step_up_grants"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "user_mfa_step_up_grants_token_hash_key" ON "user_mfa_step_up_grants"("token_hash");

-- AddForeignKey
ALTER TABLE "user_mfa_factors" ADD CONSTRAINT "user_mfa_factors_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mfa_recovery_codes" ADD CONSTRAINT "user_mfa_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mfa_step_up_grants" ADD CONSTRAINT "user_mfa_step_up_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

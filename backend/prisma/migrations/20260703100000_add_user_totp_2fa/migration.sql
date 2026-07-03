-- CreateEnum
CREATE TYPE "TwoFactorCredentialType" AS ENUM ('TOTP');

-- CreateTable
CREATE TABLE "user_two_factor_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "TwoFactorCredentialType" NOT NULL,
    "secret_encrypted" TEXT NOT NULL,
    "enabled_at" TIMESTAMP(3),
    "confirmed_at" TIMESTAMP(3),
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_two_factor_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_recovery_codes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_recovery_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_mfa_login_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_mfa_login_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_two_factor_credentials_user_id_type_key" ON "user_two_factor_credentials"("user_id", "type");

-- CreateIndex
CREATE INDEX "user_recovery_codes_user_id_idx" ON "user_recovery_codes"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_mfa_login_challenges_token_hash_key" ON "user_mfa_login_challenges"("token_hash");

-- CreateIndex
CREATE INDEX "user_mfa_login_challenges_user_id_idx" ON "user_mfa_login_challenges"("user_id");

-- CreateIndex
CREATE INDEX "user_mfa_login_challenges_expires_at_idx" ON "user_mfa_login_challenges"("expires_at");

-- AddForeignKey
ALTER TABLE "user_two_factor_credentials" ADD CONSTRAINT "user_two_factor_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recovery_codes" ADD CONSTRAINT "user_recovery_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_mfa_login_challenges" ADD CONSTRAINT "user_mfa_login_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

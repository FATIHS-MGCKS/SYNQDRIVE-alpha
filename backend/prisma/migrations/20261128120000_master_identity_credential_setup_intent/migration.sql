-- R04 operation-bound credential setup continuation (USR-P3A.3A)
ALTER TABLE "password_reset_tokens" ADD COLUMN "security_operation_id" TEXT;

CREATE UNIQUE INDEX "password_reset_tokens_security_operation_id_key"
  ON "password_reset_tokens"("security_operation_id")
  WHERE "security_operation_id" IS NOT NULL AND "used_at" IS NULL AND "revoked_at" IS NULL;

CREATE INDEX "password_reset_tokens_user_id_security_operation_id_idx"
  ON "password_reset_tokens"("user_id", "security_operation_id");

CREATE TABLE "master_identity_credential_setup_intents" (
    "id" TEXT NOT NULL,
    "security_operation_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "membership_id" TEXT NOT NULL,
    "password_reset_token_id" TEXT,
    "transport_requested_at" TIMESTAMP(3),
    "credential_established_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "master_identity_credential_setup_intents_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "master_identity_credential_setup_intents_security_operation_id_key"
  ON "master_identity_credential_setup_intents"("security_operation_id");

CREATE UNIQUE INDEX "master_identity_credential_setup_intents_password_reset_token_id_key"
  ON "master_identity_credential_setup_intents"("password_reset_token_id");

ALTER TABLE "master_identity_credential_setup_intents"
  ADD CONSTRAINT "master_identity_credential_setup_intents_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "master_identity_credential_setup_intents"
  ADD CONSTRAINT "master_identity_credential_setup_intents_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "master_identity_credential_setup_intents"
  ADD CONSTRAINT "master_identity_credential_setup_intents_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "master_identity_credential_setup_intents"
  ADD CONSTRAINT "master_identity_credential_setup_intents_password_reset_token_id_fkey"
  FOREIGN KEY ("password_reset_token_id") REFERENCES "password_reset_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
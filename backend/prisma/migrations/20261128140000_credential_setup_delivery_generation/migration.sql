ALTER TABLE "master_identity_credential_setup_intents"
  ADD COLUMN "delivery_generation" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "transport_confirmed_at" TIMESTAMP(3),
  ADD COLUMN "delivery_token_ciphertext" TEXT;

ALTER TABLE "password_reset_tokens"
  ADD COLUMN "setup_delivery_generation" INTEGER;

CREATE INDEX "password_reset_tokens_security_operation_delivery_idx"
  ON "password_reset_tokens"("security_operation_id", "setup_delivery_generation");
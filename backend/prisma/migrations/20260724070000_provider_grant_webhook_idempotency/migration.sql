-- Provider grant webhook idempotency + token expiry (informational only)
ALTER TABLE "provider_access_grants"
  ADD COLUMN IF NOT EXISTS "webhook_idempotency_key" TEXT,
  ADD COLUMN IF NOT EXISTS "token_expires_at" TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS "provider_access_grants_webhook_idempotency_key_key"
  ON "provider_access_grants" ("webhook_idempotency_key")
  WHERE "webhook_idempotency_key" IS NOT NULL;

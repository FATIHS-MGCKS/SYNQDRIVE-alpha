-- CreateEnum
CREATE TYPE "WebhookConfigurationState" AS ENUM (
  'CONFIGURED',
  'NOT_CONFIGURED',
  'ERROR',
  'UNKNOWN',
  'NOT_APPLICABLE'
);

-- CreateTable
CREATE TABLE "device_connection_trigger_registry_cache" (
  "scope_key" TEXT NOT NULL DEFAULT 'DIMO_DEVELOPER',
  "provider" TEXT NOT NULL DEFAULT 'DIMO',
  "callback_url" TEXT,
  "webhooks_json" JSONB NOT NULL,
  "synced_at" TIMESTAMP(3) NOT NULL,
  "sync_error" TEXT,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "device_connection_trigger_registry_cache_pkey" PRIMARY KEY ("scope_key")
);

-- CreateEnum
CREATE TYPE "PartsProviderIntegrationType" AS ENUM ('API', 'MARKETPLACE', 'AFFILIATE', 'EMBEDDED_CHECKOUT', 'REDIRECT');

-- CreateEnum
CREATE TYPE "PartsProviderEnvironment" AS ENUM ('SANDBOX', 'PRODUCTION');

-- CreateEnum
CREATE TYPE "PartsProviderHealthStatus" AS ENUM ('HEALTHY', 'DEGRADED', 'DOWN', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PartsCategory" AS ENUM ('TIRES', 'PARTS', 'ACCESSORIES');

-- CreateEnum
CREATE TYPE "PartsSearchStatus" AS ENUM ('PENDING', 'SUCCESS', 'FAILURE', 'TIMEOUT');

-- CreateTable
CREATE TABLE "parts_providers" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "description" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "integration_type" "PartsProviderIntegrationType" NOT NULL,
    "environment_mode" "PartsProviderEnvironment" NOT NULL DEFAULT 'SANDBOX',
    "supported_categories" "PartsCategory"[],
    "config_json" JSONB,
    "credentials_json" JSONB,
    "capabilities_json" JSONB,
    "health_status" "PartsProviderHealthStatus" NOT NULL DEFAULT 'UNKNOWN',
    "last_tested_at" TIMESTAMP(3),
    "last_success_at" TIMESTAMP(3),
    "last_failure_at" TIMESTAMP(3),
    "last_failure_reason" TEXT,
    "ranking_weight" INTEGER NOT NULL DEFAULT 100,
    "timeout_ms" INTEGER NOT NULL DEFAULT 15000,
    "max_retries" INTEGER NOT NULL DEFAULT 2,
    "rate_limit_per_min" INTEGER NOT NULL DEFAULT 60,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_providers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts_provider_org_access" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_provider_org_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts_disclosure_templates" (
    "id" TEXT NOT NULL,
    "provider_id" TEXT,
    "provider_key" TEXT,
    "category" "PartsCategory",
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_disclosure_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts_authorization_logs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "provider_display_name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "disclosed_fields_json" JSONB NOT NULL,
    "notice_version" INTEGER NOT NULL,
    "notice_title_snapshot" TEXT NOT NULL,
    "notice_body_snapshot" TEXT NOT NULL,
    "confirmed_at" TIMESTAMP(3) NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "session_id" TEXT,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "request_metadata_json" JSONB,
    "execution_status" TEXT NOT NULL DEFAULT 'PENDING',
    "execution_failure_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parts_authorization_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parts_search_requests" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider_key" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "normalized_request_json" JSONB NOT NULL,
    "response_summary_json" JSONB,
    "result_count" INTEGER,
    "status" "PartsSearchStatus" NOT NULL DEFAULT 'PENDING',
    "duration_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parts_search_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parts_providers_key_key" ON "parts_providers"("key");
CREATE INDEX "parts_providers_is_enabled_idx" ON "parts_providers"("is_enabled");

CREATE UNIQUE INDEX "parts_provider_org_access_provider_id_organization_id_key" ON "parts_provider_org_access"("provider_id", "organization_id");
CREATE INDEX "parts_provider_org_access_organization_id_idx" ON "parts_provider_org_access"("organization_id");

CREATE INDEX "parts_disclosure_templates_provider_key_idx" ON "parts_disclosure_templates"("provider_key");
CREATE INDEX "parts_disclosure_templates_is_active_idx" ON "parts_disclosure_templates"("is_active");

CREATE INDEX "parts_authorization_logs_organization_id_idx" ON "parts_authorization_logs"("organization_id");
CREATE INDEX "parts_authorization_logs_user_id_idx" ON "parts_authorization_logs"("user_id");
CREATE INDEX "parts_authorization_logs_vehicle_id_idx" ON "parts_authorization_logs"("vehicle_id");
CREATE INDEX "parts_authorization_logs_provider_key_idx" ON "parts_authorization_logs"("provider_key");
CREATE INDEX "parts_authorization_logs_correlation_id_idx" ON "parts_authorization_logs"("correlation_id");
CREATE INDEX "parts_authorization_logs_confirmed_at_idx" ON "parts_authorization_logs"("confirmed_at");

CREATE INDEX "parts_search_requests_organization_id_idx" ON "parts_search_requests"("organization_id");
CREATE INDEX "parts_search_requests_correlation_id_idx" ON "parts_search_requests"("correlation_id");
CREATE INDEX "parts_search_requests_provider_key_idx" ON "parts_search_requests"("provider_key");

-- AddForeignKey
ALTER TABLE "parts_provider_org_access" ADD CONSTRAINT "parts_provider_org_access_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "parts_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "parts_disclosure_templates" ADD CONSTRAINT "parts_disclosure_templates_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "parts_providers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

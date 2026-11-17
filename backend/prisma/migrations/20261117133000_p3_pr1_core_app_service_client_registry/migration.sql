-- P3-PR1: External application service client registry (foundation only; runtime OFF by default).
-- Fail-closed: new clients DISABLED; new org grants REVOKED until explicitly activated by Master Admin (future slice).

CREATE TYPE "CoreAppServiceClientStatus" AS ENUM ('ACTIVE', 'DISABLED');

CREATE TYPE "CoreAppServiceGrantStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "core_app_service_clients" (
    "id" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "product_slug" "ProductSlug" NOT NULL,
    "credential_hash" TEXT NOT NULL,
    "credential_version" INTEGER NOT NULL DEFAULT 1,
    "status" "CoreAppServiceClientStatus" NOT NULL DEFAULT 'DISABLED',
    "allowed_scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_app_service_clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "core_app_service_org_grants" (
    "id" TEXT NOT NULL,
    "service_client_id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "status" "CoreAppServiceGrantStatus" NOT NULL DEFAULT 'REVOKED',
    "grant_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "core_app_service_org_grants_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "core_app_service_clients_client_id_key" ON "core_app_service_clients"("client_id");

CREATE INDEX "core_app_service_org_grants_organization_id_idx" ON "core_app_service_org_grants"("organization_id");

CREATE UNIQUE INDEX "core_app_service_org_grants_service_client_id_organization_id_key" ON "core_app_service_org_grants"("service_client_id", "organization_id");

ALTER TABLE "core_app_service_org_grants" ADD CONSTRAINT "core_app_service_org_grants_service_client_id_fkey" FOREIGN KEY ("service_client_id") REFERENCES "core_app_service_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "core_app_service_org_grants" ADD CONSTRAINT "core_app_service_org_grants_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
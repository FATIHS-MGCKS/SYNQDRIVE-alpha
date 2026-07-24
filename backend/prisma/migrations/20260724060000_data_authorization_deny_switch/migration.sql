-- CreateEnum
CREATE TYPE "DataAuthorizationDenySwitchScopeType" AS ENUM (
  'ORGANIZATION',
  'PROCESSING_ACTIVITY',
  'ENFORCEMENT_POLICY',
  'CONSENT',
  'PROVIDER_GRANT',
  'RESOURCE'
);

-- CreateEnum
CREATE TYPE "DataAuthorizationDenySwitchTrigger" AS ENUM (
  'REVOKED',
  'SUSPENDED',
  'MANUAL'
);

-- CreateTable
CREATE TABLE "data_authorization_deny_switches" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "scope_type" "DataAuthorizationDenySwitchScopeType" NOT NULL,
  "scope_entity_id" TEXT,
  "resource_type" TEXT,
  "resource_id" TEXT,
  "trigger" "DataAuthorizationDenySwitchTrigger" NOT NULL,
  "sequence" BIGINT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "blocks_ingest" BOOLEAN NOT NULL DEFAULT true,
  "blocks_read" BOOLEAN NOT NULL DEFAULT true,
  "blocks_queue_enqueue" BOOLEAN NOT NULL DEFAULT true,
  "reason" TEXT,
  "correlation_id" TEXT NOT NULL,
  "actor_user_id" TEXT,
  "idempotency_key" TEXT NOT NULL,
  "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deactivated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "data_authorization_deny_switches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_authorization_deny_switches_idempotency_key_key"
  ON "data_authorization_deny_switches"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "data_authorization_deny_switches_organization_id_scope_type_key"
  ON "data_authorization_deny_switches"("organization_id", "scope_type", "scope_entity_id", "resource_type", "resource_id");

-- CreateIndex
CREATE INDEX "data_authorization_deny_switches_organization_id_active_idx"
  ON "data_authorization_deny_switches"("organization_id", "active");

-- CreateIndex
CREATE INDEX "data_authorization_deny_switches_organization_id_sequence_idx"
  ON "data_authorization_deny_switches"("organization_id", "sequence");

-- AddForeignKey
ALTER TABLE "data_authorization_deny_switches"
  ADD CONSTRAINT "data_authorization_deny_switches_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

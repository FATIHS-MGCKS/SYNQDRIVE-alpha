-- Data Authorization & Consent Center (V4.8.39)

CREATE TYPE "DataAuthorizationStatus" AS ENUM ('PENDING', 'ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TYPE "DataAuthorizationSourceType" AS ENUM (
  'DIMO',
  'SYNQDRIVE_SYSTEM',
  'CUSTOMER_CONSENT',
  'PARTNER_ACCESS',
  'MANUAL_UPLOAD',
  'API_INTEGRATION'
);

CREATE TYPE "DataAuthorizationProcessorType" AS ENUM (
  'SYNQDRIVE',
  'EXTERNAL_PARTNER',
  'INTERNAL_SYSTEM'
);

CREATE TYPE "DataAuthorizationRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

CREATE TYPE "DataAuthorizationScope" AS ENUM (
  'ORGANIZATION',
  'CONNECTED_VEHICLES',
  'VEHICLE',
  'CUSTOMER',
  'BOOKING'
);

CREATE TYPE "DataAuthorizationAccessPattern" AS ENUM (
  'ONE_TIME',
  'ONGOING',
  'RECURRING',
  'EVENT_DRIVEN'
);

CREATE TABLE IF NOT EXISTS "org_data_authorizations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "title" TEXT,
  "description" TEXT,
  "source_type" "DataAuthorizationSourceType",
  "processor_type" "DataAuthorizationProcessorType",
  "processor_name" TEXT,
  "purposes" JSONB,
  "risk_level" "DataAuthorizationRiskLevel" NOT NULL DEFAULT 'MEDIUM',
  "customer_ids" JSONB,
  "booking_ids" JSONB,
  "system_key" TEXT,
  "is_system_generated" BOOLEAN NOT NULL DEFAULT false,
  "last_access_at" TIMESTAMP(3),
  "access_count" INTEGER NOT NULL DEFAULT 0,
  "revoke_reason" TEXT,
  "requesting_entity" TEXT NOT NULL,
  "module_origin" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "scope" "DataAuthorizationScope" NOT NULL DEFAULT 'ORGANIZATION',
  "data_categories" JSONB NOT NULL,
  "destination" TEXT NOT NULL,
  "vehicle_ids" JSONB,
  "access_pattern" "DataAuthorizationAccessPattern" NOT NULL DEFAULT 'ONGOING',
  "status" "DataAuthorizationStatus" NOT NULL DEFAULT 'PENDING',
  "granted_by_id" TEXT,
  "granted_by_name" TEXT,
  "granted_at" TIMESTAMP(3),
  "revoked_by_id" TEXT,
  "revoked_by_name" TEXT,
  "revoked_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3),
  "notes" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "org_data_authorizations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "org_data_authorizations_organization_id_system_key_key"
  ON "org_data_authorizations"("organization_id", "system_key");

CREATE INDEX IF NOT EXISTS "org_data_authorizations_organization_id_idx"
  ON "org_data_authorizations"("organization_id");

CREATE INDEX IF NOT EXISTS "org_data_authorizations_status_idx"
  ON "org_data_authorizations"("status");

CREATE INDEX IF NOT EXISTS "org_data_authorizations_module_origin_idx"
  ON "org_data_authorizations"("module_origin");

CREATE INDEX IF NOT EXISTS "org_data_authorizations_requesting_entity_idx"
  ON "org_data_authorizations"("requesting_entity");

CREATE INDEX IF NOT EXISTS "org_data_authorizations_source_type_idx"
  ON "org_data_authorizations"("source_type");

CREATE INDEX IF NOT EXISTS "org_data_authorizations_risk_level_idx"
  ON "org_data_authorizations"("risk_level");

-- ActivityEntity extension
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'DATA_AUTHORIZATION';

-- Prompt 10/22: Versioned organization role assignments (additive)

CREATE TYPE "OrganizationRoleVersionStatus" AS ENUM ('DRAFT', 'APPROVED', 'SUPERSEDED', 'RETIRED');
CREATE TYPE "OrganizationRoleRiskClassification" AS ENUM ('STANDARD', 'ELEVATED', 'PRIVILEGED', 'CRITICAL');
CREATE TYPE "OrganizationRoleAssignmentMode" AS ENUM (
  'FOLLOW_LATEST_APPROVED_VERSION',
  'PINNED_VERSION',
  'MIGRATION_LEGACY_SNAPSHOT'
);
CREATE TYPE "MembershipPermissionOverrideEffect" AS ENUM ('ALLOW', 'DENY');

CREATE TABLE "organization_role_versions" (
  "id" TEXT NOT NULL,
  "organization_role_id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "name_snapshot" TEXT NOT NULL,
  "description_snapshot" TEXT,
  "permissions" JSONB,
  "default_station_scope" TEXT,
  "default_station_ids" JSONB,
  "field_agent_access" BOOLEAN NOT NULL DEFAULT false,
  "risk_classification" "OrganizationRoleRiskClassification" NOT NULL DEFAULT 'STANDARD',
  "created_by_user_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "change_reason" TEXT,
  "status" "OrganizationRoleVersionStatus" NOT NULL DEFAULT 'APPROVED',

  CONSTRAINT "organization_role_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization_role_assignments" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "organization_role_id" TEXT,
  "assigned_role_version_id" TEXT,
  "assignment_mode" "OrganizationRoleAssignmentMode" NOT NULL,
  "assigned_by_user_id" TEXT,
  "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ended_at" TIMESTAMP(3),
  "is_current" BOOLEAN NOT NULL DEFAULT true,

  CONSTRAINT "organization_role_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_permission_overrides" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "module_key" TEXT NOT NULL,
  "permission_level" TEXT NOT NULL,
  "effect" "MembershipPermissionOverrideEffect" NOT NULL,
  "actor_user_id" TEXT,
  "reason" TEXT,
  "expires_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "membership_permission_overrides_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_role_versions_organization_role_id_version_key"
  ON "organization_role_versions"("organization_role_id", "version");
CREATE INDEX "organization_role_versions_organization_id_status_idx"
  ON "organization_role_versions"("organization_id", "status");
CREATE INDEX "organization_role_versions_organization_role_id_status_version_idx"
  ON "organization_role_versions"("organization_role_id", "status", "version");

CREATE INDEX "organization_role_assignments_organization_id_membership_id_is_current_idx"
  ON "organization_role_assignments"("organization_id", "membership_id", "is_current");
CREATE INDEX "organization_role_assignments_membership_id_is_current_idx"
  ON "organization_role_assignments"("membership_id", "is_current");
CREATE INDEX "organization_role_assignments_organization_role_id_idx"
  ON "organization_role_assignments"("organization_role_id");
CREATE INDEX "organization_role_assignments_assigned_role_version_id_idx"
  ON "organization_role_assignments"("assigned_role_version_id");

CREATE INDEX "membership_permission_overrides_membership_id_module_key_revoked_at_idx"
  ON "membership_permission_overrides"("membership_id", "module_key", "revoked_at");
CREATE INDEX "membership_permission_overrides_organization_id_membership_id_idx"
  ON "membership_permission_overrides"("organization_id", "membership_id");
CREATE INDEX "membership_permission_overrides_expires_at_idx"
  ON "membership_permission_overrides"("expires_at");

ALTER TABLE "organization_role_versions"
  ADD CONSTRAINT "organization_role_versions_organization_role_id_fkey"
  FOREIGN KEY ("organization_role_id") REFERENCES "organization_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_role_versions"
  ADD CONSTRAINT "organization_role_versions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_role_versions"
  ADD CONSTRAINT "organization_role_versions_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization_role_assignments"
  ADD CONSTRAINT "organization_role_assignments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_role_assignments"
  ADD CONSTRAINT "organization_role_assignments_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_role_assignments"
  ADD CONSTRAINT "organization_role_assignments_organization_role_id_fkey"
  FOREIGN KEY ("organization_role_id") REFERENCES "organization_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_role_assignments"
  ADD CONSTRAINT "organization_role_assignments_assigned_role_version_id_fkey"
  FOREIGN KEY ("assigned_role_version_id") REFERENCES "organization_role_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_role_assignments"
  ADD CONSTRAINT "organization_role_assignments_assigned_by_user_id_fkey"
  FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "membership_permission_overrides"
  ADD CONSTRAINT "membership_permission_overrides_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_permission_overrides"
  ADD CONSTRAINT "membership_permission_overrides_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membership_permission_overrides"
  ADD CONSTRAINT "membership_permission_overrides_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: version 1 for every existing organization role
INSERT INTO "organization_role_versions" (
  "id",
  "organization_role_id",
  "organization_id",
  "version",
  "name_snapshot",
  "description_snapshot",
  "permissions",
  "default_station_scope",
  "default_station_ids",
  "field_agent_access",
  "risk_classification",
  "created_by_user_id",
  "change_reason",
  "status"
)
SELECT
  gen_random_uuid()::text,
  r."id",
  r."organization_id",
  1,
  r."name",
  r."description",
  r."permissions",
  r."station_scope_default",
  r."default_station_ids",
  r."field_agent_access_default",
  CASE
    WHEN r."membership_role" = 'ORG_ADMIN' THEN 'CRITICAL'::"OrganizationRoleRiskClassification"
    WHEN r."is_system_template" THEN 'PRIVILEGED'::"OrganizationRoleRiskClassification"
    ELSE 'STANDARD'::"OrganizationRoleRiskClassification"
  END,
  r."created_by_user_id",
  'MIGRATION: initial version from legacy organization_roles row',
  'APPROVED'::"OrganizationRoleVersionStatus"
FROM "organization_roles" r;

-- Backfill: legacy assignments for memberships with role link
INSERT INTO "organization_role_assignments" (
  "id",
  "organization_id",
  "membership_id",
  "organization_role_id",
  "assigned_role_version_id",
  "assignment_mode",
  "assigned_at",
  "effective_from",
  "is_current"
)
SELECT
  gen_random_uuid()::text,
  m."organization_id",
  m."id",
  m."organization_role_id",
  v."id",
  'MIGRATION_LEGACY_SNAPSHOT'::"OrganizationRoleAssignmentMode",
  m."created_at",
  m."created_at",
  true
FROM "organization_memberships" m
JOIN "organization_role_versions" v
  ON v."organization_role_id" = m."organization_role_id"
 AND v."version" = 1
WHERE m."organization_role_id" IS NOT NULL;

-- Backfill: legacy assignments for memberships without role link but with permission JSON
INSERT INTO "organization_role_assignments" (
  "id",
  "organization_id",
  "membership_id",
  "organization_role_id",
  "assigned_role_version_id",
  "assignment_mode",
  "assigned_at",
  "effective_from",
  "is_current"
)
SELECT
  gen_random_uuid()::text,
  m."organization_id",
  m."id",
  NULL,
  NULL,
  'MIGRATION_LEGACY_SNAPSHOT'::"OrganizationRoleAssignmentMode",
  m."created_at",
  m."created_at",
  true
FROM "organization_memberships" m
WHERE m."organization_role_id" IS NULL
  AND m."permissions" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "organization_role_assignments" a
    WHERE a."membership_id" = m."id" AND a."is_current" = true
  );

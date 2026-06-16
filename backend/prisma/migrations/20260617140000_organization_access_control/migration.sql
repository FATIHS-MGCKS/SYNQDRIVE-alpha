-- Organization access control: invites + role templates

CREATE TYPE "OrganizationInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'ORGANIZATION_INVITE';
ALTER TYPE "ActivityEntity" ADD VALUE IF NOT EXISTS 'ORGANIZATION_ROLE';

CREATE TABLE "organization_roles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "system_key" TEXT,
    "is_system_template" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "membership_role" "MembershipRole" NOT NULL,
    "permissions" JSONB,
    "station_scope_default" TEXT,
    "default_station_ids" JSONB,
    "field_agent_access_default" BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_roles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_roles_organization_id_system_key_key" ON "organization_roles"("organization_id", "system_key");
CREATE INDEX "organization_roles_organization_id_is_active_idx" ON "organization_roles"("organization_id", "is_active");

CREATE TABLE "organization_user_invites" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "membership_role" "MembershipRole" NOT NULL,
    "organization_role_id" TEXT,
    "permissions" JSONB,
    "station_scope" TEXT,
    "station_ids" JSONB,
    "field_agent_access" BOOLEAN NOT NULL DEFAULT false,
    "department" TEXT,
    "position" TEXT,
    "role_label" TEXT,
    "token_hash" TEXT NOT NULL,
    "token_lookup" TEXT NOT NULL,
    "status" "OrganizationInviteStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "invited_by_user_id" TEXT NOT NULL,
    "accepted_by_user_id" TEXT,
    "accepted_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organization_user_invites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "organization_user_invites_organization_id_status_idx" ON "organization_user_invites"("organization_id", "status");
CREATE INDEX "organization_user_invites_organization_id_email_idx" ON "organization_user_invites"("organization_id", "email");
CREATE UNIQUE INDEX "organization_user_invites_token_lookup_key" ON "organization_user_invites"("token_lookup");
CREATE INDEX "organization_user_invites_token_hash_idx" ON "organization_user_invites"("token_hash");

ALTER TABLE "organization_memberships" ADD COLUMN IF NOT EXISTS "organization_role_id" TEXT;
CREATE INDEX IF NOT EXISTS "organization_memberships_organization_role_id_idx" ON "organization_memberships"("organization_role_id");

ALTER TABLE "organization_roles" ADD CONSTRAINT "organization_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_roles" ADD CONSTRAINT "organization_roles_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization_user_invites" ADD CONSTRAINT "organization_user_invites_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_user_invites" ADD CONSTRAINT "organization_user_invites_organization_role_id_fkey" FOREIGN KEY ("organization_role_id") REFERENCES "organization_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization_user_invites" ADD CONSTRAINT "organization_user_invites_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "organization_user_invites" ADD CONSTRAINT "organization_user_invites_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_role_id_fkey" FOREIGN KEY ("organization_role_id") REFERENCES "organization_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- IAM org-bound refresh sessions (Prompt 7/22)

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "last_auth_organization_id" TEXT;

CREATE TYPE "RefreshTokenScope" AS ENUM (
  'ORG_MEMBERSHIP_BOUND',
  'LEGACY_UNSCOPED'
);

CREATE TYPE "SessionAssuranceLevel" AS ENUM (
  'PASSWORD',
  'MFA'
);

ALTER TABLE "refresh_tokens"
  ADD COLUMN IF NOT EXISTS "scope" "RefreshTokenScope" NOT NULL DEFAULT 'LEGACY_UNSCOPED',
  ADD COLUMN IF NOT EXISTS "permission_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "role_version" INTEGER,
  ADD COLUMN IF NOT EXISTS "assurance_level" "SessionAssuranceLevel",
  ADD COLUMN IF NOT EXISTS "authenticated_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "last_used_at" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "revocation_reason" TEXT;

-- Classify existing rows without org binding as legacy (do not invent org assignment).
UPDATE "refresh_tokens"
SET "scope" = 'LEGACY_UNSCOPED'
WHERE "organization_id" IS NULL OR "membership_id" IS NULL;

UPDATE "refresh_tokens"
SET "scope" = 'ORG_MEMBERSHIP_BOUND'
WHERE "organization_id" IS NOT NULL AND "membership_id" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "refresh_tokens_membership_id_idx"
  ON "refresh_tokens" ("membership_id");

CREATE INDEX IF NOT EXISTS "refresh_tokens_scope_idx"
  ON "refresh_tokens" ("scope");

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "refresh_tokens"
  ADD CONSTRAINT "refresh_tokens_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Cross-tenant consistency (membership.organization_id = refresh_tokens.organization_id)
-- is enforced in RefreshTokenService + refresh-session-binding.policy at runtime.
-- FK + application validation prevent cross-tenant binding on issue/rotate.

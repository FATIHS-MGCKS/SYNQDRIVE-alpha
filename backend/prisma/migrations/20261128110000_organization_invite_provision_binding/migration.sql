-- USR-P3A.3A FL-01: bind master-provisioned invites to persisted user + membership.
ALTER TABLE "organization_user_invites"
  ADD COLUMN IF NOT EXISTS "provisioned_user_id" TEXT,
  ADD COLUMN IF NOT EXISTS "provisioned_membership_id" TEXT;

ALTER TABLE "organization_user_invites"
  ADD CONSTRAINT "organization_user_invites_provisioned_user_id_fkey"
  FOREIGN KEY ("provisioned_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "organization_user_invites"
  ADD CONSTRAINT "organization_user_invites_provisioned_membership_id_fkey"
  FOREIGN KEY ("provisioned_membership_id") REFERENCES "organization_memberships"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "organization_user_invites_provisioned_user_id_idx"
  ON "organization_user_invites" ("provisioned_user_id");
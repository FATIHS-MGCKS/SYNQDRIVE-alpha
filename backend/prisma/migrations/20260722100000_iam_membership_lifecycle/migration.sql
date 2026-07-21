-- IAM membership lifecycle status model (Prompt 17)

ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'OFFBOARDING' AFTER 'SUSPENDED';
ALTER TYPE "MembershipStatus" ADD VALUE IF NOT EXISTS 'REACTIVATION_REQUIRED' AFTER 'REMOVED';

ALTER TABLE "organization_memberships"
  ADD COLUMN IF NOT EXISTS "membership_version" INTEGER NOT NULL DEFAULT 1;

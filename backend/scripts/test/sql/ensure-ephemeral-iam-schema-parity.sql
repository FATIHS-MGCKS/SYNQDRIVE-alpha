-- Disposable IAM schema parity (USR-P2A) — NOT migration-derived evidence.
-- Closes Prisma schema ↔ migration-chain gaps for IAM service tests on ephemeral PostgreSQL only.
-- Columns exist in schema.prisma but lack historical migration DDL (predates P2 IAM workstreams).
-- Production schema is not asserted here.

ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "must_change_password" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "mobile" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "address" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "language" TEXT DEFAULT 'de';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "timezone" TEXT DEFAULT 'Europe/Berlin';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "date_format" TEXT DEFAULT 'DD.MM.YYYY';
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_ip" TEXT;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_login_device" TEXT;

ALTER TABLE "organization_memberships" ADD COLUMN IF NOT EXISTS "role_label" TEXT;
ALTER TABLE "organization_memberships" ADD COLUMN IF NOT EXISTS "field_agent_access" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "organization_memberships" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "organization_memberships" ADD COLUMN IF NOT EXISTS "position" TEXT;
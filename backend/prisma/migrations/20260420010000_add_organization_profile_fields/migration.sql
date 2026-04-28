-- Tenant-facing company profile fields on `organizations`.
-- Extends the existing organization record so that ORG_ADMIN users can edit
-- their own company profile (state/zip/taxId/timezone/language/manager) from
-- the Settings → Company Profile tab without going through MASTER_ADMIN APIs.

ALTER TABLE "organizations" ADD COLUMN "state" TEXT;
ALTER TABLE "organizations" ADD COLUMN "zip" TEXT;
ALTER TABLE "organizations" ADD COLUMN "tax_id" TEXT;
ALTER TABLE "organizations" ADD COLUMN "timezone" TEXT;
ALTER TABLE "organizations" ADD COLUMN "language" TEXT;
ALTER TABLE "organizations" ADD COLUMN "manager_name" TEXT;
ALTER TABLE "organizations" ADD COLUMN "manager_email" TEXT;

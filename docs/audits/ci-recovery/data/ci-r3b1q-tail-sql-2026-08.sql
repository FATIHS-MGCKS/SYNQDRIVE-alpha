-- CI-R3B1O.4 temporary append-only tail reconciliation (three authorized tasks only)
-- Order: invoice stale index drop, WhatsApp stale index drop, canonical M252 forward reconciliation
-- Stale standalone indexes are removed first because they are obsolete recovery artifacts not required by schema.prisma and not backing active constraints. M252 DDL follows because parent organizations/organization_memberships already exist after normal deploy.

DROP INDEX IF EXISTS "org_invoices_invoice_number_key";
DROP INDEX IF EXISTS "whatsapp_conversations_organization_id_contact_phone_key";

-- Prompt 12/22: Role assignment drift reconciliation apply log (additive)

CREATE TABLE "organization_role_assignment_drift_reconciliation_applications" (
  "id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "membership_id" TEXT NOT NULL,
  "evidence_hash" TEXT NOT NULL,
  "expected_git_commit" TEXT NOT NULL,
  "operator" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "result" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "org_role_asgn_drift_recon_apps_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "org_role_asgn_drift_recon_apps_idem_key"
  ON "organization_role_assignment_drift_reconciliation_applications"("idempotency_key");

CREATE INDEX "org_role_asgn_drift_recon_apps_org_mbr_created_idx"
  ON "organization_role_assignment_drift_reconciliation_applications"("organization_id", "membership_id", "created_at");

ALTER TABLE "organization_role_assignment_drift_reconciliation_applications"
  ADD CONSTRAINT "org_role_asgn_drift_recon_apps_org_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_role_assignment_drift_reconciliation_applications"
  ADD CONSTRAINT "org_role_asgn_drift_recon_apps_mbr_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

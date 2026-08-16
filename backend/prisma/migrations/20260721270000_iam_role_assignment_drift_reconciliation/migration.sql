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

  CONSTRAINT "organization_role_assignment_drift_reconciliation_applications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "organization_role_assignment_drift_reconciliation_applications_idempotency_key_key"
  ON "organization_role_assignment_drift_reconciliation_applications"("idempotency_key");

CREATE INDEX "organization_role_assignment_drift_reconciliation_applications_organization_id_membership_id_created_at_idx"
  ON "organization_role_assignment_drift_reconciliation_applications"("organization_id", "membership_id", "created_at");

ALTER TABLE "organization_role_assignment_drift_reconciliation_applications"
  ADD CONSTRAINT "organization_role_assignment_drift_reconciliation_applications_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "organization_role_assignment_drift_reconciliation_applications"
  ADD CONSTRAINT "organization_role_assignment_drift_reconciliation_applications_membership_id_fkey"
  FOREIGN KEY ("membership_id") REFERENCES "organization_memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

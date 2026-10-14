-- VO-SIG-01 B1: audit trail for legacy connection-identity reconciliation.

CREATE TYPE "VehicleConnectionIdentityReconciliationOutcome" AS ENUM ('APPLIED', 'ROLLED_BACK');

CREATE TABLE "vehicle_connection_identity_reconciliation_audits" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "source_link_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "outcome" "VehicleConnectionIdentityReconciliationOutcome" NOT NULL,
    "before_metadata_fingerprint" TEXT NOT NULL,
    "after_metadata_fingerprint" TEXT NOT NULL,
    "evidence_provenance" JSONB NOT NULL,
    "operator_reference" TEXT,
    "authorization_reference" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "production_release_sha" TEXT,
    "rollback_audit_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_connection_identity_reconciliation_audits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_connection_identity_reconciliation_audits_idempotency_key_key" ON "vehicle_connection_identity_reconciliation_audits"("idempotency_key");
CREATE UNIQUE INDEX "vehicle_connection_identity_reconciliation_audits_rollback_audit_id_key" ON "vehicle_connection_identity_reconciliation_audits"("rollback_audit_id");
CREATE INDEX "vehicle_connection_identity_reconciliation_audits_organization_id_idx" ON "vehicle_connection_identity_reconciliation_audits"("organization_id");
CREATE INDEX "vehicle_connection_identity_reconciliation_audits_vehicle_id_idx" ON "vehicle_connection_identity_reconciliation_audits"("vehicle_id");
CREATE INDEX "vehicle_connection_identity_reconciliation_audits_source_link_id_idx" ON "vehicle_connection_identity_reconciliation_audits"("source_link_id");
CREATE INDEX "vehicle_connection_identity_reconciliation_audits_run_id_idx" ON "vehicle_connection_identity_reconciliation_audits"("run_id");

ALTER TABLE "vehicle_connection_identity_reconciliation_audits" ADD CONSTRAINT "vehicle_connection_identity_reconciliation_audits_source_link_id_fkey" FOREIGN KEY ("source_link_id") REFERENCES "vehicle_data_source_links"("id") ON DELETE CASCADE ON UPDATE CASCADE;

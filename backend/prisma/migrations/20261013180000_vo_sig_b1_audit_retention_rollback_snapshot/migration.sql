-- VO-SIG-01 B1 hardening: retention-safe audit FK + rollback metadata snapshots.

ALTER TABLE "vehicle_connection_identity_reconciliation_audits"
  ADD COLUMN "before_metadata_json" JSONB,
  ADD COLUMN "after_metadata_json" JSONB,
  ADD COLUMN "before_last_verified_at" TIMESTAMP(3),
  ADD COLUMN "after_last_verified_at" TIMESTAMP(3);

ALTER TABLE "vehicle_connection_identity_reconciliation_audits"
  DROP CONSTRAINT "vehicle_connection_identity_reconciliation_audits_source_link_id_fkey";

ALTER TABLE "vehicle_connection_identity_reconciliation_audits"
  ADD CONSTRAINT "vehicle_connection_identity_reconciliation_audits_source_link_id_fkey"
  FOREIGN KEY ("source_link_id") REFERENCES "vehicle_data_source_links"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- M3.3F F4.1 hardening — durable source-evidence ack fence (separate from D3 scientific revision).

CREATE TABLE "battery_longitudinal_source_evidence_acks" (
  "id" UUID NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "source_evidence_fingerprint" CHAR(64) NOT NULL,
  "longitudinal_profile_contract_version" TEXT NOT NULL,
  "profile_policy_version" TEXT NOT NULL,
  "canonical_profile_fingerprint" CHAR(64) NOT NULL,
  "revision_id" TEXT NOT NULL,
  "materialization_outcome" TEXT NOT NULL,
  "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "battery_longitudinal_source_evidence_acks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "battery_longitudinal_source_evidence_acks_revision_id_fkey"
    FOREIGN KEY ("revision_id") REFERENCES "battery_longitudinal_profile_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "battery_longitudinal_source_evidence_ack_fence"
  ON "battery_longitudinal_source_evidence_acks"(
    "organization_id",
    "vehicle_id",
    "source_evidence_fingerprint",
    "longitudinal_profile_contract_version",
    "profile_policy_version"
  );

CREATE INDEX "battery_longitudinal_source_evidence_acks_vehicle_ack_idx"
  ON "battery_longitudinal_source_evidence_acks"("organization_id", "vehicle_id", "acknowledged_at" DESC);

CREATE TABLE "battery_longitudinal_reconciliation_fleet_cursor" (
  "id" INTEGER NOT NULL DEFAULT 1,
  "last_organization_id" TEXT,
  "last_vehicle_id" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "battery_longitudinal_reconciliation_fleet_cursor_pkey" PRIMARY KEY ("id")
);

INSERT INTO "battery_longitudinal_reconciliation_fleet_cursor" ("id")
VALUES (1)
ON CONFLICT ("id") DO NOTHING;

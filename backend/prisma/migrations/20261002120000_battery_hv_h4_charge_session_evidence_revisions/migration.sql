-- M3.3-HV-H4-A3.1 — durable charge session source evidence revision + ACK (additive)

CREATE TABLE "battery_hv_charge_session_evidence_revisions" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "source_hv_charge_session_id" TEXT NOT NULL,
  "segment_fingerprint" TEXT NOT NULL,
  "evidence_contract_version" TEXT NOT NULL,
  "source_revision_fingerprint" CHAR(64) NOT NULL,
  "scientific_evidence_json" JSONB NOT NULL,
  "dimo_segment_id" TEXT,
  "provider_segment_id" TEXT,
  "source" TEXT NOT NULL,
  "start_at" TIMESTAMP(3) NOT NULL,
  "end_at" TIMESTAMP(3),
  "is_ongoing" BOOLEAN NOT NULL,
  "energy_added_kwh" DOUBLE PRECISION,
  "provider_observed_at" TIMESTAMP(3),
  "added_energy_provenance" TEXT,
  "quality_status" TEXT,
  "superseded_by_segment_fingerprint" TEXT,
  "started_before_range" BOOLEAN NOT NULL DEFAULT false,
  "source_created_at" TIMESTAMP(3) NOT NULL,
  "source_received_at" TIMESTAMP(3) NOT NULL,
  "source_updated_at" TIMESTAMP(3) NOT NULL,
  "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "battery_hv_charge_session_evidence_revisions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "battery_hv_cs_evidence_rev_fp_hex_chk"
    CHECK ("source_revision_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "battery_hv_charge_session_evidence_revision_scientific_identity"
  ON "battery_hv_charge_session_evidence_revisions"(
    "organization_id",
    "vehicle_id",
    "segment_fingerprint",
    "evidence_contract_version",
    "source_revision_fingerprint"
  );

CREATE INDEX "battery_hv_cs_evidence_rev_canonical_session_idx"
  ON "battery_hv_charge_session_evidence_revisions"(
    "organization_id",
    "vehicle_id",
    "segment_fingerprint",
    "evidence_contract_version"
  );

CREATE INDEX "battery_hv_cs_evidence_rev_population_idx"
  ON "battery_hv_charge_session_evidence_revisions"("organization_id", "vehicle_id", "start_at");

CREATE INDEX "battery_hv_cs_evidence_rev_source_row_idx"
  ON "battery_hv_charge_session_evidence_revisions"("source_hv_charge_session_id");

CREATE INDEX "battery_hv_cs_evidence_rev_provider_idx"
  ON "battery_hv_charge_session_evidence_revisions"("vehicle_id", "provider_segment_id");

ALTER TABLE "battery_hv_charge_session_evidence_revisions"
  ADD CONSTRAINT "battery_hv_cs_evidence_revisions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "battery_hv_charge_session_evidence_revisions"
  ADD CONSTRAINT "battery_hv_cs_evidence_revisions_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "battery_hv_charge_session_evidence_acks" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "segment_fingerprint" TEXT NOT NULL,
  "evidence_contract_version" TEXT NOT NULL,
  "source_revision_fingerprint" CHAR(64) NOT NULL,
  "revision_id" TEXT NOT NULL,
  "durability_ack_contract_version" TEXT NOT NULL,
  "acknowledged_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "battery_hv_charge_session_evidence_acks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "battery_hv_cs_evidence_ack_fp_hex_chk"
    CHECK ("source_revision_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "battery_hv_charge_session_evidence_ack_fence"
  ON "battery_hv_charge_session_evidence_acks"(
    "organization_id",
    "vehicle_id",
    "segment_fingerprint",
    "evidence_contract_version",
    "source_revision_fingerprint",
    "durability_ack_contract_version"
  );

CREATE INDEX "battery_hv_charge_session_evidence_acks_revision_idx"
  ON "battery_hv_charge_session_evidence_acks"("revision_id");

ALTER TABLE "battery_hv_charge_session_evidence_acks"
  ADD CONSTRAINT "battery_hv_cs_evidence_acks_revision_id_fkey"
  FOREIGN KEY ("revision_id") REFERENCES "battery_hv_charge_session_evidence_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- P5B.1 append-only offline correlation evidence (runtime write gate OFF by default).
CREATE TABLE "vsi_apds_p5_correlation_evidence" (
    "id" UUID NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "provider_source_link_id" TEXT,
    "opportunity_id" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "activation_epoch_id" TEXT,
    "shadow_execution_version" TEXT,
    "decision_at" TIMESTAMPTZ(3) NOT NULL,
    "p5_correlation_contract_version" TEXT NOT NULL,
    "correlation_fingerprint" TEXT NOT NULL,
    "evidence_revision" INTEGER NOT NULL,
    "replay_run_id" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vsi_apds_p5_correlation_evidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vsi_apds_p5_corr_evidence_fingerprint_key" ON "vsi_apds_p5_correlation_evidence"(
    "organization_id",
    "vehicle_id",
    "opportunity_id",
    "policy_version",
    "decision_at",
    "p5_correlation_contract_version",
    "correlation_fingerprint"
);

CREATE UNIQUE INDEX "vsi_apds_p5_corr_evidence_rev_key" ON "vsi_apds_p5_correlation_evidence"(
    "organization_id",
    "vehicle_id",
    "opportunity_id",
    "policy_version",
    "decision_at",
    "p5_correlation_contract_version",
    "evidence_revision"
);

CREATE INDEX "vsi_apds_p5_corr_evidence_org_decision_idx" ON "vsi_apds_p5_correlation_evidence"(
    "organization_id",
    "decision_at"
);

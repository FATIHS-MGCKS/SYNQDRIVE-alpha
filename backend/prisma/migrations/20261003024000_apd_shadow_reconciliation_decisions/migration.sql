-- P2.5 APD shadow observe-only forensic decisions (WORKER_APD_SHADOW_ENABLED=false default).

CREATE TABLE "apd_shadow_reconciliation_decisions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "decision_at" TIMESTAMP(3) NOT NULL,
    "real_poll_id" TEXT,
    "policy_version" TEXT NOT NULL,
    "profile_version" TEXT NOT NULL,
    "profile_class" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "last_lv_source_at" TIMESTAMP(3),
    "last_provider_fetched_at" TIMESTAMP(3),
    "expected_window_start" TIMESTAMP(3),
    "expected_window_end" TIMESTAMP(3),
    "provider_gap_state" TEXT,
    "connectivity_state" TEXT,
    "wake_correlation_id" TEXT,
    "real_poll_completed_at" TIMESTAMP(3),
    "new_lv_source_observed" BOOLEAN NOT NULL DEFAULT false,
    "new_lv_source_at" TIMESTAMP(3),
    "new_top_level_source_observed" BOOLEAN NOT NULL DEFAULT false,
    "new_obd_source_observed" BOOLEAN NOT NULL DEFAULT false,
    "new_ignition_source_observed" BOOLEAN NOT NULL DEFAULT false,
    "simulated_next_poll_at" TIMESTAMP(3),
    "simulated_discovery_at" TIMESTAMP(3),
    "additional_discovery_delay_ms" INTEGER,
    "legacy_assessment_impact" TEXT NOT NULL DEFAULT 'NONE',
    "legacy_publication_impact" TEXT NOT NULL DEFAULT 'NONE',
    "legacy_customer_impact" TEXT NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apd_shadow_reconciliation_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "apd_shadow_reconciliation_decisions_org_vehicle_opportunity_policy_key" ON "apd_shadow_reconciliation_decisions"("organization_id", "vehicle_id", "opportunity_id", "policy_version");

CREATE INDEX "apd_shadow_reconciliation_decisions_vehicle_id_decision_at_idx" ON "apd_shadow_reconciliation_decisions"("vehicle_id", "decision_at");

CREATE INDEX "apd_shadow_reconciliation_decisions_organization_id_decision_at_idx" ON "apd_shadow_reconciliation_decisions"("organization_id", "decision_at");

ALTER TABLE "apd_shadow_reconciliation_decisions" ADD CONSTRAINT "apd_shadow_reconciliation_decisions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "apd_shadow_reconciliation_decisions" ADD CONSTRAINT "apd_shadow_reconciliation_decisions_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

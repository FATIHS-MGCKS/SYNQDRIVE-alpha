-- P2.5 APDS durable shadow activation epoch (additive; preserves historical decision rows).

CREATE TYPE "ApdShadowActivationEpochLifecycle" AS ENUM ('PREPARED', 'ACTIVE', 'PAUSED', 'CLOSED');

CREATE TABLE "apd_shadow_activation_epochs" (
    "id" TEXT NOT NULL,
    "activation_scope_key" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "cohort_config_fingerprint_sha256" TEXT NOT NULL,
    "cohort_config_version" TEXT NOT NULL,
    "b2_policy_version" TEXT NOT NULL,
    "b4_policy_version" TEXT NOT NULL,
    "production_release_identity" TEXT,
    "lifecycle_state" "ApdShadowActivationEpochLifecycle" NOT NULL,
    "activated_at" TIMESTAMP(3),
    "prepared_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paused_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "operator_actor" TEXT,
    "operator_reason" TEXT,
    "operator_request_id" TEXT,
    "activation_request_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "apd_shadow_activation_epochs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "apd_shadow_activation_epochs_activation_request_key_key" ON "apd_shadow_activation_epochs"("activation_request_key");

CREATE INDEX "apd_shadow_activation_epochs_activation_scope_key_lifecycle__idx" ON "apd_shadow_activation_epochs"("activation_scope_key", "lifecycle_state");

CREATE INDEX "apd_shadow_activation_epochs_organization_id_lifecycle_state_idx" ON "apd_shadow_activation_epochs"("organization_id", "lifecycle_state");

CREATE UNIQUE INDEX "apd_shadow_activation_epochs_one_active_per_scope" ON "apd_shadow_activation_epochs"("activation_scope_key") WHERE "lifecycle_state" = 'ACTIVE';

ALTER TABLE "apd_shadow_activation_epochs" ADD CONSTRAINT "apd_shadow_activation_epochs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "apd_shadow_reconciliation_decisions" ADD COLUMN "activation_epoch_id" TEXT;

CREATE INDEX "apd_shadow_reconciliation_decisions_activation_epoch_id_de_idx" ON "apd_shadow_reconciliation_decisions"("activation_epoch_id", "decision_at");

ALTER TABLE "apd_shadow_reconciliation_decisions" ADD CONSTRAINT "apd_shadow_reconciliation_decisions_activation_epoch_id_fkey" FOREIGN KEY ("activation_epoch_id") REFERENCES "apd_shadow_activation_epochs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

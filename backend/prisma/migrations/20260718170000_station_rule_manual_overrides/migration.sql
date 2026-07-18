-- Audited manual overrides for station booking/transfer rule warnings and confirmations

CREATE TYPE "StationRuleManualOverrideReferenceType" AS ENUM ('BOOKING_RULES', 'TRANSFER_PLAN');

CREATE TABLE "station_rule_manual_overrides" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "reference_type" "StationRuleManualOverrideReferenceType" NOT NULL,
  "booking_id" TEXT,
  "transfer_id" TEXT,
  "scope_fingerprint" TEXT NOT NULL,
  "scope_snapshot" JSONB NOT NULL,
  "permission" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "actor_user_id" TEXT NOT NULL,
  "original_rule_results" JSONB NOT NULL,
  "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "revoked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "station_rule_manual_overrides_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "station_rule_manual_overrides_organization_id_idx"
  ON "station_rule_manual_overrides"("organization_id");
CREATE INDEX "station_rule_manual_overrides_booking_id_idx"
  ON "station_rule_manual_overrides"("booking_id");
CREATE INDEX "station_rule_manual_overrides_transfer_id_idx"
  ON "station_rule_manual_overrides"("transfer_id");
CREATE INDEX "station_rule_manual_overrides_scope_fingerprint_idx"
  ON "station_rule_manual_overrides"("organization_id", "scope_fingerprint");

ALTER TABLE "station_rule_manual_overrides"
  ADD CONSTRAINT "station_rule_manual_overrides_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "station_rule_manual_overrides"
  ADD CONSTRAINT "station_rule_manual_overrides_booking_id_fkey"
  FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "station_rule_manual_overrides"
  ADD CONSTRAINT "station_rule_manual_overrides_transfer_id_fkey"
  FOREIGN KEY ("transfer_id") REFERENCES "vehicle_station_transfers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "station_rule_manual_overrides"
  ADD CONSTRAINT "station_rule_manual_overrides_actor_user_id_fkey"
  FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

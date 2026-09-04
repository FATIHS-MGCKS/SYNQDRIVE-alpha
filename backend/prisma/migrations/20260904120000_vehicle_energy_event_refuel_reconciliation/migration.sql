-- G2.1 physical-refuel reconciliation persistence (feature-flagged; not activated in production by default).

CREATE TYPE "PhysicalRefuelFinalityState" AS ENUM (
  'PROVISIONAL',
  'SETTLING',
  'FINAL_CANONICAL',
  'FINAL_DISTINCT',
  'INSUFFICIENT_EVIDENCE'
);

CREATE TABLE "vehicle_energy_event_refuel_reconciliations" (
  "id" TEXT NOT NULL,
  "energy_event_id" TEXT NOT NULL,
  "vehicle_id" TEXT NOT NULL,
  "reconciliation_group_id" TEXT NOT NULL,
  "classification" TEXT NOT NULL,
  "finality_state" "PhysicalRefuelFinalityState" NOT NULL,
  "canonical_event_id" TEXT,
  "enrichment_eligible" BOOLEAN NOT NULL DEFAULT false,
  "settlement_window_open" BOOLEAN NOT NULL DEFAULT true,
  "late_sibling_conflict" BOOLEAN NOT NULL DEFAULT false,
  "reason" TEXT NOT NULL,
  "reason_codes" JSONB NOT NULL DEFAULT '[]',
  "coordinate_latitude" DOUBLE PRECISION,
  "coordinate_longitude" DOUBLE PRECISION,
  "coordinate_source" TEXT,
  "coordinate_selector_version" TEXT,
  "enrichment_enqueued_at" TIMESTAMP(3),
  "reconciled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "vehicle_energy_event_refuel_reconciliations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "vehicle_energy_event_refuel_reconciliations_energy_event_id_key"
  ON "vehicle_energy_event_refuel_reconciliations"("energy_event_id");

CREATE INDEX "vehicle_energy_event_refuel_reconciliations_vehicle_id_reconciled_at_idx"
  ON "vehicle_energy_event_refuel_reconciliations"("vehicle_id", "reconciled_at");

CREATE INDEX "vehicle_energy_event_refuel_reconciliations_vehicle_id_finality_state_idx"
  ON "vehicle_energy_event_refuel_reconciliations"("vehicle_id", "finality_state");

CREATE INDEX "vehicle_energy_event_refuel_reconciliations_reconciliation_group_id_idx"
  ON "vehicle_energy_event_refuel_reconciliations"("reconciliation_group_id");

CREATE INDEX "vehicle_energy_events_vehicle_id_kind_start_time_idx"
  ON "vehicle_energy_events"("vehicle_id", "kind", "start_time");

ALTER TABLE "vehicle_energy_event_refuel_reconciliations"
  ADD CONSTRAINT "vehicle_energy_event_refuel_reconciliations_energy_event_id_fkey"
  FOREIGN KEY ("energy_event_id") REFERENCES "vehicle_energy_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

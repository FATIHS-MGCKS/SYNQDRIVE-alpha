-- G2.1a: durable reconciliation recovery + candidate query index alignment.

ALTER TABLE "vehicle_energy_event_refuel_reconciliations"
  ADD COLUMN "coordinate_selection_status" TEXT,
  ADD COLUMN "next_reconciliation_at" TIMESTAMP(3);

CREATE INDEX "vehicle_energy_event_refuel_reconciliations_finality_state_next_reconciliation_at_idx"
  ON "vehicle_energy_event_refuel_reconciliations"("finality_state", "next_reconciliation_at");

CREATE INDEX "vehicle_energy_event_refuel_reconciliations_enrichment_eligible_enrichment_enqueued_at_idx"
  ON "vehicle_energy_event_refuel_reconciliations"("enrichment_eligible", "enrichment_enqueued_at");

CREATE INDEX "vehicle_energy_events_vehicle_id_kind_created_at_idx"
  ON "vehicle_energy_events"("vehicle_id", "kind", "created_at");

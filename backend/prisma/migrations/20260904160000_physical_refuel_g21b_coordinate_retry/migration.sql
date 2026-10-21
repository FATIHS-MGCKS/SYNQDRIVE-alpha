-- G2.1b: coordinate retry backoff + fair recovery support.

ALTER TABLE "vehicle_energy_event_refuel_reconciliations"
  ADD COLUMN "coordinate_retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_coordinate_retry_at" TIMESTAMP(3),
  ADD COLUMN "last_coordinate_attempt_at" TIMESTAMP(3);

CREATE INDEX "vehicle_energy_event_refuel_reconciliations_next_coordinate_retry_at_idx"
  ON "vehicle_energy_event_refuel_reconciliations"("next_coordinate_retry_at");

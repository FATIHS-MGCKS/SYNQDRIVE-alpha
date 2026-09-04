-- G2.1c: coordinate evidence fingerprint for terminal-hold invalidation.

ALTER TABLE "vehicle_energy_event_refuel_reconciliations"
  ADD COLUMN "coordinate_evidence_fingerprint" TEXT;

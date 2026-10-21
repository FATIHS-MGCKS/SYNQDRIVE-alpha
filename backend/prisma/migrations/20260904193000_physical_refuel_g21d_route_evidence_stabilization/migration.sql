-- G2.1d: route evidence stabilization fields for bounded coordinate re-evaluation.
ALTER TABLE "vehicle_energy_event_refuel_reconciliations"
  ADD COLUMN IF NOT EXISTS "route_evidence_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "route_evidence_stabilization_until" TIMESTAMPTZ;

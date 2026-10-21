-- Event -> Trip association reconciliation access path.
--
-- Post-finalization reconciliation and the bounded delayed sweep both read:
--   WHERE vehicle_id = $1 AND observed_at BETWEEN $2 AND $3 AND trip_id IS NULL
--   ORDER BY observed_at ASC LIMIT $4
--
-- The existing single-column "vehicle_id" index forces the whole candidate
-- history of a vehicle to be read before the time filter is applied. The
-- composite bounds the scan to the reconciliation window (one trip duration on
-- finalization, 45 min / 12 h / 7 d for the fast / warm / cold tiers), so cost
-- scales with window size rather than with retained history.

CREATE INDEX IF NOT EXISTS "rpm_webhook_candidates_vehicle_id_observed_at_idx"
  ON "rpm_webhook_candidates"("vehicle_id", "observed_at");

-- M3.3G G2.1 — one active CONFIRMED BATTERY_REPLACEMENT per source service event + scope
CREATE UNIQUE INDEX "battery_ground_truth_one_active_replacement_per_source_scope"
ON "battery_ground_truth_events" ("organization_id", "source_service_event_id", "battery_scope")
WHERE "verification_status" = 'CONFIRMED'
  AND "ground_truth_type" = 'BATTERY_REPLACEMENT'
  AND "source_service_event_id" IS NOT NULL;

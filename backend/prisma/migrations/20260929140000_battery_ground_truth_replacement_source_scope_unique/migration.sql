-- M3.3G G2.1/G2.2 — one active CONFIRMED BATTERY_REPLACEMENT per source service event (scope is fact content, not identity)
CREATE UNIQUE INDEX "battery_ground_truth_one_active_replacement_per_source_event"
ON "battery_ground_truth_events" ("organization_id", "source_service_event_id")
WHERE "verification_status" = 'CONFIRMED'
  AND "ground_truth_type" = 'BATTERY_REPLACEMENT'
  AND "source_service_event_id" IS NOT NULL;

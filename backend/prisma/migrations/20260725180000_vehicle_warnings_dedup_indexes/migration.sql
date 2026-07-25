-- VW-F-007: max one active DTC per vehicle+code
CREATE UNIQUE INDEX IF NOT EXISTS "vehicle_dtc_events_active_code_uidx"
  ON "vehicle_dtc_events" ("vehicle_id", "dtc_code")
  WHERE "is_active" = true;

-- VW-F-021: max one active insight per org+dedupe_key
CREATE UNIQUE INDEX IF NOT EXISTS "dashboard_insights_active_dedupe_uidx"
  ON "dashboard_insights" ("organization_id", "dedupe_key")
  WHERE "is_active" = true;

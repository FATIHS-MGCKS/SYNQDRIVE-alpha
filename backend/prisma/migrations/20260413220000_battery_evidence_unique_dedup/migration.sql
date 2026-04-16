-- Deduplicate battery_evidence rows that share the same
-- (vehicle_id, scope, value_type, source_type, observed_at) tuple.
--
-- Historically BatteryV2Service.onSnapshot emitted two extra evidence rows
-- (VOLTAGE_V + RESTING_VOLTAGE_V) on every rest capture while
-- BatteryHealthService.recordSnapshot already persisted the same tuple, so
-- running installs typically carry deterministic duplicates that would break
-- the unique index below if added naively.  We keep the oldest row per tuple
-- (smallest id) and drop the rest before enforcing uniqueness.

DELETE FROM "battery_evidence" a
USING "battery_evidence" b
WHERE a."id" > b."id"
  AND a."vehicle_id" = b."vehicle_id"
  AND a."scope" = b."scope"
  AND a."value_type" = b."value_type"
  AND a."source_type" = b."source_type"
  AND a."observed_at" = b."observed_at";

-- CreateIndex
CREATE UNIQUE INDEX "battery_evidence_dedup_key"
  ON "battery_evidence" ("vehicle_id", "scope", "value_type", "source_type", "observed_at");

-- Extend HmSyncStatus enum with MQTT_ONLY.
-- Background: fleet-clearance OEMs (e.g. Mercedes-Benz) reject the HM REST
-- /command endpoint with 404 and deliver telemetry exclusively via MQTT push.
-- HighMobilityHealthFetchService tags these runs as 'MQTT_ONLY' and persists
-- them in high_mobility_health_sync_log. Without this enum value the insert
-- silently fails (logged as "Failed to write HM sync log").
ALTER TYPE "HmSyncStatus" ADD VALUE IF NOT EXISTS 'MQTT_ONLY';

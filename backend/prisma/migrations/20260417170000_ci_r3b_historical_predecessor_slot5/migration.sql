-- CI-R3B historical predecessor repair slot 5
-- after: 20260417160000_add_mqtt_only_hm_sync_status
-- before: 20260417180000_add_battery_critical_insight_type

DO $$ BEGIN
    CREATE TYPE "InsightType" AS ENUM ('TIGHT_HANDOVER', 'RETURN_NEEDS_INSPECTION', 'STATION_SHORTAGE', 'LOW_UTILIZATION', 'SERVICE_WINDOW', 'SERVICE_BEFORE_BOOKING');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

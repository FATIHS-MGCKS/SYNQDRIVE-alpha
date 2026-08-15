-- CI-R3B historical predecessor repair slot 14
-- after: 20260716200000_driving_evidence
-- before: 20260716200000_tire_odometer_anchor_backfill_event

DO $$ BEGIN
    CREATE TYPE "TireEventType" AS ENUM ('ROTATION', 'TIRE_CHANGE', 'MEASUREMENT', 'RECALCULATION', 'ALERT', 'INSTALL', 'REMOVE');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

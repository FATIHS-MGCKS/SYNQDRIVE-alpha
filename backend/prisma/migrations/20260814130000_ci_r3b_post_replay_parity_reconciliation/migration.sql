-- CI-R3B post-replay parity reconciliation (ledger §5.4)
-- Minimum proven delta: trip_status DEFAULT ONGOING (not COMPLETED)

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'vehicle_trips'
          AND column_name = 'trip_status'
    ) THEN
        ALTER TABLE vehicle_trips
            ALTER COLUMN trip_status
            SET DEFAULT 'ONGOING'::"TripStatus";
    END IF;
END $$;

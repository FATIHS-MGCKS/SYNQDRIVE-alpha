-- CI-R3B post-shim (Option J): guard-first rename back to lowercase
-- Authority: decision package §3.3 (POST-PRE-FC01..10, POST-ACT01, POST-NOOP01)

DO $$
DECLARE
    post_shim_migration constant text := '20260425000001_ci_r3b_trip_casing_post_shim';
    target_migration constant text := '20260425000000_retire_user_assignment_and_speeding_severity';
    unresolved_post_shim_count integer;
    finished_and_unresolved boolean;
    current_self_rolled_back boolean;
    stale_unresolved_old boolean;
    has_vehicle_trips boolean;
    has_vehicle_trip boolean;
    has_trip_driving_impact boolean;
    has_trip_driving_impact_pascal boolean;
    has_old_enum boolean;
    enum_state_invalid boolean;
    target_state_invalid boolean;
    final_tas_labels text[] := ARRAY['ASSIGNED_DRIVER','ASSIGNED_BOOKING_CUSTOMER','PRIVATE_UNASSIGNED','UNKNOWN_ASSIGNMENT'];
    final_tast_labels text[] := ARRAY['DRIVER','BOOKING_CUSTOMER'];
    actual_tas_labels text[];
    actual_tast_labels text[];
BEGIN
    SELECT COUNT(*) INTO unresolved_post_shim_count
    FROM "_prisma_migrations"
    WHERE migration_name = post_shim_migration
      AND finished_at IS NULL
      AND rolled_back_at IS NULL;

    SELECT EXISTS (
        SELECT 1
        FROM "_prisma_migrations" finished
        WHERE finished.migration_name = post_shim_migration
          AND finished.finished_at IS NOT NULL
          AND finished.rolled_back_at IS NULL
          AND EXISTS (
              SELECT 1 FROM "_prisma_migrations" unresolved
              WHERE unresolved.migration_name = post_shim_migration
                AND unresolved.finished_at IS NULL
                AND unresolved.rolled_back_at IS NULL
                AND unresolved.id <> finished.id
          )
    ) INTO finished_and_unresolved;

    SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = post_shim_migration
          AND finished_at IS NULL
          AND rolled_back_at IS NOT NULL
        ORDER BY started_at DESC
        LIMIT 1
    ) INTO current_self_rolled_back;

    SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations" older
        WHERE older.migration_name = post_shim_migration
          AND older.finished_at IS NULL
          AND older.rolled_back_at IS NULL
          AND older.id <> (
              SELECT id FROM "_prisma_migrations"
              WHERE migration_name = post_shim_migration
              ORDER BY started_at DESC
              LIMIT 1
          )
    ) INTO stale_unresolved_old;

    SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'vehicle_trips' AND c.relkind = 'r'
    ) INTO has_vehicle_trips;

    SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'VehicleTrip' AND c.relkind = 'r'
    ) INTO has_vehicle_trip;

    SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'trip_driving_impact' AND c.relkind = 'r'
    ) INTO has_trip_driving_impact;

    SELECT EXISTS (
        SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'TripDrivingImpact' AND c.relkind = 'r'
    ) INTO has_trip_driving_impact_pascal;

    SELECT EXISTS (
        SELECT 1 FROM pg_type
        WHERE typname IN ('TripAssignmentStatus_old', 'TripAssignmentSubjectType_old')
    ) INTO has_old_enum;

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO actual_tas_labels
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TripAssignmentStatus';

    SELECT array_agg(e.enumlabel ORDER BY e.enumsortorder)
    INTO actual_tast_labels
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'TripAssignmentSubjectType';

    SELECT (
        NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripAssignmentStatus')
        OR NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripAssignmentSubjectType')
        OR EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'TripAssignmentStatus' AND e.enumlabel = 'ASSIGNED_USER'
        )
        OR EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'TripAssignmentSubjectType' AND e.enumlabel = 'USER'
        )
        OR actual_tas_labels IS DISTINCT FROM final_tas_labels
        OR actual_tast_labels IS DISTINCT FROM final_tast_labels
    ) INTO enum_state_invalid;

    SELECT (
        NOT EXISTS (
            SELECT 1 FROM "_prisma_migrations"
            WHERE migration_name = target_migration
              AND finished_at IS NOT NULL
              AND rolled_back_at IS NULL
        )
    ) INTO target_state_invalid;

    -- POST-PRE-FC01
    IF unresolved_post_shim_count >= 2 THEN
        RAISE EXCEPTION 'POST-PRE-FC01: multiple unresolved post-shim rows';
    END IF;

    -- POST-PRE-FC02
    IF finished_and_unresolved THEN
        RAISE EXCEPTION 'POST-PRE-FC02: finished and unresolved post-shim rows coexist';
    END IF;

    -- POST-PRE-FC03
    IF current_self_rolled_back THEN
        RAISE EXCEPTION 'POST-PRE-FC03: current post-shim self-row rolled back';
    END IF;

    -- POST-PRE-FC04
    IF stale_unresolved_old THEN
        RAISE EXCEPTION 'POST-PRE-FC04: stale unresolved older post-shim attempt';
    END IF;

    -- POST-PRE-FC05
    IF (has_vehicle_trips AND has_vehicle_trip)
        OR (has_trip_driving_impact AND has_trip_driving_impact_pascal) THEN
        RAISE EXCEPTION 'POST-PRE-FC05: duplicate lowercase and PascalCase relations';
    END IF;

    -- POST-PRE-FC06
    IF (NOT has_vehicle_trips AND NOT has_vehicle_trip)
        OR (NOT has_trip_driving_impact AND NOT has_trip_driving_impact_pascal) THEN
        RAISE EXCEPTION 'POST-PRE-FC06: missing relation for affected logical table';
    END IF;

    -- POST-PRE-FC07
    IF (has_vehicle_trips AND has_trip_driving_impact_pascal)
        OR (has_vehicle_trip AND has_trip_driving_impact) THEN
        RAISE EXCEPTION 'POST-PRE-FC07: mixed casing across affected tables';
    END IF;

    -- POST-PRE-FC08
    IF has_old_enum THEN
        RAISE EXCEPTION 'POST-PRE-FC08: _old enum type residue present';
    END IF;

    -- POST-PRE-FC09
    IF enum_state_invalid THEN
        RAISE EXCEPTION 'POST-PRE-FC09: replacement enum state invalid';
    END IF;

    -- POST-PRE-FC10
    IF target_state_invalid THEN
        RAISE EXCEPTION 'POST-PRE-FC10: target migration not successfully finished';
    END IF;

    -- POST-ACT01
    IF has_vehicle_trip AND has_trip_driving_impact_pascal
        AND NOT has_vehicle_trips AND NOT has_trip_driving_impact THEN
        ALTER TABLE "VehicleTrip" RENAME TO vehicle_trips;
        ALTER TABLE "TripDrivingImpact" RENAME TO trip_driving_impact;

        IF NOT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'vehicle_trips' AND c.relkind = 'r'
        ) OR NOT EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname = 'trip_driving_impact' AND c.relkind = 'r'
        ) THEN
            RAISE EXCEPTION 'POSTCONDITION: lowercase relations missing after rename';
        END IF;
        IF EXISTS (
            SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'public' AND c.relname IN ('VehicleTrip', 'TripDrivingImpact') AND c.relkind = 'r'
        ) THEN
            RAISE EXCEPTION 'POSTCONDITION: PascalCase relations still present after rename';
        END IF;
        RETURN;
    END IF;

    -- POST-NOOP01
    IF has_vehicle_trips AND has_trip_driving_impact
        AND NOT has_vehicle_trip AND NOT has_trip_driving_impact_pascal THEN
        RETURN;
    END IF;

    RAISE EXCEPTION 'POST-SHIM: no matching guard outcome';
END $$;

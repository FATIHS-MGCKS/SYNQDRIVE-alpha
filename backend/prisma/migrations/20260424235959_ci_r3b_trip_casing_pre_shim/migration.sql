-- CI-R3B pre-shim (Option J): guard-first rename to PascalCase on fresh replay
-- Authority: decision package §3.2 (PRE-FC01..PRE-FC09, PRE-ACT01, PRE-NOOP01)

DO $$
DECLARE
    target_migration constant text := '20260425000000_retire_user_assignment_and_speeding_severity';
    target_present boolean;
    target_finished boolean;
    target_unfinished boolean;
    has_vehicle_trips boolean;
    has_vehicle_trip boolean;
    has_trip_driving_impact boolean;
    has_trip_driving_impact_pascal boolean;
    has_old_enum boolean;
    target_started_partial boolean;
    replacement_enum_missing boolean;
    retired_labels_after_target boolean;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = target_migration
    ) INTO target_present;

    SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = target_migration
          AND finished_at IS NOT NULL
          AND rolled_back_at IS NULL
    ) INTO target_finished;

    SELECT EXISTS (
        SELECT 1 FROM "_prisma_migrations"
        WHERE migration_name = target_migration
          AND (finished_at IS NULL OR rolled_back_at IS NOT NULL)
    ) INTO target_unfinished;

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

    SELECT target_present AND NOT target_finished INTO target_started_partial;

    SELECT target_started_partial AND (
        NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripAssignmentStatus')
        OR NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripAssignmentSubjectType')
    ) INTO replacement_enum_missing;

    SELECT target_finished AND (
        EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'TripAssignmentStatus' AND e.enumlabel = 'ASSIGNED_USER'
        )
        OR EXISTS (
            SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'TripAssignmentSubjectType' AND e.enumlabel = 'USER'
        )
    ) INTO retired_labels_after_target;

    -- PRE-FC01
    IF target_present AND target_unfinished THEN
        RAISE EXCEPTION 'PRE-FC01: target migration present but unfinished or rolled back';
    END IF;

    -- PRE-FC02
    IF (has_vehicle_trips AND has_vehicle_trip)
        OR (has_trip_driving_impact AND has_trip_driving_impact_pascal) THEN
        RAISE EXCEPTION 'PRE-FC02: duplicate lowercase and PascalCase relations';
    END IF;

    -- PRE-FC03
    IF (NOT has_vehicle_trips AND NOT has_vehicle_trip)
        OR (NOT has_trip_driving_impact AND NOT has_trip_driving_impact_pascal) THEN
        RAISE EXCEPTION 'PRE-FC03: missing relation for affected logical table';
    END IF;

    -- PRE-FC04
    IF (has_vehicle_trips <> has_trip_driving_impact)
        OR (has_vehicle_trip <> has_trip_driving_impact_pascal) THEN
        RAISE EXCEPTION 'PRE-FC04: mixed casing across affected tables';
    END IF;

    -- PRE-FC05
    IF has_old_enum THEN
        RAISE EXCEPTION 'PRE-FC05: _old enum type residue present';
    END IF;

    -- PRE-FC06
    IF replacement_enum_missing THEN
        RAISE EXCEPTION 'PRE-FC06: replacement enum type missing after partial target execution';
    END IF;

    -- PRE-FC07
    IF retired_labels_after_target THEN
        RAISE EXCEPTION 'PRE-FC07: retired enum labels still present after target finished';
    END IF;

    -- PRE-FC08: target prerequisite columns/types for the unchanged target migration
    IF NOT target_present THEN
        IF NOT has_vehicle_trips OR NOT has_trip_driving_impact THEN
            RAISE EXCEPTION 'PRE-FC08: prerequisite lowercase relations missing';
        END IF;
        IF (
            SELECT COUNT(*)
            FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name = 'vehicle_trips'
              AND column_name IN (
                  'assignment_status',
                  'assignment_subject_type',
                  'assignment_subject_id'
              )
        ) <> 3 THEN
            RAISE EXCEPTION 'PRE-FC08: vehicle_trips assignment columns missing (expected assignment_status, assignment_subject_type, assignment_subject_id)';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'TripAssignmentStatus'
        ) OR NOT EXISTS (
            SELECT 1 FROM pg_type WHERE typname = 'TripAssignmentSubjectType'
        ) THEN
            RAISE EXCEPTION 'PRE-FC08: prerequisite enum types missing';
        END IF;
    END IF;

    -- PRE-FC09
    IF target_finished AND (has_vehicle_trip OR has_trip_driving_impact_pascal) THEN
        RAISE EXCEPTION 'PRE-FC09: target finished while PascalCase relations still present';
    END IF;

    -- PRE-ACT01
    IF NOT target_present
        AND has_vehicle_trips AND has_trip_driving_impact
        AND NOT has_vehicle_trip AND NOT has_trip_driving_impact_pascal THEN
        ALTER TABLE vehicle_trips RENAME TO "VehicleTrip";
        ALTER TABLE trip_driving_impact RENAME TO "TripDrivingImpact";
        RETURN;
    END IF;

    -- PRE-NOOP01
    IF target_finished
        AND has_vehicle_trips AND has_trip_driving_impact
        AND NOT has_vehicle_trip AND NOT has_trip_driving_impact_pascal THEN
        RETURN;
    END IF;

    RAISE EXCEPTION 'PRE-SHIM: no matching guard outcome';
END $$;

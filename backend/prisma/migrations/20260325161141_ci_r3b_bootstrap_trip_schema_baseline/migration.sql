-- CI-R3B bootstrap: minimal replay predecessor shape (ledger §4, U-BT-001..U-BT-019)
-- Idempotent: guarded enums/tables/indexes/constraints; vehicles must already exist.

-- ── Enums (10) ─────────────────────────────────────────────────────────────

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripAssignmentStatus') THEN
        CREATE TYPE "TripAssignmentStatus" AS ENUM (
            'ASSIGNED_DRIVER',
            'ASSIGNED_USER',
            'ASSIGNED_BOOKING_CUSTOMER',
            'PRIVATE_UNASSIGNED',
            'UNKNOWN_ASSIGNMENT'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripAssignmentSubjectType') THEN
        CREATE TYPE "TripAssignmentSubjectType" AS ENUM (
            'DRIVER',
            'USER',
            'BOOKING_CUSTOMER'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DrivingEventType') THEN
        CREATE TYPE "DrivingEventType" AS ENUM (
            'HARSH_BRAKING',
            'EXTREME_BRAKING',
            'HARSH_ACCELERATION',
            'HARSH_CORNERING',
            'SPEEDING',
            'IDLE_EXCESSIVE'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BehaviorEventCategory') THEN
        CREATE TYPE "BehaviorEventCategory" AS ENUM (
            'ACCELERATION',
            'BRAKING',
            'ABUSE'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'BehaviorEventClassification') THEN
        CREATE TYPE "BehaviorEventClassification" AS ENUM (
            'LIGHT',
            'MODERATE',
            'HARD',
            'EXTREME',
            'WARNING',
            'SEVERE',
            'CRITICAL'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripSource') THEN
        CREATE TYPE "TripSource" AS ENUM (
            'V2_LIVE',
            'REPAIRED'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripDetectionState') THEN
        CREATE TYPE "TripDetectionState" AS ENUM (
            'RESTING',
            'POSSIBLE_START',
            'ACTIVE_TRIP',
            'IDLE_WITHIN_TRIP',
            'POSSIBLE_END',
            'ENDED'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'TripTrackingRunType') THEN
        CREATE TYPE "TripTrackingRunType" AS ENUM (
            'POSSIBLE_START_VALIDATION',
            'ACTIVE_TRACKING',
            'POSSIBLE_END_CHECK',
            'END_VALIDATION',
            'FINALIZATION_CHECK'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VehicleDetectionProfile') THEN
        CREATE TYPE "VehicleDetectionProfile" AS ENUM (
            'ICE',
            'EV',
            'HYBRID',
            'UNKNOWN'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'DetectionConfidence') THEN
        CREATE TYPE "DetectionConfidence" AS ENUM (
            'LOW',
            'MEDIUM',
            'HIGH'
        );
    END IF;
END $$;

-- ── Tables (9) ─────────────────────────────────────────────────────────────

-- U-BT-001 — vehicle_trips
CREATE TABLE IF NOT EXISTS vehicle_trips (
    id text NOT NULL,
    vehicle_id text NOT NULL,
    dimo_segment_id text,
    driver_name text,
    assignment_status "TripAssignmentStatus",
    assignment_subject_type "TripAssignmentSubjectType",
    assignment_subject_id text,
    assigned_booking_id text,
    is_private_trip boolean NOT NULL DEFAULT false,
    start_time timestamp(3) without time zone NOT NULL,
    end_time timestamp(3) without time zone,
    start_latitude double precision,
    start_longitude double precision,
    end_latitude double precision,
    end_longitude double precision,
    distance_km double precision,
    duration_minutes double precision,
    avg_speed_kmh double precision,
    max_speed_kmh double precision,
    driving_score double precision,
    fuel_used_liters double precision,
    city_share_percent double precision,
    highway_share_percent double precision,
    country_share_percent double precision,
    speeding_sections_json jsonb,
    speeding_section_count integer,
    speeding_distance_m integer,
    speeding_duration_s integer,
    speeding_exposure_pct double precision,
    avg_over_speed_kmh double precision,
    harsh_brake_count integer NOT NULL DEFAULT 0,
    harsh_accel_count integer NOT NULL DEFAULT 0,
    harsh_corner_count integer NOT NULL DEFAULT 0,
    acceleration_event_count integer NOT NULL DEFAULT 0,
    braking_event_count integer NOT NULL DEFAULT 0,
    abuse_event_count integer NOT NULL DEFAULT 0,
    hard_acceleration_count integer NOT NULL DEFAULT 0,
    hard_braking_count integer NOT NULL DEFAULT 0,
    full_braking_count integer NOT NULL DEFAULT 0,
    total_acceleration_events integer NOT NULL DEFAULT 0,
    hard_acceleration_events integer NOT NULL DEFAULT 0,
    total_braking_events integer NOT NULL DEFAULT 0,
    hard_braking_events integer NOT NULL DEFAULT 0,
    full_braking_events integer NOT NULL DEFAULT 0,
    cornering_events integer NOT NULL DEFAULT 0,
    abuse_events integer NOT NULL DEFAULT 0,
    speeding_events integer NOT NULL DEFAULT 0,
    possible_impact_count integer NOT NULL DEFAULT 0,
    kickdown_count integer NOT NULL DEFAULT 0,
    cold_engine_abuse_count integer NOT NULL DEFAULT 0,
    long_idle_count integer NOT NULL DEFAULT 0,
    abuse_score double precision,
    behavior_summary_json jsonb,
    behavior_enriched_at timestamp(3) without time zone,
    detection_profile "VehicleDetectionProfile",
    start_detection_mode text,
    end_detection_mode text,
    start_confidence "DetectionConfidence",
    end_confidence "DetectionConfidence",
    possible_start_at timestamp(3) without time zone,
    possible_end_at timestamp(3) without time zone,
    first_activity_at timestamp(3) without time zone,
    last_activity_at timestamp(3) without time zone,
    route_tracking_started_at timestamp(3) without time zone,
    driving_tracking_started_at timestamp(3) without time zone,
    raw_detection_meta jsonb,
    trip_source "TripSource" NOT NULL DEFAULT 'V2_LIVE'::"TripSource",
    is_repaired boolean NOT NULL DEFAULT false,
    merge_parent_trip_id text,
    created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vehicle_trips_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_trips_vehicle_id_fkey') THEN
        ALTER TABLE vehicle_trips
            ADD CONSTRAINT vehicle_trips_vehicle_id_fkey
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS vehicle_trips_assigned_booking_id_idx ON vehicle_trips (assigned_booking_id);
CREATE INDEX IF NOT EXISTS vehicle_trips_assignment_status_is_private_trip_idx ON vehicle_trips (assignment_status, is_private_trip);
CREATE INDEX IF NOT EXISTS vehicle_trips_assignment_subject_type_assignment_subject_id_idx ON vehicle_trips (assignment_subject_type, assignment_subject_id);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_trips_dimo_segment_id_key ON vehicle_trips (dimo_segment_id);
CREATE INDEX IF NOT EXISTS vehicle_trips_start_time_idx ON vehicle_trips (start_time);
CREATE INDEX IF NOT EXISTS vehicle_trips_trip_source_idx ON vehicle_trips (trip_source);
CREATE INDEX IF NOT EXISTS vehicle_trips_vehicle_id_idx ON vehicle_trips (vehicle_id);

-- U-BT-002 — driving_events
CREATE TABLE IF NOT EXISTS driving_events (
    id text NOT NULL,
    vehicle_id text NOT NULL,
    event_type "DrivingEventType" NOT NULL,
    severity double precision NOT NULL DEFAULT 0,
    latitude double precision,
    longitude double precision,
    speed_kmh double precision,
    delta_kmh double precision,
    duration_ms integer,
    driver_name text,
    trip_id text,
    recorded_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT driving_events_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driving_events_trip_id_fkey') THEN
        ALTER TABLE driving_events
            ADD CONSTRAINT driving_events_trip_id_fkey
            FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id)
            ON UPDATE CASCADE ON DELETE SET;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'driving_events_vehicle_id_fkey') THEN
        ALTER TABLE driving_events
            ADD CONSTRAINT driving_events_vehicle_id_fkey
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS driving_events_vehicle_id_idx ON driving_events (vehicle_id);
CREATE INDEX IF NOT EXISTS driving_events_recorded_at_idx ON driving_events (recorded_at);
CREATE INDEX IF NOT EXISTS driving_events_event_type_idx ON driving_events (event_type);
CREATE INDEX IF NOT EXISTS driving_events_trip_id_idx ON driving_events (trip_id);

-- U-BT-003 — trip_behavior_events
CREATE TABLE IF NOT EXISTS trip_behavior_events (
    id text NOT NULL,
    organization_id text,
    vehicle_id text NOT NULL,
    trip_id text NOT NULL,
    event_category "BehaviorEventCategory" NOT NULL,
    event_type text NOT NULL,
    classification "BehaviorEventClassification" NOT NULL,
    started_at timestamp(3) without time zone NOT NULL,
    ended_at timestamp(3) without time zone,
    duration_ms integer,
    start_speed_kmh double precision,
    end_speed_kmh double precision,
    peak_value double precision,
    peak_value_unit text,
    peak_g double precision,
    max_throttle_pos double precision,
    max_engine_rpm double precision,
    max_coolant_temp double precision,
    metadata_json jsonb,
    created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT trip_behavior_events_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_behavior_events_trip_id_fkey') THEN
        ALTER TABLE trip_behavior_events
            ADD CONSTRAINT trip_behavior_events_trip_id_fkey
            FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_behavior_events_vehicle_id_fkey') THEN
        ALTER TABLE trip_behavior_events
            ADD CONSTRAINT trip_behavior_events_vehicle_id_fkey
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS trip_behavior_events_event_category_idx ON trip_behavior_events (event_category);
CREATE INDEX IF NOT EXISTS trip_behavior_events_started_at_idx ON trip_behavior_events (started_at);
CREATE INDEX IF NOT EXISTS trip_behavior_events_trip_id_idx ON trip_behavior_events (trip_id);
CREATE INDEX IF NOT EXISTS trip_behavior_events_vehicle_id_idx ON trip_behavior_events (vehicle_id);

-- U-BT-004 — vehicle_trip_waypoints
CREATE TABLE IF NOT EXISTS vehicle_trip_waypoints (
    id text NOT NULL,
    trip_id text NOT NULL,
    latitude double precision NOT NULL,
    longitude double precision NOT NULL,
    speed_kmh double precision,
    heading double precision,
    recorded_at timestamp(3) without time zone NOT NULL,
    CONSTRAINT vehicle_trip_waypoints_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_trip_waypoints_trip_id_fkey') THEN
        ALTER TABLE vehicle_trip_waypoints
            ADD CONSTRAINT vehicle_trip_waypoints_trip_id_fkey
            FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS vehicle_trip_waypoints_recorded_at_idx ON vehicle_trip_waypoints (recorded_at);
CREATE INDEX IF NOT EXISTS vehicle_trip_waypoints_trip_id_idx ON vehicle_trip_waypoints (trip_id);

-- U-BT-005 — vehicle_trip_tracking_runs
CREATE TABLE IF NOT EXISTS vehicle_trip_tracking_runs (
    id text NOT NULL,
    vehicle_id text NOT NULL,
    organization_id text,
    trip_id text,
    state_at_run "TripDetectionState" NOT NULL,
    run_type "TripTrackingRunType" NOT NULL,
    requested_from timestamp(3) without time zone,
    requested_to timestamp(3) without time zone,
    core_points_count integer,
    route_points_count integer,
    driving_points_count integer,
    result_state "TripDetectionState",
    result_summary jsonb,
    error_message text,
    duration_ms integer,
    created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vehicle_trip_tracking_runs_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_trip_tracking_runs_vehicle_id_fkey') THEN
        ALTER TABLE vehicle_trip_tracking_runs
            ADD CONSTRAINT vehicle_trip_tracking_runs_vehicle_id_fkey
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS vehicle_trip_tracking_runs_created_at_idx ON vehicle_trip_tracking_runs (created_at);
CREATE INDEX IF NOT EXISTS vehicle_trip_tracking_runs_run_type_idx ON vehicle_trip_tracking_runs (run_type);
CREATE INDEX IF NOT EXISTS vehicle_trip_tracking_runs_trip_id_idx ON vehicle_trip_tracking_runs (trip_id);
CREATE INDEX IF NOT EXISTS vehicle_trip_tracking_runs_vehicle_id_idx ON vehicle_trip_tracking_runs (vehicle_id);

-- U-BT-006 — trip_repairs
CREATE TABLE IF NOT EXISTS trip_repairs (
    id text NOT NULL,
    vehicle_id text NOT NULL,
    trip_id text,
    repair_type text NOT NULL,
    status text NOT NULL DEFAULT 'PROPOSED'::text,
    reason text NOT NULL,
    confidence text NOT NULL,
    window_from timestamp(3) without time zone NOT NULL,
    window_to timestamp(3) without time zone NOT NULL,
    detector_evidence jsonb,
    applied_at timestamp(3) without time zone,
    created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT trip_repairs_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_repairs_trip_id_fkey') THEN
        ALTER TABLE trip_repairs
            ADD CONSTRAINT trip_repairs_trip_id_fkey
            FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id)
            ON UPDATE CASCADE ON DELETE SET;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_repairs_vehicle_id_fkey') THEN
        ALTER TABLE trip_repairs
            ADD CONSTRAINT trip_repairs_vehicle_id_fkey
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS trip_repairs_created_at_idx ON trip_repairs (created_at);
CREATE INDEX IF NOT EXISTS trip_repairs_repair_type_idx ON trip_repairs (repair_type);
CREATE INDEX IF NOT EXISTS trip_repairs_status_idx ON trip_repairs (status);
CREATE INDEX IF NOT EXISTS trip_repairs_trip_id_idx ON trip_repairs (trip_id);
CREATE INDEX IF NOT EXISTS trip_repairs_vehicle_id_idx ON trip_repairs (vehicle_id);

-- U-BT-007 — trip_driving_impact
CREATE TABLE IF NOT EXISTS trip_driving_impact (
    id text NOT NULL,
    organization_id text,
    vehicle_id text NOT NULL,
    trip_id text NOT NULL,
    trip_started_at timestamp(3) without time zone NOT NULL,
    trip_ended_at timestamp(3) without time zone,
    distance_km double precision NOT NULL,
    city_share_pct double precision,
    highway_share_pct double precision,
    country_road_share_pct double precision,
    hard_accel_per_100km double precision,
    extreme_accel_per_100km double precision,
    hard_brake_per_100km double precision,
    extreme_brake_per_100km double precision,
    full_braking_per_100km double precision,
    kickdown_per_100km double precision,
    launch_like_per_100km double precision,
    brakes_per_100km double precision,
    stop_density double precision,
    high_speed_brake_share double precision,
    mean_brake_energy_per_km double precision,
    p95_negative_decel double precision,
    longitudinal_stress_score double precision,
    braking_stress_score double precision,
    stop_go_stress_score double precision,
    high_speed_stress_score double precision,
    thermal_brake_stress_score double precision,
    driving_style_score double precision,
    safety_score double precision,
    speeding_exposure_pct double precision,
    speeding_section_count integer,
    model_version text NOT NULL,
    source_summary_json jsonb,
    created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(3) without time zone NOT NULL,
    CONSTRAINT trip_driving_impact_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'trip_driving_impact_vehicle_id_fkey') THEN
        ALTER TABLE trip_driving_impact
            ADD CONSTRAINT trip_driving_impact_vehicle_id_fkey
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS trip_driving_impact_organization_id_vehicle_id_idx ON trip_driving_impact (organization_id, vehicle_id);
CREATE UNIQUE INDEX IF NOT EXISTS trip_driving_impact_trip_id_key ON trip_driving_impact (trip_id);
CREATE INDEX IF NOT EXISTS trip_driving_impact_vehicle_id_trip_started_at_idx ON trip_driving_impact (vehicle_id, trip_started_at);

-- U-BT-008 — vehicle_trip_detection_states
CREATE TABLE IF NOT EXISTS vehicle_trip_detection_states (
    id text NOT NULL,
    vehicle_id text NOT NULL,
    organization_id text,
    state "TripDetectionState" NOT NULL DEFAULT 'RESTING'::"TripDetectionState",
    detection_profile "VehicleDetectionProfile" NOT NULL DEFAULT 'UNKNOWN'::"VehicleDetectionProfile",
    active_trip_id text,
    possible_start_at timestamp(3) without time zone,
    possible_end_at timestamp(3) without time zone,
    last_activity_at timestamp(3) without time zone,
    last_snapshot_evidence_at timestamp(3) without time zone,
    last_core_processed_at timestamp(3) without time zone,
    last_route_processed_at timestamp(3) without time zone,
    last_driving_processed_at timestamp(3) without time zone,
    worker_locked_until timestamp(3) without time zone,
    worker_run_token text,
    start_detection_mode text,
    start_confidence "DetectionConfidence",
    end_detection_mode text,
    end_confidence "DetectionConfidence",
    last_evidence_summary jsonb,
    start_odometer_km double precision,
    start_fuel_level double precision,
    start_ev_soc double precision,
    last_meaningful_movement_at timestamp(3) without time zone,
    end_validation_attempts integer NOT NULL DEFAULT 0,
    cusum_validated_at timestamp(3) without time zone,
    cusum_segment_start timestamp(3) without time zone,
    cusum_segment_end timestamp(3) without time zone,
    created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp(3) without time zone NOT NULL,
    CONSTRAINT vehicle_trip_detection_states_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'vehicle_trip_detection_states_vehicle_id_fkey') THEN
        ALTER TABLE vehicle_trip_detection_states
            ADD CONSTRAINT vehicle_trip_detection_states_vehicle_id_fkey
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS vehicle_trip_detection_states_organization_id_idx ON vehicle_trip_detection_states (organization_id);
CREATE INDEX IF NOT EXISTS vehicle_trip_detection_states_state_idx ON vehicle_trip_detection_states (state);
CREATE UNIQUE INDEX IF NOT EXISTS vehicle_trip_detection_states_vehicle_id_key ON vehicle_trip_detection_states (vehicle_id);
CREATE INDEX IF NOT EXISTS vehicle_trip_detection_states_worker_locked_until_idx ON vehicle_trip_detection_states (worker_locked_until);

-- U-BT-009 — brake_trip_metrics
CREATE TABLE IF NOT EXISTS brake_trip_metrics (
    id text NOT NULL,
    vehicle_id text NOT NULL,
    trip_id text,
    brake_energy_kj double precision,
    hard_brake_count integer NOT NULL DEFAULT 0,
    avg_deceleration_ms2 double precision,
    max_deceleration_ms2 double precision,
    brake_duration_sec integer,
    distance_km double precision,
    recorded_at timestamp(3) without time zone NOT NULL,
    created_at timestamp(3) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT brake_trip_metrics_pkey PRIMARY KEY (id)
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'brake_trip_metrics_vehicle_id_fkey') THEN
        ALTER TABLE brake_trip_metrics
            ADD CONSTRAINT brake_trip_metrics_vehicle_id_fkey
            FOREIGN KEY (vehicle_id) REFERENCES vehicles(id)
            ON UPDATE CASCADE ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS brake_trip_metrics_recorded_at_idx ON brake_trip_metrics (recorded_at);
CREATE INDEX IF NOT EXISTS brake_trip_metrics_vehicle_id_idx ON brake_trip_metrics (vehicle_id);

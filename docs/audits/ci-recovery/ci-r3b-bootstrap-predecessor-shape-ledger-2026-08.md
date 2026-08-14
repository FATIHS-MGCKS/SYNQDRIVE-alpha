# CI-R3B — Bootstrap minimal replay predecessor ledger (CI-R3B.0.2)

**Phase:** CI-R3B.0.2 / CI-R3B.0.2.1 — complete replay-safe predecessor and final-parity authority
**Branch:** `fix/ci-r3b-vehicle-trips-migration-replay-2026-08`
**Scope:** documentation authority only — no migrations, schema, runtime or production changes

This ledger defines **MINIMAL_REPLAY_PREDECESSOR_SHAPE** (exact schema immediately after insertion
point `20260325161141` and before `20260325161142`) and **FINAL_ACCEPTED_SHAPE** (accepted
CI-R3A.7.1 production catalog after full committed replay **plus** authorized post-replay
reconciliation).

Historical predecessor terminology from CI-R3B.0.1 is **SUPERSEDED BY CI-R3B.0.2**.

## 0. Authority model

| Field | Value |
|-------|-------|
| `BOOTSTRAP_INSERTION_POINT` | `20260325161141` |
| `BOOTSTRAP_SHAPE_AUTHORITY` | `MINIMAL_REPLAY_PREDECESSOR_SHAPE` (this ledger §4) |
| `FINAL_SHAPE_AUTHORITY` | `ACCEPTED_CI_R3A71_PRODUCTION_JSON` + post-replay reconciliation (§6) |
| `BOOTSTRAP_PREDECESSOR_EQUALS_FINAL_FOR_ALL_OBJECTS` | **NO** |
| `EARLY_BOOTSTRAP_FINAL_SHAPE_EXECUTABLE` | **NO** |
| `FINAL_PARITY_EXCEPTION_COUNT` | **0** |
| `POST_REPLAY_RECONCILIATION_REQUIRED` | **YES** |
| `POST_REPLAY_RECONCILIATION_IMPLEMENTED` | **NO** |

## 1. Object inventory accounting

| Counter | Value |
|---------|-------|
| `BOOTSTRAP_TABLE_OBJECT_COUNT` | **9** |
| `BOOTSTRAP_ENUM_OBJECT_COUNT` | **10** |
| `BOOTSTRAP_TOTAL_OBJECT_COUNT` | **19** |
| `BOOTSTRAP_REPLAY_REQUIRED_COUNT` | **11** |
| `BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED_COUNT` | **2** |
| `SCHEMA_PARITY_ONLY_COUNT` | **6** |
| `BOOTSTRAP_OBJECT_LEDGER_ROW_COUNT` | **19** |

Executable classification (11 + 2 + 6 = 19) is separate from physical kind counts (9 tables + 10 enums = 19).

## 2. CI-R3B.0.1 defect baseline (**SUPERSEDED BY CI-R3B.0.2**)

| Defect | CI-R3B.0.1 state | CI-R3B.0.2 correction |
|--------|------------------|------------------------|
| Future type reference | `trip_assignment` referenced `DrivingEventTripAssignment` | Removed; `DRIVING_EVENTS_FUTURE_TYPE_REFERENCE_COUNT` = **0** |
| Invalid predecessor indexes | Indexes on omitted columns listed | Removed; `BOOTSTRAP_INDEX_REFERENCES_MISSING_COLUMN_COUNT` = **0** |
| Empty index definitions | 53 `btree ()` entries | Full definitions from accepted JSON `definition` field |
| Index count mismatch | driving_events claimed 7, listed 10 | Counts match enumerations |
| Incomplete downstream matrix | Missing DROP TYPE / CREATE UNIQUE INDEX rows | Exhaustive matrix §3 |
| Final default mismatch | `trip_status` DEFAULT COMPLETED vs ONGOING | Post-replay reconciliation §6 |

## 3. Downstream DDL matrix (post-`20260325161141`)

`DOWNSTREAM_DDL_STATEMENT_COUNT` = **128**; `DOWNSTREAM_DDL_MATRIX_ROW_COUNT` = **128**.

| # | Migration | Operation | Object | Element | Guarded | Predecessor precondition | Bootstrap treatment | Resulting state |
|---|-----------|-----------|--------|---------|---------|--------------------------|---------------------|-----------------|
| 1 | `20260325161142_trip_architecture_refactor` | CREATE TYPE | `TripStatus` | `TripStatus` | NO | type `TripStatus` absent | Must be absent at minimal bootstrap predecessor | Evolves toward final accepted shape |
| 2 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `trip_status` | NO | table `vehicle_trips` present; column `trip_status` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 3 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `avg_consumption_l_per_100km` | NO | table `vehicle_trips` present; column `avg_consumption_l_per_100km` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 4 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `fuel_confidence` | NO | table `vehicle_trips` present; column `fuel_confidence` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 5 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `energy_used_kwh` | NO | table `vehicle_trips` present; column `energy_used_kwh` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 6 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `avg_consumption_kwh_per_100km` | NO | table `vehicle_trips` present; column `avg_consumption_kwh_per_100km` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 7 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `energy_confidence` | NO | table `vehicle_trips` present; column `energy_confidence` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 8 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `outside_temperature_start_c` | NO | table `vehicle_trips` present; column `outside_temperature_start_c` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 9 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `engine_temp_start_c` | NO | table `vehicle_trips` present; column `engine_temp_start_c` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 10 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `engine_temp_end_c` | NO | table `vehicle_trips` present; column `engine_temp_end_c` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 11 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `avg_rpm` | NO | table `vehicle_trips` present; column `avg_rpm` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 12 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `avg_throttle_position` | NO | table `vehicle_trips` present; column `avg_throttle_position` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 13 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `avg_engine_load` | NO | table `vehicle_trips` present; column `avg_engine_load` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 14 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `gap_ended` | NO | table `vehicle_trips` present; column `gap_ended` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 15 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `enriched_at` | NO | table `vehicle_trips` present; column `enriched_at` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 16 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `speeding_percent` | YES | table `vehicle_trips` present; column `speeding_percent` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 17 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `max_over_speed_kmh` | YES | table `vehicle_trips` present; column `max_over_speed_kmh` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 18 | `20260325161142_trip_architecture_refactor` | ADD COLUMN | `vehicle_trips` | `speeding_segments` | YES | table `vehicle_trips` present; column `speeding_segments` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 19 | `20260325161142_trip_architecture_refactor` | DROP COLUMN | `vehicle_trips` | `dimo_mechanism` | YES | table `vehicle_trips` present; column may be present or absent (IF EXISTS) | Column may exist in predecessor; downstream removes if present | Evolves toward final accepted shape |
| 20 | `20260325161142_trip_architecture_refactor` | DROP COLUMN | `vehicle_trips` | `road_surface_type` | YES | table `vehicle_trips` present; column may be present or absent (IF EXISTS) | Column may exist in predecessor; downstream removes if present | Evolves toward final accepted shape |
| 21 | `20260325161142_trip_architecture_refactor` | DROP COLUMN | `vehicle_trips` | `road_surface_score` | YES | table `vehicle_trips` present; column may be present or absent (IF EXISTS) | Column may exist in predecessor; downstream removes if present | Evolves toward final accepted shape |
| 22 | `20260325161142_trip_architecture_refactor` | DROP COLUMN | `vehicle_trips` | `climate_factor` | YES | table `vehicle_trips` present; column may be present or absent (IF EXISTS) | Column may exist in predecessor; downstream removes if present | Evolves toward final accepted shape |
| 23 | `20260325161142_trip_architecture_refactor` | DROP COLUMN | `vehicle_trips` | `tire_wear_contrib_km` | YES | table `vehicle_trips` present; column may be present or absent (IF EXISTS) | Column may exist in predecessor; downstream removes if present | Evolves toward final accepted shape |
| 24 | `20260325161142_trip_architecture_refactor` | DROP COLUMN | `vehicle_trips` | `dtc_codes_found` | YES | table `vehicle_trips` present; column may be present or absent (IF EXISTS) | Column may exist in predecessor; downstream removes if present | Evolves toward final accepted shape |
| 25 | `20260325161142_trip_architecture_refactor` | DROP COLUMN | `vehicle_trips` | `avg_temperature_c` | YES | table `vehicle_trips` present; column may be present or absent (IF EXISTS) | Column may exist in predecessor; downstream removes if present | Evolves toward final accepted shape |
| 26 | `20260325161142_trip_architecture_refactor` | CREATE INDEX | `vehicle_trips` | `vehicle_trips_trip_status_idx` | NO | table `vehicle_trips` and indexed columns present; index `vehicle_trips_trip_status_idx` absent | Minimal predecessor must omit index (unguarded downstream create) | Evolves toward final accepted shape |
| 27 | `20260331000000_v3_hardware_type` | CREATE TYPE | `DrivingEventSource` | `DrivingEventSource` | NO | type `DrivingEventSource` absent | Must be absent at minimal bootstrap predecessor | Evolves toward final accepted shape |
| 28 | `20260331000000_v3_hardware_type` | ADD COLUMN | `driving_events` | `organization_id` | NO | table `driving_events` present; column `organization_id` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 29 | `20260331000000_v3_hardware_type` | ADD COLUMN | `driving_events` | `source` | NO | table `driving_events` present; column `source` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 30 | `20260331000000_v3_hardware_type` | ADD COLUMN | `driving_events` | `metadata_json` | NO | table `driving_events` present; column `metadata_json` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 31 | `20260331000000_v3_hardware_type` | CREATE INDEX | `driving_events` | `driving_events_source_idx` | NO | table `driving_events` and indexed columns present; index `driving_events_source_idx` absent | Minimal predecessor must omit index (unguarded downstream create) | Evolves toward final accepted shape |
| 32 | `20260410000000_add_enrichment_status_fields` | ADD COLUMN | `vehicle_trips` | `behavior_enrichment_status` | YES | table `vehicle_trips` present; column `behavior_enrichment_status` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 33 | `20260410000000_add_enrichment_status_fields` | ADD COLUMN | `vehicle_trips` | `behavior_enrichment_attempts` | YES | table `vehicle_trips` present; column `behavior_enrichment_attempts` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 34 | `20260410000000_add_enrichment_status_fields` | ADD COLUMN | `vehicle_trips` | `behavior_enrichment_error` | YES | table `vehicle_trips` present; column `behavior_enrichment_error` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 35 | `20260410000000_add_enrichment_status_fields` | ADD COLUMN | `vehicle_trips` | `behavior_enrichment_started_at` | YES | table `vehicle_trips` present; column `behavior_enrichment_started_at` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 36 | `20260410000000_add_enrichment_status_fields` | ADD COLUMN | `vehicle_trips` | `driving_impact_computed_at` | YES | table `vehicle_trips` present; column `driving_impact_computed_at` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 37 | `20260410000000_add_enrichment_status_fields` | CREATE INDEX | `vehicle_trips` | `vehicle_trips_behavior_enrichment_status_idx` | YES | table `vehicle_trips` and indexed columns present; index `vehicle_trips_behavior_enrichment_status_idx` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 38 | `20260413230000_add_composite_indexes_batch_c` | CREATE INDEX | `vehicle_trips` | `vehicle_trips_vehicle_id_start_time_idx` | YES | table `vehicle_trips` and indexed columns present; index `vehicle_trips_vehicle_id_start_time_idx` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 39 | `20260413230000_add_composite_indexes_batch_c` | CREATE INDEX | `driving_events` | `driving_events_vehicle_id_recorded_at_idx` | YES | table `driving_events` and indexed columns present; index `driving_events_vehicle_id_recorded_at_idx` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 40 | `20260413230000_add_composite_indexes_batch_c` | CREATE INDEX | `driving_events` | `driving_events_trip_id_event_type_idx` | YES | table `driving_events` and indexed columns present; index `driving_events_trip_id_event_type_idx` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 41 | `20260413230000_add_composite_indexes_batch_c` | CREATE INDEX | `trip_behavior_events` | `trip_behavior_events_trip_id_event_category_idx` | YES | table `trip_behavior_events` and indexed columns present; index `trip_behavior_events_trip_id_event_category_idx` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 42 | `20260425000000_retire_user_assignment_and_speeding_severity` | UPDATE | `vehicle_trips` | `row data` | NO | table `vehicle_trips` present; referenced columns present | Table and columns present at execution time; not a bootstrap-create element | Evolves toward final accepted shape |
| 43 | `20260425000000_retire_user_assignment_and_speeding_severity` | ALTER TYPE RENAME | `TripAssignmentStatus` | `TripAssignmentStatus_old` | NO | source type `TripAssignmentStatus` present; destination `TripAssignmentStatus_old` absent | Bootstrap enum present with full predecessor label set including retired labels | Evolves toward final accepted shape |
| 44 | `20260425000000_retire_user_assignment_and_speeding_severity` | CREATE TYPE | `TripAssignmentStatus` | `TripAssignmentStatus` | NO | type `TripAssignmentStatus` absent | Downstream evolution toward final accepted shape | Evolves toward final accepted shape |
| 45 | `20260425000000_retire_user_assignment_and_speeding_severity` | ALTER COLUMN TYPE | `vehicle_trips` | `assignment_status` | NO | table `vehicle_trips` present; column `assignment_status` and destination type present | Downstream evolution toward final accepted shape | Evolves toward final accepted shape |
| 46 | `20260425000000_retire_user_assignment_and_speeding_severity` | DROP TYPE | `TripAssignmentStatus_old` | `TripAssignmentStatus_old` | NO | type `TripAssignmentStatus_old` present; no remaining dependencies | Renamed predecessor type present from prior RENAME in same migration | Evolves toward final accepted shape |
| 47 | `20260425000000_retire_user_assignment_and_speeding_severity` | UPDATE | `vehicle_trips` | `row data` | NO | table `vehicle_trips` present; referenced columns present | Table and columns present at execution time; not a bootstrap-create element | Evolves toward final accepted shape |
| 48 | `20260425000000_retire_user_assignment_and_speeding_severity` | ALTER TYPE RENAME | `TripAssignmentSubjectType` | `TripAssignmentSubjectType_old` | NO | source type `TripAssignmentSubjectType` present; destination `TripAssignmentSubjectType_old` absent | Bootstrap enum present with full predecessor label set including retired labels | Evolves toward final accepted shape |
| 49 | `20260425000000_retire_user_assignment_and_speeding_severity` | CREATE TYPE | `TripAssignmentSubjectType` | `TripAssignmentSubjectType` | NO | type `TripAssignmentSubjectType` absent | Downstream evolution toward final accepted shape | Evolves toward final accepted shape |
| 50 | `20260425000000_retire_user_assignment_and_speeding_severity` | ALTER COLUMN TYPE | `vehicle_trips` | `assignment_subject_type` | NO | table `vehicle_trips` present; column `assignment_subject_type` and destination type present | Downstream evolution toward final accepted shape | Evolves toward final accepted shape |
| 51 | `20260425000000_retire_user_assignment_and_speeding_severity` | DROP TYPE | `TripAssignmentSubjectType_old` | `TripAssignmentSubjectType_old` | NO | type `TripAssignmentSubjectType_old` present; no remaining dependencies | Renamed predecessor type present from prior RENAME in same migration | Evolves toward final accepted shape |
| 52 | `20260425000000_retire_user_assignment_and_speeding_severity` | DROP COLUMN | `trip_driving_impact` | `speeding_severity_score` | YES | table `trip_driving_impact` present; column may be present or absent (IF EXISTS) | Column may exist in predecessor; downstream removes if present | Evolves toward final accepted shape |
| 53 | `20260609000000_autovacuum_tuning` | ALTER TABLE SET | `vehicle_trip_tracking_runs` | `storage parameters` | NO | table `vehicle_trip_tracking_runs` present | Table present; SET is storage-only; no bootstrap shape change required | Evolves toward final accepted shape |
| 54 | `20260609000000_autovacuum_tuning` | ALTER TABLE SET | `trip_repairs` | `storage parameters` | NO | table `trip_repairs` present | Table present; SET is storage-only; no bootstrap shape change required | Evolves toward final accepted shape |
| 55 | `20260609000000_autovacuum_tuning` | ALTER TABLE SET | `vehicle_trip_waypoints` | `storage parameters` | NO | table `vehicle_trip_waypoints` present | Table present; SET is storage-only; no bootstrap shape change required | Evolves toward final accepted shape |
| 56 | `20260705140000_trip_analysis_status` | ADD COLUMN | `vehicle_trips` | `trip_analysis_status` | NO | table `vehicle_trips` present; column `trip_analysis_status` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 57 | `20260705140000_trip_analysis_status` | ADD COLUMN | `vehicle_trips` | `analysis_queued_at` | NO | table `vehicle_trips` present; column `analysis_queued_at` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 58 | `20260705140000_trip_analysis_status` | ADD COLUMN | `vehicle_trips` | `analysis_started_at` | NO | table `vehicle_trips` present; column `analysis_started_at` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 59 | `20260705140000_trip_analysis_status` | ADD COLUMN | `vehicle_trips` | `analysis_partial_at` | NO | table `vehicle_trips` present; column `analysis_partial_at` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 60 | `20260705140000_trip_analysis_status` | ADD COLUMN | `vehicle_trips` | `analysis_completed_at` | NO | table `vehicle_trips` present; column `analysis_completed_at` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 61 | `20260705140000_trip_analysis_status` | ADD COLUMN | `vehicle_trips` | `analysis_failed_at` | NO | table `vehicle_trips` present; column `analysis_failed_at` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 62 | `20260705140000_trip_analysis_status` | ADD COLUMN | `vehicle_trips` | `analysis_failed_reason` | NO | table `vehicle_trips` present; column `analysis_failed_reason` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 63 | `20260705140000_trip_analysis_status` | ADD COLUMN | `vehicle_trips` | `analysis_latency_ms` | NO | table `vehicle_trips` present; column `analysis_latency_ms` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 64 | `20260705140000_trip_analysis_status` | ADD COLUMN | `vehicle_trips` | `analysis_stages_json` | NO | table `vehicle_trips` present; column `analysis_stages_json` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 65 | `20260705140000_trip_analysis_status` | CREATE INDEX | `vehicle_trips` | `vehicle_trips_trip_analysis_status_idx` | NO | table `vehicle_trips` and indexed columns present; index `vehicle_trips_trip_analysis_status_idx` absent | Minimal predecessor must omit index (unguarded downstream create) | Evolves toward final accepted shape |
| 66 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `trip_analysis_status` | YES | table `vehicle_trips` present; column `trip_analysis_status` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 67 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `analysis_queued_at` | YES | table `vehicle_trips` present; column `analysis_queued_at` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 68 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `analysis_started_at` | YES | table `vehicle_trips` present; column `analysis_started_at` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 69 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `analysis_partial_at` | YES | table `vehicle_trips` present; column `analysis_partial_at` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 70 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `analysis_completed_at` | YES | table `vehicle_trips` present; column `analysis_completed_at` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 71 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `analysis_failed_at` | YES | table `vehicle_trips` present; column `analysis_failed_at` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 72 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `analysis_failed_reason` | YES | table `vehicle_trips` present; column `analysis_failed_reason` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 73 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `analysis_latency_ms` | YES | table `vehicle_trips` present; column `analysis_latency_ms` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 74 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `analysis_stages_json` | YES | table `vehicle_trips` present; column `analysis_stages_json` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 75 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `quality_status` | YES | table `vehicle_trips` present; column `quality_status` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 76 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `behavior_summary_status` | YES | table `vehicle_trips` present; column `behavior_summary_status` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 77 | `20260705200000_trip_analysis_status_guard` | ADD COLUMN | `vehicle_trips` | `driving_impact_status` | YES | table `vehicle_trips` present; column `driving_impact_status` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 78 | `20260705200000_trip_analysis_status_guard` | CREATE INDEX | `vehicle_trips` | `vehicle_trips_trip_analysis_status_idx` | YES | table `vehicle_trips` and indexed columns present; index `vehicle_trips_trip_analysis_status_idx` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 79 | `20260708044000_trip_booking_link_source` | CREATE TYPE | `TripBookingLinkSource` | `TripBookingLinkSource` | NO | type `TripBookingLinkSource` absent | Must be absent at minimal bootstrap predecessor | Evolves toward final accepted shape |
| 80 | `20260708044000_trip_booking_link_source` | ADD COLUMN | `vehicle_trips` | `booking_link_source` | NO | table `vehicle_trips` present; column `booking_link_source` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 81 | `20260708044000_trip_booking_link_source` | UPDATE | `vehicle_trips` | `row data` | NO | table `vehicle_trips` present; referenced columns present | Table and columns present at execution time; not a bootstrap-create element | Evolves toward final accepted shape |
| 82 | `20260716220000_tire_trip_usage_attribution` | ADD COLUMN | `vehicle_trips` | `tire_usage_attribution_status` | YES | table `vehicle_trips` present; column `tire_usage_attribution_status` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 83 | `20260716220000_tire_trip_usage_attribution` | ADD COLUMN | `vehicle_trips` | `tire_usage_processed_at` | YES | table `vehicle_trips` present; column `tire_usage_processed_at` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 84 | `20260716220000_tire_trip_usage_attribution` | CREATE INDEX | `vehicle_trips` | `vehicle_trips_tire_usage_attribution_status_idx` | YES | table `vehicle_trips` and indexed columns present; index `vehicle_trips_tire_usage_attribution_status_idx` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 85 | `20260716230000_driving_event_type_native_mapper` | ALTER TYPE ADD VALUE | `DrivingEventType` | `UNMAPPED_PROVIDER_EVENT` | YES | type `DrivingEventType` present | Bootstrap enum present with prior label set; ADD VALUE extends toward final | Evolves toward final accepted shape |
| 86 | `20260716230000_driving_event_type_native_mapper` | ALTER TYPE ADD VALUE | `DrivingEventType` | `SAFETY_COLLISION` | YES | type `DrivingEventType` present | Bootstrap enum present with prior label set; ADD VALUE extends toward final | Evolves toward final accepted shape |
| 87 | `20260716240000_driving_event_native_identity` | CREATE TYPE | `DrivingEventTripAssignment` | `DrivingEventTripAssignment` | NO | type `DrivingEventTripAssignment` absent | Must be absent at minimal bootstrap predecessor | Evolves toward final accepted shape |
| 88 | `20260716240000_driving_event_native_identity` | ADD COLUMN | `driving_events` | `provider` | YES | table `driving_events` present; column `provider` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 89 | `20260716240000_driving_event_native_identity` | ADD COLUMN | `driving_events` | `provider_event_name` | YES | table `driving_events` present; column `provider_event_name` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 90 | `20260716240000_driving_event_native_identity` | ADD COLUMN | `driving_events` | `provider_source_id` | YES | table `driving_events` present; column `provider_source_id` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 91 | `20260716240000_driving_event_native_identity` | ADD COLUMN | `driving_events` | `provider_fingerprint` | YES | table `driving_events` present; column `provider_fingerprint` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 92 | `20260716240000_driving_event_native_identity` | ADD COLUMN | `driving_events` | `trip_assignment` | YES | table `driving_events` present; column `trip_assignment` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 93 | `20260716240000_driving_event_native_identity` | CREATE UNIQUE INDEX | `driving_events` | `driving_events_org_provider_fingerprint` | YES | table `driving_events` and indexed columns present; index `driving_events_org_provider_fingerprint` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 94 | `20260716240000_driving_event_native_identity` | CREATE INDEX | `driving_events` | `driving_events_vehicle_id_trip_assignment_idx` | YES | table `driving_events` and indexed columns present; index `driving_events_vehicle_id_trip_assignment_idx` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 95 | `20260716240000_driving_event_native_identity` | CREATE INDEX | `driving_events` | `driving_events_organization_id_vehicle_id_recorded_at_idx` | YES | table `driving_events` and indexed columns present; index `driving_events_organization_id_vehicle_id_recorded_at_idx` absent; IF NOT EXISTS no-op | Minimal predecessor omits index | Evolves toward final accepted shape |
| 96 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `primary_source` | YES | table `trip_driving_impact` present; column `primary_source` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 97 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `measured_share` | YES | table `trip_driving_impact` present; column `measured_share` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 98 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `provider_classified_share` | YES | table `trip_driving_impact` present; column `provider_classified_share` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 99 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `reconstructed_share` | YES | table `trip_driving_impact` present; column `reconstructed_share` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 100 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `estimated_proxy_share` | YES | table `trip_driving_impact` present; column `estimated_proxy_share` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 101 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `context_only_share` | YES | table `trip_driving_impact` present; column `context_only_share` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 102 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `native_event_count` | YES | table `trip_driving_impact` present; column `native_event_count` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 103 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `hf_event_count` | YES | table `trip_driving_impact` present; column `hf_event_count` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 104 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `measurement_coverage` | YES | table `trip_driving_impact` present; column `measurement_coverage` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 105 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `hardware_profile` | YES | table `trip_driving_impact` present; column `hardware_profile` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 106 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `capability_version` | YES | table `trip_driving_impact` present; column `capability_version` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 107 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `health_eligibility` | YES | table `trip_driving_impact` present; column `health_eligibility` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 108 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `provenance_maturity` | YES | table `trip_driving_impact` present; column `provenance_maturity` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 109 | `20260716250000_driving_impact_provenance` | ADD COLUMN | `trip_driving_impact` | `provenance_version` | YES | table `trip_driving_impact` present; column `provenance_version` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 110 | `20260716260000_driving_impact_braking_provenance` | ADD COLUMN | `trip_driving_impact` | `p95_negative_decel_measured` | YES | table `trip_driving_impact` present; column `p95_negative_decel_measured` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 111 | `20260716260000_driving_impact_braking_provenance` | ADD COLUMN | `trip_driving_impact` | `p95_negative_decel_proxy` | YES | table `trip_driving_impact` present; column `p95_negative_decel_proxy` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 112 | `20260716260000_driving_impact_braking_provenance` | ADD COLUMN | `trip_driving_impact` | `mean_brake_energy_proxy_per_km` | YES | table `trip_driving_impact` present; column `mean_brake_energy_proxy_per_km` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 113 | `20260716270000_driving_impact_load_components` | ADD COLUMN | `trip_driving_impact` | `load_components_json` | YES | table `trip_driving_impact` present; column `load_components_json` absent; referenced types available; guarded no-op if present | Minimal predecessor omits column | Evolves toward final accepted shape |
| 114 | `20260716310000_driving_attribution_roles` | ADD COLUMN | `vehicle_trips` | `booking_customer_id` | NO | table `vehicle_trips` present; column `booking_customer_id` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 115 | `20260716310000_driving_attribution_roles` | ADD COLUMN | `vehicle_trips` | `assigned_driver_id` | NO | table `vehicle_trips` present; column `assigned_driver_id` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 116 | `20260716310000_driving_attribution_roles` | ADD COLUMN | `vehicle_trips` | `actual_driver_id` | NO | table `vehicle_trips` present; column `actual_driver_id` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 117 | `20260717180000_trip_driving_impact_authoritative_coverage` | CREATE TYPE | `TripDrivingImpactAnalysisStatus` | `TripDrivingImpactAnalysisStatus` | NO | type `TripDrivingImpactAnalysisStatus` absent | Must be absent at minimal bootstrap predecessor | Evolves toward final accepted shape |
| 118 | `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | `trip_driving_impact` | `authoritative_distance_km` | NO | table `trip_driving_impact` present; column `authoritative_distance_km` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 119 | `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | `trip_driving_impact` | `source_version` | NO | table `trip_driving_impact` present; column `source_version` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 120 | `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | `trip_driving_impact` | `source_fingerprint` | NO | table `trip_driving_impact` present; column `source_fingerprint` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 121 | `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | `trip_driving_impact` | `analysis_status` | NO | table `trip_driving_impact` present; column `analysis_status` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 122 | `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | `trip_driving_impact` | `calculated_at` | NO | table `trip_driving_impact` present; column `calculated_at` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 123 | `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | `trip_driving_impact` | `source_completeness` | NO | table `trip_driving_impact` present; column `source_completeness` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 124 | `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | `trip_driving_impact` | `trip_distance_km_at_source` | NO | table `trip_driving_impact` present; column `trip_distance_km_at_source` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 125 | `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | `trip_driving_impact` | `distance_discrepancy_km` | NO | table `trip_driving_impact` present; column `distance_discrepancy_km` absent; referenced types available | Minimal predecessor must omit column (unguarded downstream add) | Evolves toward final accepted shape |
| 126 | `20260717180000_trip_driving_impact_authoritative_coverage` | UPDATE | `trip_driving_impact` | `row data` | NO | table `trip_driving_impact` present; referenced columns present | Table and columns present at execution time; not a bootstrap-create element | Evolves toward final accepted shape |
| 127 | `20260717180000_trip_driving_impact_authoritative_coverage` | CREATE INDEX | `trip_driving_impact` | `trip_driving_impact_analysis_status_idx` | NO | table `trip_driving_impact` and indexed columns present; index `trip_driving_impact_analysis_status_idx` absent | Minimal predecessor must omit index (unguarded downstream create) | Evolves toward final accepted shape |
| 128 | `20260717180000_trip_driving_impact_authoritative_coverage` | CREATE INDEX | `trip_driving_impact` | `trip_driving_impact_source_fingerprint_idx` | NO | table `trip_driving_impact` and indexed columns present; index `trip_driving_impact_source_fingerprint_idx` absent | Minimal predecessor must omit index (unguarded downstream create) | Evolves toward final accepted shape |

| Counter | Value |
|---------|-------|
| `UNCLASSIFIED_DOWNSTREAM_EVOLUTION_DDL_COUNT` | **0** |
| `MISCLASSIFIED_DOWNSTREAM_PRECONDITION_COUNT` | **0** |
| `DUPLICATE_DOWNSTREAM_DDL_MATRIX_ROW_COUNT` | **0** |

## 4. Nineteen-object minimal replay predecessor ledger

### U-BT-001 — `vehicle_trips`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-001` |
| 2 | Object name | `vehicle_trips` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260325161142_trip_architecture_refactor` |
| 6 | Every downstream migration that changes it | `20260325161142_trip_architecture_refactor`, `20260410000000_add_enrichment_status_fields`, `20260413230000_add_composite_indexes_batch_c`, `20260425000000_retire_user_assignment_and_speeding_severity`, `20260705140000_trip_analysis_status`, `20260705200000_trip_analysis_status_guard`, `20260708044000_trip_booking_link_source`, `20260716220000_tire_trip_usage_attribution`, `20260716310000_driving_attribution_roles` |
| 7 | Bootstrap-time columns | **70** columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `vehicle_trips_pkey` PRIMARY KEY (id) |
| 12 | Foreign keys | `vehicle_trips_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | **8** indexes (enumerated below) |
| 16 | Dependency order | Create enums ['DetectionConfidence', 'TripAssignmentStatus', 'TripAssignmentSubjectType', 'TripSource', 'VehicleDetectionProfile'] before table when referenced; table must exist before `20260325161142_trip_architecture_refactor` |
| 17 | Deliberately omitted (introduced later) | columns: `actual_driver_id`, `analysis_completed_at`, `analysis_failed_at`, `analysis_failed_reason`, `analysis_latency_ms`, `analysis_partial_at`, `analysis_queued_at`, `analysis_stages_json`, `analysis_started_at`, `assigned_driver_id`, `avg_consumption_kwh_per_100km`, `avg_consumption_l_per_100km`, `avg_engine_load`, `avg_rpm`, `avg_throttle_position`, `behavior_enrichment_attempts`, `behavior_enrichment_error`, `behavior_enrichment_started_at`, `behavior_enrichment_status`, `behavior_summary_status`, `booking_customer_id`, `booking_link_source`, `driving_impact_computed_at`, `driving_impact_status`, `energy_confidence`, `energy_used_kwh`, `engine_temp_end_c`, `engine_temp_start_c`, `enriched_at`, `fuel_confidence`, `gap_ended`, `max_over_speed_kmh`, `outside_temperature_start_c`, `quality_status`, `speeding_percent`, `speeding_segments`, `tire_usage_attribution_status`, `tire_usage_processed_at`, `trip_analysis_status`, `trip_status`; indexes: `vehicle_trips_behavior_enrichment_status_idx`, `vehicle_trips_tire_usage_attribution_status_idx`, `vehicle_trips_trip_analysis_status_idx`, `vehicle_trips_trip_status_idx`, `vehicle_trips_vehicle_id_start_time_idx` |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `vehicle_id` | text | NOT NULL |
| 3 | `dimo_segment_id` | text | NULL |
| 4 | `driver_name` | text | NULL |
| 5 | `assignment_status` | "TripAssignmentStatus" | NULL |
| 6 | `assignment_subject_type` | "TripAssignmentSubjectType" | NULL |
| 7 | `assignment_subject_id` | text | NULL |
| 8 | `assigned_booking_id` | text | NULL |
| 9 | `is_private_trip` | boolean | NOT NULL DEFAULT false |
| 10 | `start_time` | timestamp(3) without time zone | NOT NULL |
| 11 | `end_time` | timestamp(3) without time zone | NULL |
| 12 | `start_latitude` | double precision | NULL |
| 13 | `start_longitude` | double precision | NULL |
| 14 | `end_latitude` | double precision | NULL |
| 15 | `end_longitude` | double precision | NULL |
| 16 | `distance_km` | double precision | NULL |
| 17 | `duration_minutes` | double precision | NULL |
| 18 | `avg_speed_kmh` | double precision | NULL |
| 19 | `max_speed_kmh` | double precision | NULL |
| 20 | `driving_score` | double precision | NULL |
| 21 | `fuel_used_liters` | double precision | NULL |
| 22 | `city_share_percent` | double precision | NULL |
| 23 | `highway_share_percent` | double precision | NULL |
| 24 | `country_share_percent` | double precision | NULL |
| 25 | `speeding_sections_json` | jsonb | NULL |
| 26 | `speeding_section_count` | integer | NULL |
| 27 | `speeding_distance_m` | integer | NULL |
| 28 | `speeding_duration_s` | integer | NULL |
| 29 | `speeding_exposure_pct` | double precision | NULL |
| 30 | `avg_over_speed_kmh` | double precision | NULL |
| 31 | `harsh_brake_count` | integer | NOT NULL DEFAULT 0 |
| 32 | `harsh_accel_count` | integer | NOT NULL DEFAULT 0 |
| 33 | `harsh_corner_count` | integer | NOT NULL DEFAULT 0 |
| 34 | `acceleration_event_count` | integer | NOT NULL DEFAULT 0 |
| 35 | `braking_event_count` | integer | NOT NULL DEFAULT 0 |
| 36 | `abuse_event_count` | integer | NOT NULL DEFAULT 0 |
| 37 | `hard_acceleration_count` | integer | NOT NULL DEFAULT 0 |
| 38 | `hard_braking_count` | integer | NOT NULL DEFAULT 0 |
| 39 | `full_braking_count` | integer | NOT NULL DEFAULT 0 |
| 40 | `total_acceleration_events` | integer | NOT NULL DEFAULT 0 |
| 41 | `hard_acceleration_events` | integer | NOT NULL DEFAULT 0 |
| 42 | `total_braking_events` | integer | NOT NULL DEFAULT 0 |
| 43 | `hard_braking_events` | integer | NOT NULL DEFAULT 0 |
| 44 | `full_braking_events` | integer | NOT NULL DEFAULT 0 |
| 45 | `cornering_events` | integer | NOT NULL DEFAULT 0 |
| 46 | `abuse_events` | integer | NOT NULL DEFAULT 0 |
| 47 | `speeding_events` | integer | NOT NULL DEFAULT 0 |
| 48 | `possible_impact_count` | integer | NOT NULL DEFAULT 0 |
| 49 | `kickdown_count` | integer | NOT NULL DEFAULT 0 |
| 50 | `cold_engine_abuse_count` | integer | NOT NULL DEFAULT 0 |
| 51 | `long_idle_count` | integer | NOT NULL DEFAULT 0 |
| 52 | `abuse_score` | double precision | NULL |
| 53 | `behavior_summary_json` | jsonb | NULL |
| 54 | `behavior_enriched_at` | timestamp(3) without time zone | NULL |
| 55 | `detection_profile` | "VehicleDetectionProfile" | NULL |
| 56 | `start_detection_mode` | text | NULL |
| 57 | `end_detection_mode` | text | NULL |
| 58 | `start_confidence` | "DetectionConfidence" | NULL |
| 59 | `end_confidence` | "DetectionConfidence" | NULL |
| 60 | `possible_start_at` | timestamp(3) without time zone | NULL |
| 61 | `possible_end_at` | timestamp(3) without time zone | NULL |
| 62 | `first_activity_at` | timestamp(3) without time zone | NULL |
| 63 | `last_activity_at` | timestamp(3) without time zone | NULL |
| 64 | `route_tracking_started_at` | timestamp(3) without time zone | NULL |
| 65 | `driving_tracking_started_at` | timestamp(3) without time zone | NULL |
| 66 | `raw_detection_meta` | jsonb | NULL |
| 67 | `trip_source` | "TripSource" | NOT NULL DEFAULT 'V2_LIVE'::"TripSource" |
| 68 | `is_repaired` | boolean | NOT NULL DEFAULT false |
| 69 | `merge_parent_trip_id` | text | NULL |
| 70 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### Predecessor indexes

- `vehicle_trips_assigned_booking_id_idx` btree (`assigned_booking_id`)
- `vehicle_trips_assignment_status_is_private_trip_idx` btree (`assignment_status`, `is_private_trip`)
- `vehicle_trips_assignment_subject_type_assignment_subject_id_idx` btree (`assignment_subject_type`, `assignment_subject_id`)
- `vehicle_trips_dimo_segment_id_key` UNIQUE btree (`dimo_segment_id`)
- `vehicle_trips_pkey` UNIQUE btree (`id`)
- `vehicle_trips_start_time_idx` btree (`start_time`)
- `vehicle_trips_trip_source_idx` btree (`trip_source`)
- `vehicle_trips_vehicle_id_idx` btree (`vehicle_id`)

### U-BT-002 — `driving_events`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-002` |
| 2 | Object name | `driving_events` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260331000000_v3_hardware_type` |
| 6 | Every downstream migration that changes it | `20260331000000_v3_hardware_type`, `20260413230000_add_composite_indexes_batch_c`, `20260716240000_driving_event_native_identity` |
| 7 | Bootstrap-time columns | **13** columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `driving_events_pkey` PRIMARY KEY (id) |
| 12 | Foreign keys | `driving_events_trip_id_fkey` FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id) ON UPDATE CASCADE ON DELETE SET NULL; `driving_events_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | **5** indexes (enumerated below) |
| 16 | Dependency order | Create enums ['DrivingEventType'] before table when referenced; table must exist before `20260331000000_v3_hardware_type` |
| 17 | Deliberately omitted (introduced later) | columns: `metadata_json`, `organization_id`, `provider`, `provider_event_name`, `provider_fingerprint`, `provider_source_id`, `source`, `trip_assignment`; indexes: `driving_events_org_provider_fingerprint`, `driving_events_organization_id_vehicle_id_recorded_at_idx`, `driving_events_source_idx`, `driving_events_trip_id_event_type_idx`, `driving_events_vehicle_id_recorded_at_idx`, `driving_events_vehicle_id_trip_assignment_idx` |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `vehicle_id` | text | NOT NULL |
| 3 | `event_type` | "DrivingEventType" | NOT NULL |
| 4 | `severity` | double precision | NOT NULL DEFAULT 0 |
| 5 | `latitude` | double precision | NULL |
| 6 | `longitude` | double precision | NULL |
| 7 | `speed_kmh` | double precision | NULL |
| 8 | `delta_kmh` | double precision | NULL |
| 9 | `duration_ms` | integer | NULL |
| 10 | `driver_name` | text | NULL |
| 11 | `trip_id` | text | NULL |
| 12 | `recorded_at` | timestamp(3) without time zone | NOT NULL |
| 13 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### Predecessor indexes

- `driving_events_pkey` UNIQUE btree (`id`)
- `driving_events_vehicle_id_idx` btree (`vehicle_id`)
- `driving_events_recorded_at_idx` btree (`recorded_at`)
- `driving_events_event_type_idx` btree (`event_type`)
- `driving_events_trip_id_idx` btree (`trip_id`)

### U-BT-003 — `trip_behavior_events`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-003` |
| 2 | Object name | `trip_behavior_events` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260413230000_add_composite_indexes_batch_c` |
| 6 | Every downstream migration that changes it | `20260413230000_add_composite_indexes_batch_c` |
| 7 | Bootstrap-time columns | **20** columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `trip_behavior_events_pkey` PRIMARY KEY (id) |
| 12 | Foreign keys | `trip_behavior_events_trip_id_fkey` FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id) ON UPDATE CASCADE ON DELETE CASCADE; `trip_behavior_events_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | **5** indexes (enumerated below) |
| 16 | Dependency order | Create enums ['BehaviorEventCategory', 'BehaviorEventClassification'] before table when referenced; table must exist before `20260413230000_add_composite_indexes_batch_c` |
| 17 | Deliberately omitted (introduced later) | columns: none; indexes: `trip_behavior_events_trip_id_event_category_idx` |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `organization_id` | text | NULL |
| 3 | `vehicle_id` | text | NOT NULL |
| 4 | `trip_id` | text | NOT NULL |
| 5 | `event_category` | "BehaviorEventCategory" | NOT NULL |
| 6 | `event_type` | text | NOT NULL |
| 7 | `classification` | "BehaviorEventClassification" | NOT NULL |
| 8 | `started_at` | timestamp(3) without time zone | NOT NULL |
| 9 | `ended_at` | timestamp(3) without time zone | NULL |
| 10 | `duration_ms` | integer | NULL |
| 11 | `start_speed_kmh` | double precision | NULL |
| 12 | `end_speed_kmh` | double precision | NULL |
| 13 | `peak_value` | double precision | NULL |
| 14 | `peak_value_unit` | text | NULL |
| 15 | `peak_g` | double precision | NULL |
| 16 | `max_throttle_pos` | double precision | NULL |
| 17 | `max_engine_rpm` | double precision | NULL |
| 18 | `max_coolant_temp` | double precision | NULL |
| 19 | `metadata_json` | jsonb | NULL |
| 20 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### Predecessor indexes

- `trip_behavior_events_event_category_idx` btree (`event_category`)
- `trip_behavior_events_pkey` UNIQUE btree (`id`)
- `trip_behavior_events_started_at_idx` btree (`started_at`)
- `trip_behavior_events_trip_id_idx` btree (`trip_id`)
- `trip_behavior_events_vehicle_id_idx` btree (`vehicle_id`)

### U-BT-004 — `vehicle_trip_waypoints`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-004` |
| 2 | Object name | `vehicle_trip_waypoints` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260609000000_autovacuum_tuning` |
| 6 | Every downstream migration that changes it | `20260609000000_autovacuum_tuning` |
| 7 | Bootstrap-time columns | **7** columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `vehicle_trip_waypoints_pkey` PRIMARY KEY (id) |
| 12 | Foreign keys | `vehicle_trip_waypoints_trip_id_fkey` FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | **3** indexes (enumerated below) |
| 16 | Dependency order | Create enums [] before table when referenced; table must exist before `20260609000000_autovacuum_tuning` |
| 17 | Deliberately omitted (introduced later) | columns: none; indexes: none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `trip_id` | text | NOT NULL |
| 3 | `latitude` | double precision | NOT NULL |
| 4 | `longitude` | double precision | NOT NULL |
| 5 | `speed_kmh` | double precision | NULL |
| 6 | `heading` | double precision | NULL |
| 7 | `recorded_at` | timestamp(3) without time zone | NOT NULL |

#### Predecessor indexes

- `vehicle_trip_waypoints_pkey` UNIQUE btree (`id`)
- `vehicle_trip_waypoints_recorded_at_idx` btree (`recorded_at`)
- `vehicle_trip_waypoints_trip_id_idx` btree (`trip_id`)

### U-BT-005 — `vehicle_trip_tracking_runs`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-005` |
| 2 | Object name | `vehicle_trip_tracking_runs` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260609000000_autovacuum_tuning` |
| 6 | Every downstream migration that changes it | `20260609000000_autovacuum_tuning` |
| 7 | Bootstrap-time columns | **16** columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `vehicle_trip_tracking_runs_pkey` PRIMARY KEY (id) |
| 12 | Foreign keys | `vehicle_trip_tracking_runs_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | **5** indexes (enumerated below) |
| 16 | Dependency order | Create enums ['TripDetectionState', 'TripTrackingRunType'] before table when referenced; table must exist before `20260609000000_autovacuum_tuning` |
| 17 | Deliberately omitted (introduced later) | columns: none; indexes: none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `vehicle_id` | text | NOT NULL |
| 3 | `organization_id` | text | NULL |
| 4 | `trip_id` | text | NULL |
| 5 | `state_at_run` | "TripDetectionState" | NOT NULL |
| 6 | `run_type` | "TripTrackingRunType" | NOT NULL |
| 7 | `requested_from` | timestamp(3) without time zone | NULL |
| 8 | `requested_to` | timestamp(3) without time zone | NULL |
| 9 | `core_points_count` | integer | NULL |
| 10 | `route_points_count` | integer | NULL |
| 11 | `driving_points_count` | integer | NULL |
| 12 | `result_state` | "TripDetectionState" | NULL |
| 13 | `result_summary` | jsonb | NULL |
| 14 | `error_message` | text | NULL |
| 15 | `duration_ms` | integer | NULL |
| 16 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### Predecessor indexes

- `vehicle_trip_tracking_runs_created_at_idx` btree (`created_at`)
- `vehicle_trip_tracking_runs_pkey` UNIQUE btree (`id`)
- `vehicle_trip_tracking_runs_run_type_idx` btree (`run_type`)
- `vehicle_trip_tracking_runs_trip_id_idx` btree (`trip_id`)
- `vehicle_trip_tracking_runs_vehicle_id_idx` btree (`vehicle_id`)

### U-BT-006 — `trip_repairs`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-006` |
| 2 | Object name | `trip_repairs` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260609000000_autovacuum_tuning` |
| 6 | Every downstream migration that changes it | `20260609000000_autovacuum_tuning` |
| 7 | Bootstrap-time columns | **12** columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `trip_repairs_pkey` PRIMARY KEY (id) |
| 12 | Foreign keys | `trip_repairs_trip_id_fkey` FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id) ON UPDATE CASCADE ON DELETE SET NULL; `trip_repairs_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | **6** indexes (enumerated below) |
| 16 | Dependency order | Create enums [] before table when referenced; table must exist before `20260609000000_autovacuum_tuning` |
| 17 | Deliberately omitted (introduced later) | columns: none; indexes: none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `vehicle_id` | text | NOT NULL |
| 3 | `trip_id` | text | NULL |
| 4 | `repair_type` | text | NOT NULL |
| 5 | `status` | text | NOT NULL DEFAULT 'PROPOSED'::text |
| 6 | `reason` | text | NOT NULL |
| 7 | `confidence` | text | NOT NULL |
| 8 | `window_from` | timestamp(3) without time zone | NOT NULL |
| 9 | `window_to` | timestamp(3) without time zone | NOT NULL |
| 10 | `detector_evidence` | jsonb | NULL |
| 11 | `applied_at` | timestamp(3) without time zone | NULL |
| 12 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### Predecessor indexes

- `trip_repairs_created_at_idx` btree (`created_at`)
- `trip_repairs_pkey` UNIQUE btree (`id`)
- `trip_repairs_repair_type_idx` btree (`repair_type`)
- `trip_repairs_status_idx` btree (`status`)
- `trip_repairs_trip_id_idx` btree (`trip_id`)
- `trip_repairs_vehicle_id_idx` btree (`vehicle_id`)

### U-BT-007 — `trip_driving_impact`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-007` |
| 2 | Object name | `trip_driving_impact` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260425000000_retire_user_assignment_and_speeding_severity` |
| 6 | Every downstream migration that changes it | `20260425000000_retire_user_assignment_and_speeding_severity`, `20260716250000_driving_impact_provenance`, `20260716260000_driving_impact_braking_provenance`, `20260716270000_driving_impact_load_components`, `20260717180000_trip_driving_impact_authoritative_coverage` |
| 7 | Bootstrap-time columns | **35** columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `trip_driving_impact_pkey` PRIMARY KEY (id) |
| 12 | Foreign keys | `trip_driving_impact_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | **4** indexes (enumerated below) |
| 16 | Dependency order | Create enums [] before table when referenced; table must exist before `20260425000000_retire_user_assignment_and_speeding_severity` |
| 17 | Deliberately omitted (introduced later) | columns: `analysis_status`, `authoritative_distance_km`, `calculated_at`, `capability_version`, `context_only_share`, `distance_discrepancy_km`, `estimated_proxy_share`, `hardware_profile`, `health_eligibility`, `hf_event_count`, `load_components_json`, `mean_brake_energy_proxy_per_km`, `measured_share`, `measurement_coverage`, `native_event_count`, `p95_negative_decel_measured`, `p95_negative_decel_proxy`, `primary_source`, `provenance_maturity`, `provenance_version`, `provider_classified_share`, `reconstructed_share`, `source_completeness`, `source_fingerprint`, `source_version`, `trip_distance_km_at_source`; indexes: `trip_driving_impact_analysis_status_idx`, `trip_driving_impact_source_fingerprint_idx` |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `organization_id` | text | NULL |
| 3 | `vehicle_id` | text | NOT NULL |
| 4 | `trip_id` | text | NOT NULL |
| 5 | `trip_started_at` | timestamp(3) without time zone | NOT NULL |
| 6 | `trip_ended_at` | timestamp(3) without time zone | NULL |
| 7 | `distance_km` | double precision | NOT NULL |
| 8 | `city_share_pct` | double precision | NULL |
| 9 | `highway_share_pct` | double precision | NULL |
| 10 | `country_road_share_pct` | double precision | NULL |
| 11 | `hard_accel_per_100km` | double precision | NULL |
| 12 | `extreme_accel_per_100km` | double precision | NULL |
| 13 | `hard_brake_per_100km` | double precision | NULL |
| 14 | `extreme_brake_per_100km` | double precision | NULL |
| 15 | `full_braking_per_100km` | double precision | NULL |
| 16 | `kickdown_per_100km` | double precision | NULL |
| 17 | `launch_like_per_100km` | double precision | NULL |
| 18 | `brakes_per_100km` | double precision | NULL |
| 19 | `stop_density` | double precision | NULL |
| 20 | `high_speed_brake_share` | double precision | NULL |
| 21 | `mean_brake_energy_per_km` | double precision | NULL |
| 22 | `p95_negative_decel` | double precision | NULL |
| 23 | `longitudinal_stress_score` | double precision | NULL |
| 24 | `braking_stress_score` | double precision | NULL |
| 25 | `stop_go_stress_score` | double precision | NULL |
| 26 | `high_speed_stress_score` | double precision | NULL |
| 27 | `thermal_brake_stress_score` | double precision | NULL |
| 28 | `driving_style_score` | double precision | NULL |
| 29 | `safety_score` | double precision | NULL |
| 30 | `speeding_exposure_pct` | double precision | NULL |
| 31 | `speeding_section_count` | integer | NULL |
| 32 | `model_version` | text | NOT NULL |
| 33 | `source_summary_json` | jsonb | NULL |
| 34 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| 35 | `updated_at` | timestamp(3) without time zone | NOT NULL |

#### Predecessor indexes

- `trip_driving_impact_organization_id_vehicle_id_idx` btree (`organization_id`, `vehicle_id`)
- `trip_driving_impact_pkey` UNIQUE btree (`id`)
- `trip_driving_impact_trip_id_key` UNIQUE btree (`trip_id`)
- `trip_driving_impact_vehicle_id_trip_started_at_idx` btree (`vehicle_id`, `trip_started_at`)

### U-BT-008 — `vehicle_trip_detection_states`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-008` |
| 2 | Object name | `vehicle_trip_detection_states` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `none` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time columns | **30** columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `vehicle_trip_detection_states_pkey` PRIMARY KEY (id) |
| 12 | Foreign keys | `vehicle_trip_detection_states_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | **5** indexes (enumerated below) |
| 16 | Dependency order | Create enums ['DetectionConfidence', 'TripDetectionState', 'VehicleDetectionProfile'] before table when referenced; table must exist before `downstream references` |
| 17 | Deliberately omitted (introduced later) | columns: none; indexes: none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `vehicle_id` | text | NOT NULL |
| 3 | `organization_id` | text | NULL |
| 4 | `state` | "TripDetectionState" | NOT NULL DEFAULT 'RESTING'::"TripDetectionState" |
| 5 | `detection_profile` | "VehicleDetectionProfile" | NOT NULL DEFAULT 'UNKNOWN'::"VehicleDetectionProfile" |
| 6 | `active_trip_id` | text | NULL |
| 7 | `possible_start_at` | timestamp(3) without time zone | NULL |
| 8 | `possible_end_at` | timestamp(3) without time zone | NULL |
| 9 | `last_activity_at` | timestamp(3) without time zone | NULL |
| 10 | `last_snapshot_evidence_at` | timestamp(3) without time zone | NULL |
| 11 | `last_core_processed_at` | timestamp(3) without time zone | NULL |
| 12 | `last_route_processed_at` | timestamp(3) without time zone | NULL |
| 13 | `last_driving_processed_at` | timestamp(3) without time zone | NULL |
| 14 | `worker_locked_until` | timestamp(3) without time zone | NULL |
| 15 | `worker_run_token` | text | NULL |
| 16 | `start_detection_mode` | text | NULL |
| 17 | `start_confidence` | "DetectionConfidence" | NULL |
| 18 | `end_detection_mode` | text | NULL |
| 19 | `end_confidence` | "DetectionConfidence" | NULL |
| 20 | `last_evidence_summary` | jsonb | NULL |
| 21 | `start_odometer_km` | double precision | NULL |
| 22 | `start_fuel_level` | double precision | NULL |
| 23 | `start_ev_soc` | double precision | NULL |
| 24 | `last_meaningful_movement_at` | timestamp(3) without time zone | NULL |
| 25 | `end_validation_attempts` | integer | NOT NULL DEFAULT 0 |
| 26 | `cusum_validated_at` | timestamp(3) without time zone | NULL |
| 27 | `cusum_segment_start` | timestamp(3) without time zone | NULL |
| 28 | `cusum_segment_end` | timestamp(3) without time zone | NULL |
| 29 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| 30 | `updated_at` | timestamp(3) without time zone | NOT NULL |

#### Predecessor indexes

- `vehicle_trip_detection_states_organization_id_idx` btree (`organization_id`)
- `vehicle_trip_detection_states_pkey` UNIQUE btree (`id`)
- `vehicle_trip_detection_states_state_idx` btree (`state`)
- `vehicle_trip_detection_states_vehicle_id_key` UNIQUE btree (`vehicle_id`)
- `vehicle_trip_detection_states_worker_locked_until_idx` btree (`worker_locked_until`)

### U-BT-009 — `brake_trip_metrics`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-009` |
| 2 | Object name | `brake_trip_metrics` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `none` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time columns | **11** columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `brake_trip_metrics_pkey` PRIMARY KEY (id) |
| 12 | Foreign keys | `brake_trip_metrics_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | **3** indexes (enumerated below) |
| 16 | Dependency order | Create enums [] before table when referenced; table must exist before `downstream references` |
| 17 | Deliberately omitted (introduced later) | columns: none; indexes: none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `vehicle_id` | text | NOT NULL |
| 3 | `trip_id` | text | NULL |
| 4 | `brake_energy_kj` | double precision | NULL |
| 5 | `hard_brake_count` | integer | NOT NULL DEFAULT 0 |
| 6 | `avg_deceleration_ms2` | double precision | NULL |
| 7 | `max_deceleration_ms2` | double precision | NULL |
| 8 | `brake_duration_sec` | integer | NULL |
| 9 | `distance_km` | double precision | NULL |
| 10 | `recorded_at` | timestamp(3) without time zone | NOT NULL |
| 11 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |

#### Predecessor indexes

- `brake_trip_metrics_pkey` UNIQUE btree (`id`)
- `brake_trip_metrics_recorded_at_idx` btree (`recorded_at`)
- `brake_trip_metrics_vehicle_id_idx` btree (`vehicle_id`)

### U-BT-010 — `TripAssignmentStatus`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-010` |
| 2 | Object name | `TripAssignmentStatus` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260425000000_retire_user_assignment_and_speeding_severity` |
| 6 | Every downstream migration that changes it | `20260425000000_retire_user_assignment_and_speeding_severity` |
| 7 | Bootstrap-time enum labels (ordered) | `ASSIGNED_DRIVER`, `ASSIGNED_USER`, `ASSIGNED_BOOKING_CUSTOMER`, `PRIVATE_UNASSIGNED`, `UNKNOWN_ASSIGNMENT` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `TripAssignmentStatus` |
| 17 | Deliberately omitted (introduced later) | none — includes retired `ASSIGNED_USER` required by `20260425000000` RENAME/rebuild |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

### U-BT-011 — `TripAssignmentSubjectType`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-011` |
| 2 | Object name | `TripAssignmentSubjectType` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260425000000_retire_user_assignment_and_speeding_severity` |
| 6 | Every downstream migration that changes it | `20260425000000_retire_user_assignment_and_speeding_severity` |
| 7 | Bootstrap-time enum labels (ordered) | `DRIVER`, `USER`, `BOOKING_CUSTOMER` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `TripAssignmentSubjectType` |
| 17 | Deliberately omitted (introduced later) | none — includes retired `USER` required by `20260425000000` RENAME/rebuild |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

### U-BT-012 — `DrivingEventType`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-012` |
| 2 | Object name | `DrivingEventType` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260716230000_driving_event_type_native_mapper` |
| 6 | Every downstream migration that changes it | `20260716230000_driving_event_type_native_mapper` |
| 7 | Bootstrap-time enum labels (ordered) | `HARSH_BRAKING`, `EXTREME_BRAKING`, `HARSH_ACCELERATION`, `HARSH_CORNERING`, `SPEEDING`, `IDLE_EXCESSIVE` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `DrivingEventType` |
| 17 | Deliberately omitted (introduced later) | `UNMAPPED_PROVIDER_EVENT`, `SAFETY_COLLISION` (downstream guarded ADD VALUE in `20260716230000`) |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

### U-BT-013 — `BehaviorEventCategory`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-013` |
| 2 | Object name | `BehaviorEventCategory` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260413230000_add_composite_indexes_batch_c` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time enum labels (ordered) | `ACCELERATION`, `BRAKING`, `ABUSE` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `BehaviorEventCategory` |
| 17 | Deliberately omitted (introduced later) | none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

### U-BT-014 — `BehaviorEventClassification`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-014` |
| 2 | Object name | `BehaviorEventClassification` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260413230000_add_composite_indexes_batch_c` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time enum labels (ordered) | `LIGHT`, `MODERATE`, `HARD`, `EXTREME`, `WARNING`, `SEVERE`, `CRITICAL` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `BehaviorEventClassification` |
| 17 | Deliberately omitted (introduced later) | none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

### U-BT-015 — `TripSource`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-015` |
| 2 | Object name | `TripSource` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `none` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time enum labels (ordered) | `V2_LIVE`, `REPAIRED` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `TripSource` |
| 17 | Deliberately omitted (introduced later) | none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

### U-BT-016 — `TripDetectionState`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-016` |
| 2 | Object name | `TripDetectionState` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `none` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time enum labels (ordered) | `RESTING`, `POSSIBLE_START`, `ACTIVE_TRIP`, `IDLE_WITHIN_TRIP`, `POSSIBLE_END`, `ENDED` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `TripDetectionState` |
| 17 | Deliberately omitted (introduced later) | none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

### U-BT-017 — `TripTrackingRunType`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-017` |
| 2 | Object name | `TripTrackingRunType` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `none` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time enum labels (ordered) | `POSSIBLE_START_VALIDATION`, `ACTIVE_TRACKING`, `POSSIBLE_END_CHECK`, `END_VALIDATION`, `FINALIZATION_CHECK` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `TripTrackingRunType` |
| 17 | Deliberately omitted (introduced later) | none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

### U-BT-018 — `VehicleDetectionProfile`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-018` |
| 2 | Object name | `VehicleDetectionProfile` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `none` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time enum labels (ordered) | `ICE`, `EV`, `HYBRID`, `UNKNOWN` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `VehicleDetectionProfile` |
| 17 | Deliberately omitted (introduced later) | none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

### U-BT-019 — `DetectionConfidence`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-019` |
| 2 | Object name | `DetectionConfidence` |
| 3 | Object kind | enum |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `none` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time enum labels (ordered) | `LOW`, `MEDIUM`, `HIGH` |
| 8 | Bootstrap-time PostgreSQL type | PostgreSQL enum type |
| 9 | Nullability | n/a |
| 10 | Defaults | n/a |
| 11 | Primary keys | n/a |
| 12 | Foreign keys | n/a |
| 13 | Unique constraints | n/a |
| 14 | Check constraints | n/a |
| 15 | Indexes | n/a |
| 16 | Dependency order | Must exist before columns referencing `DetectionConfidence` |
| 17 | Deliberately omitted (introduced later) | none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

## 5. Post-replay final-convergence ledger (CI-R3B.0.2.1)

After minimal bootstrap + all committed downstream migrations (**state A**), compare resulting state to
accepted CI-R3A.7.1 JSON. Any remaining delta requires the authorized post-replay reconciliation migration
(`20260814130000_ci_r3b_post_replay_parity_reconciliation` — planned, not created). After that migration
(**state B**), all property categories must match accepted JSON.

Historical incomplete ledger (**SUPERSEDED BY CI-R3B.0.2.1**): declared `FINAL_CONVERGENCE_LEDGER_OBJECT_COUNT` = 19
but only 11 object rows were present; eight table rows missing; Assignment enums used ambiguous `5/3 bootstrap` notation.

### 5.1 Nineteen-object convergence inventory

| # | Object | Kind | Property categories accounted | State A vs accepted final | Producer | Default Δ | Type Δ | Null Δ | Constraint Δ | Index Δ | Reconciliation |
|---|--------|------|------------------------------|---------------------------|----------|-----------|--------|--------|--------------|---------|----------------|
| 1 | `vehicle_trips` | table | columns 110/110; types 110/110; nullability 110/110; defaults 109/110; constraints 2/2; indexes 13/13 | Bootstrap 70 cols + 8 idx → committed history 110 cols, 2 constraints, 13 indexes. After committed history: `trip_status` DEFAULT `'COMPLETED'::"TripStatus"` (`20260325161142`). Accepted final: `'ONGOING'::"TripStatus"`. All other 109 column defaults match accepted JSON. | BOOTSTRAP + COMMITTED_DOWNSTREAM_MIGRATION (+ POST_REPLAY_RECONCILIATION for default) | 1 | 0 | 0 | 0 | 0 | POST_REPLAY_RECONCILIATION required for `trip_status` DEFAULT only |
| 2 | `driving_events` | table | columns 21/21; types 21/21; nullability 21/21; defaults 21/21; constraints 3/3; indexes 11/11 | Bootstrap 13 cols + 5 idx → committed history 21 cols, 3 constraints, 11 indexes. All 21 column defaults match accepted JSON after downstream guarded/unguarded adds (`20260331000000`, `20260716240000`). | BOOTSTRAP + COMMITTED_DOWNSTREAM_MIGRATION | 0 | 0 | 0 | 0 | 0 | none |
| 3 | `trip_behavior_events` | table | columns 20/20; types 20/20; nullability 20/20; defaults 20/20; constraints 3/3; indexes 6/6 | Bootstrap 20 cols + 5 idx → committed history 20 cols, 3 constraints, 6 indexes. All 20 column defaults match accepted JSON; one index added downstream (`20260413230000`). | BOOTSTRAP + COMMITTED_DOWNSTREAM_MIGRATION | 0 | 0 | 0 | 0 | 0 | none |
| 4 | `vehicle_trip_waypoints` | table | columns 7/7; types 7/7; nullability 7/7; defaults 7/7; constraints 2/2; indexes 3/3 | Bootstrap 7 cols + 3 idx → committed history 7 cols, 2 constraints, 3 indexes. All 7 column defaults match accepted JSON; no downstream column/index DDL after bootstrap. | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |
| 5 | `vehicle_trip_tracking_runs` | table | columns 16/16; types 16/16; nullability 16/16; defaults 16/16; constraints 2/2; indexes 5/5 | Bootstrap 16 cols + 5 idx → committed history 16 cols, 2 constraints, 5 indexes. All 16 column defaults match accepted JSON; `20260609000000_autovacuum_tuning` ALTER TABLE SET only (storage, not shape). | BOOTSTRAP (+ COMMITTED_DOWNSTREAM_MIGRATION for storage SET only) | 0 | 0 | 0 | 0 | 0 | none |
| 6 | `trip_repairs` | table | columns 12/12; types 12/12; nullability 12/12; defaults 12/12; constraints 3/3; indexes 6/6 | Bootstrap 12 cols + 6 idx → committed history 12 cols, 3 constraints, 6 indexes. All 12 column defaults match accepted JSON; `20260609000000_autovacuum_tuning` ALTER TABLE SET only. | BOOTSTRAP (+ COMMITTED_DOWNSTREAM_MIGRATION for storage SET only) | 0 | 0 | 0 | 0 | 0 | none |
| 7 | `trip_driving_impact` | table | columns 61/61; types 61/61; nullability 61/61; defaults 61/61; constraints 2/2; indexes 6/6 | Bootstrap 35 cols + 4 idx → committed history 61 cols, 2 constraints, 6 indexes. All 61 column defaults match accepted JSON after unguarded downstream adds and one guarded DROP COLUMN (`20260425000000`, `20260717180000`). | BOOTSTRAP + COMMITTED_DOWNSTREAM_MIGRATION | 0 | 0 | 0 | 0 | 0 | none |
| 8 | `vehicle_trip_detection_states` | table | columns 30/30; types 30/30; nullability 30/30; defaults 30/30; constraints 2/2; indexes 5/5 | Bootstrap 30 cols + 5 idx → committed history 30 cols, 2 constraints, 5 indexes. All 30 column defaults match accepted JSON; no downstream shape DDL. | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |
| 9 | `brake_trip_metrics` | table | columns 11/11; types 11/11; nullability 11/11; defaults 11/11; constraints 2/2; indexes 3/3 | Bootstrap 11 cols + 3 idx → committed history 11 cols, 2 constraints, 3 indexes. All 11 column defaults match accepted JSON; no downstream shape DDL (transitional bootstrap-only table). | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |
| 10 | `TripAssignmentStatus` | enum | enum label set (ordered count and membership) | Bootstrap: 5 labels: ASSIGNED_DRIVER, ASSIGNED_USER, ASSIGNED_BOOKING_CUSTOMER, PRIVATE_UNASSIGNED, UNKNOWN_ASSIGNMENT. Downstream: `20260425000000_retire_user_assignment_and_speeding_severity`: ALTER TYPE RENAME → CREATE TYPE → ALTER COLUMN → DROP TYPE removes label `ASSIGNED_USER`. After committed history: 4 labels: ASSIGNED_DRIVER, ASSIGNED_BOOKING_CUSTOMER, PRIVATE_UNASSIGNED, UNKNOWN_ASSIGNMENT. | BOOTSTRAP + COMMITTED_DOWNSTREAM_MIGRATION | 0 | 0 | 0 | 0 | 0 | none |
| 11 | `TripAssignmentSubjectType` | enum | enum label set (ordered count and membership) | Bootstrap: 3 labels: DRIVER, USER, BOOKING_CUSTOMER. Downstream: `20260425000000_retire_user_assignment_and_speeding_severity`: ALTER TYPE RENAME → CREATE TYPE → ALTER COLUMN → DROP TYPE removes label `USER`. After committed history: 2 labels: DRIVER, BOOKING_CUSTOMER. | BOOTSTRAP + COMMITTED_DOWNSTREAM_MIGRATION | 0 | 0 | 0 | 0 | 0 | none |
| 12 | `DrivingEventType` | enum | enum label set (ordered count and membership) | Bootstrap: 6 labels: HARSH_BRAKING, EXTREME_BRAKING, HARSH_ACCELERATION, HARSH_CORNERING, SPEEDING, IDLE_EXCESSIVE. Downstream: `20260716230000_driving_event_type_native_mapper`: ADD VALUE `UNMAPPED_PROVIDER_EVENT`, `SAFETY_COLLISION`. After committed history: 8 labels: HARSH_BRAKING, EXTREME_BRAKING, HARSH_ACCELERATION, HARSH_CORNERING, SPEEDING, IDLE_EXCESSIVE, UNMAPPED_PROVIDER_EVENT, SAFETY_COLLISION. | BOOTSTRAP + COMMITTED_DOWNSTREAM_MIGRATION | 0 | 0 | 0 | 0 | 0 | none |
| 13 | `BehaviorEventCategory` | enum | enum label set (ordered count and membership) | Bootstrap: 3 labels: ACCELERATION, BRAKING, ABUSE. Downstream: none (bootstrap label set equals final accepted set). After committed history: 3 labels: ACCELERATION, BRAKING, ABUSE. | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |
| 14 | `BehaviorEventClassification` | enum | enum label set (ordered count and membership) | Bootstrap: 7 labels: LIGHT, MODERATE, HARD, EXTREME, WARNING, SEVERE, CRITICAL. Downstream: none (bootstrap label set equals final accepted set). After committed history: 7 labels: LIGHT, MODERATE, HARD, EXTREME, WARNING, SEVERE, CRITICAL. | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |
| 15 | `TripSource` | enum | enum label set (ordered count and membership) | Bootstrap: 2 labels: V2_LIVE, REPAIRED. Downstream: none (bootstrap label set equals final accepted set). After committed history: 2 labels: V2_LIVE, REPAIRED. | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |
| 16 | `TripDetectionState` | enum | enum label set (ordered count and membership) | Bootstrap: 6 labels: RESTING, POSSIBLE_START, ACTIVE_TRIP, IDLE_WITHIN_TRIP, POSSIBLE_END, ENDED. Downstream: none (bootstrap label set equals final accepted set). After committed history: 6 labels: RESTING, POSSIBLE_START, ACTIVE_TRIP, IDLE_WITHIN_TRIP, POSSIBLE_END, ENDED. | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |
| 17 | `TripTrackingRunType` | enum | enum label set (ordered count and membership) | Bootstrap: 5 labels: POSSIBLE_START_VALIDATION, ACTIVE_TRACKING, POSSIBLE_END_CHECK, END_VALIDATION, FINALIZATION_CHECK. Downstream: none (bootstrap label set equals final accepted set). After committed history: 5 labels: POSSIBLE_START_VALIDATION, ACTIVE_TRACKING, POSSIBLE_END_CHECK, END_VALIDATION, FINALIZATION_CHECK. | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |
| 18 | `VehicleDetectionProfile` | enum | enum label set (ordered count and membership) | Bootstrap: 4 labels: ICE, EV, HYBRID, UNKNOWN. Downstream: none (bootstrap label set equals final accepted set). After committed history: 4 labels: ICE, EV, HYBRID, UNKNOWN. | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |
| 19 | `DetectionConfidence` | enum | enum label set (ordered count and membership) | Bootstrap: 3 labels: LOW, MEDIUM, HIGH. Downstream: none (bootstrap label set equals final accepted set). After committed history: 3 labels: LOW, MEDIUM, HIGH. | BOOTSTRAP | 0 | 0 | 0 | 0 | 0 | none |

### 5.2 Table property-category proof (9 tables × 6 categories = 54)

Each table row in §5.1 explicitly accounts for all six property categories. Mechanical accepted JSON totals:

| Table | Columns | Constraints | Indexes |
|-------|---------|-------------|---------|
| `vehicle_trips` | 110 | 2 | 13 |
| `driving_events` | 21 | 3 | 11 |
| `trip_behavior_events` | 20 | 3 | 6 |
| `vehicle_trip_waypoints` | 7 | 2 | 3 |
| `vehicle_trip_tracking_runs` | 16 | 2 | 5 |
| `trip_repairs` | 12 | 3 | 6 |
| `trip_driving_impact` | 61 | 2 | 6 |
| `vehicle_trip_detection_states` | 30 | 2 | 5 |
| `brake_trip_metrics` | 11 | 2 | 3 |

Per-table category reconciliation (columns / PostgreSQL types / nullability / defaults / constraints / indexes):

| Table | Columns | Types | Nullability | Defaults | Constraints | Indexes | Committed-history convergence | Reconciliation |
|-------|---------|-------|-------------|----------|-------------|---------|--------------------------------|----------------|
| `vehicle_trips` | 110=110 | 110=110 | 110=110 | 109=110 (**1** Δ: `trip_status`) | 2=2 | 13=13 | all except one default | POST_REPLAY for `trip_status` DEFAULT |
| `driving_events` | 21=21 | 21=21 | 21=21 | 21=21 | 3=3 | 11=11 | full | none |
| `trip_behavior_events` | 20=20 | 20=20 | 20=20 | 20=20 | 3=3 | 6=6 | full | none |
| `vehicle_trip_waypoints` | 7=7 | 7=7 | 7=7 | 7=7 | 2=2 | 3=3 | full | none |
| `vehicle_trip_tracking_runs` | 16=16 | 16=16 | 16=16 | 16=16 | 2=2 | 5=5 | full | none |
| `trip_repairs` | 12=12 | 12=12 | 12=12 | 12=12 | 3=3 | 6=6 | full | none |
| `trip_driving_impact` | 61=61 | 61=61 | 61=61 | 61=61 | 2=2 | 6=6 | full | none |
| `vehicle_trip_detection_states` | 30=30 | 30=30 | 30=30 | 30=30 | 2=2 | 5=5 | full | none |
| `brake_trip_metrics` | 11=11 | 11=11 | 11=11 | 11=11 | 2=2 | 3=3 | full | none |

Evidence path: minimal predecessor §4 (U-BT-001…U-BT-009) + downstream DDL matrix §3 + accepted JSON column/constraint/index records.

### 5.3 Enum label-set proof (10 enums)

| Enum | Bootstrap labels (count) | Downstream transformation | Final labels (count) | Match after history | Reconciliation |
|------|-------------------------|----------------------------|----------------------|---------------------|----------------|
| `TripAssignmentStatus` | 5: ASSIGNED_DRIVER, ASSIGNED_USER, ASSIGNED_BOOKING_CUSTOMER, PRIVATE_UNASSIGNED, UNKNOWN_ASSIGNMENT | `20260425000000`: RENAME/rebuild removes ASSIGNED_USER | 4: ASSIGNED_DRIVER, ASSIGNED_BOOKING_CUSTOMER, PRIVATE_UNASSIGNED, UNKNOWN_ASSIGNMENT | YES | none |
| `TripAssignmentSubjectType` | 3: DRIVER, USER, BOOKING_CUSTOMER | `20260425000000`: RENAME/rebuild removes USER | 2: DRIVER, BOOKING_CUSTOMER | YES | none |
| `DrivingEventType` | 6: HARSH_BRAKING, EXTREME_BRAKING, HARSH_ACCELERATION, HARSH_CORNERING, SPEEDING, IDLE_EXCESSIVE | `20260716230000`: ADD VALUE UNMAPPED_PROVIDER_EVENT, SAFETY_COLLISION | 8 (accepted JSON order) | YES | none |
| `BehaviorEventCategory` | 3: ACCELERATION, BRAKING, ABUSE | none | 3 | YES | none |
| `BehaviorEventClassification` | 7: LIGHT, MODERATE, HARD, EXTREME, WARNING, SEVERE, CRITICAL | none | 7 | YES | none |
| `TripSource` | 2: V2_LIVE, REPAIRED | none | 2 | YES | none |
| `TripDetectionState` | 6: RESTING, POSSIBLE_START, ACTIVE_TRIP, IDLE_WITHIN_TRIP, POSSIBLE_END, ENDED | none | 6 | YES | none |
| `TripTrackingRunType` | 5: POSSIBLE_START_VALIDATION, ACTIVE_TRACKING, POSSIBLE_END_CHECK, END_VALIDATION, FINALIZATION_CHECK | none | 5 | YES | none |
| `VehicleDetectionProfile` | 4: ICE, EV, HYBRID, UNKNOWN | none | 4 | YES | none |
| `DetectionConfidence` | 3: LOW, MEDIUM, HIGH | none | 3 | YES | none |

### 5.4 State A vs state B mismatch counters

**State A** = minimal bootstrap + all committed downstream migrations (reconciliation not applied).

| Counter | Value |
|---------|-------|
| `FINAL_REPLAY_DEFAULT_MISMATCH_COUNT_AFTER_COMMITTED_HISTORY` | **1** |
| `FINAL_REPLAY_TYPE_MISMATCH_COUNT_AFTER_COMMITTED_HISTORY` | **0** |
| `FINAL_REPLAY_NULLABILITY_MISMATCH_COUNT_AFTER_COMMITTED_HISTORY` | **0** |
| `FINAL_REPLAY_CONSTRAINT_MISMATCH_COUNT_AFTER_COMMITTED_HISTORY` | **0** |
| `FINAL_REPLAY_INDEX_MISMATCH_COUNT_AFTER_COMMITTED_HISTORY` | **0** |

The single pre-reconciliation default mismatch: `vehicle_trips.trip_status` DEFAULT `'COMPLETED'::"TripStatus"` (producer: `20260325161142_trip_architecture_refactor`) vs accepted `'ONGOING'::"TripStatus"`.

**State B** = state A + authorized post-replay reconciliation migration (planned, not implemented).

| Counter | Value |
|---------|-------|
| `FINAL_REPLAY_DEFAULT_MISMATCH_COUNT_AFTER_AUTHORIZED_RECONCILIATION` | **0** |
| `FINAL_REPLAY_TYPE_MISMATCH_COUNT_AFTER_AUTHORIZED_RECONCILIATION` | **0** |
| `FINAL_REPLAY_NULLABILITY_MISMATCH_COUNT_AFTER_AUTHORIZED_RECONCILIATION` | **0** |
| `FINAL_REPLAY_CONSTRAINT_MISMATCH_COUNT_AFTER_AUTHORIZED_RECONCILIATION` | **0** |
| `FINAL_REPLAY_INDEX_MISMATCH_COUNT_AFTER_AUTHORIZED_RECONCILIATION` | **0** |

Authorized reconciliation statement (minimum proven delta):

```sql
ALTER TABLE "vehicle_trips"
  ALTER COLUMN "trip_status"
  SET DEFAULT 'ONGOING'::"TripStatus";
```

### 5.5 Final-convergence inventory counters

| Counter | Value |
|---------|-------|
| `FINAL_CONVERGENCE_LEDGER_OBJECT_COUNT` | **19** |
| `FINAL_CONVERGENCE_LEDGER_UNIQUE_OBJECT_COUNT` | **19** |
| `FINAL_CONVERGENCE_TABLE_ROW_COUNT` | **9** |
| `FINAL_CONVERGENCE_ENUM_ROW_COUNT` | **10** |
| `FINAL_CONVERGENCE_OBJECT_OMISSION_COUNT` | **0** |
| `FINAL_CONVERGENCE_DUPLICATE_OBJECT_COUNT` | **0** |
| `FINAL_CONVERGENCE_TABLE_PROPERTY_CATEGORY_COUNT` | **54** |
| `FINAL_CONVERGENCE_TABLE_PROPERTY_CATEGORY_OMISSION_COUNT` | **0** |
| `FINAL_CONVERGENCE_TABLE_PROPERTY_CATEGORY_UNCLASSIFIED_COUNT` | **0** |
| `FINAL_CONVERGENCE_UNCLASSIFIED_PROPERTY_COUNT` | **0** |
| `AMBIGUOUS_ENUM_BOOTSTRAP_COUNT_CLAIM_COUNT` | **0** |
| `ENUM_FINAL_LABELSET_MISMATCH_COUNT` | **0** |
| `ENUM_FINAL_LABELSET_OMISSION_COUNT` | **0** |
| `POST_REPLAY_RECONCILIATION_REQUIRED` | **YES** |
| `POST_REPLAY_RECONCILIATION_IMPLEMENTED` | **NO** |
| `FULL_REPLAY_FINAL_SHAPE_PROVEN_BY_AUTHORITY` | **YES** |

`FULL_REPLAY_FINAL_SHAPE_PROVEN_BY_AUTHORITY` = YES means the documented four-migration plan (bootstrap, pre-shim, target, post-shim, **plus** reconciliation) is sufficient if implemented and replayed successfully. It does **not** mean CI-R3B.1 or an executable reconciliation migration already exists.

## 6. Validation counters (mechanical)

| Counter | Value |
|---------|-------|
| `INCOMPLETE_PREDECESSOR_INDEX_DEFINITION_COUNT` | **0** |
| `PREDECESSOR_INDEX_COUNT_MISMATCH_COUNT` | **0** |
| `PREDECESSOR_COLUMN_COUNT_MISMATCH_COUNT` | **0** |
| `PREDECESSOR_CONSTRAINT_COUNT_MISMATCH_COUNT` | **0** |
| `BOOTSTRAP_REFERENCES_NOT_YET_CREATED_TYPE_COUNT` | **0** |
| `BOOTSTRAP_INDEX_REFERENCES_MISSING_COLUMN_COUNT` | **0** |
| `BOOTSTRAP_DEFAULT_REFERENCES_UNAVAILABLE_TYPE_OR_VALUE_COUNT` | **0** |
| `DRIVING_EVENTS_PREDECESSOR_COLUMN_COUNT` | **13** |
| `DRIVING_EVENTS_PREDECESSOR_INDEX_COUNT` | **5** |
| `DRIVING_EVENTS_FUTURE_TYPE_REFERENCE_COUNT` | **0** |
| `DRIVING_EVENTS_INDEX_MISSING_COLUMN_REFERENCE_COUNT` | **0** |
| `BOOTSTRAP_DOWNSTREAM_UNGUARDED_TYPE_OVERLAP_COUNT` | **0** |
| `BOOTSTRAP_DOWNSTREAM_UNGUARDED_COLUMN_OVERLAP_COUNT` | **0** |
| `BOOTSTRAP_DOWNSTREAM_UNGUARDED_CONSTRAINT_OVERLAP_COUNT` | **0** |
| `BOOTSTRAP_DOWNSTREAM_UNGUARDED_INDEX_OVERLAP_COUNT` | **0** |
| `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` | **0** |

## 7. Special authority

| Field | Value |
|-------|-------|
| `BRAKE_TRIP_METRICS_EXECUTABLE_DISPOSITION` | **TRANSITIONAL_BOOTSTRAP_REQUIRED** |
| `U043_PRODUCT_OWNER_DECISION` | **DEPRECATE_AND_REMOVE** (approved; not implemented) |
| `CI_R3B_IMPLEMENTATION_COUNT` | **0** |

## 8. Final status

**Status: CI_R3B02_REPLAY_AUTHORITY_LEDGER_COMPLETED**

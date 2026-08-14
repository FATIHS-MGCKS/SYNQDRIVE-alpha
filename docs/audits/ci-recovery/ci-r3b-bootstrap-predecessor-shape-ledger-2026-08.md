# CI-R3B — Bootstrap predecessor-shape ledger (CI-R3B.0.1)

**Phase:** CI-R3B.0.1 — bootstrap predecessor-shape authority correction
**Branch:** `fix/ci-r3b-vehicle-trips-migration-replay-2026-08`
**Scope:** documentation authority only — no migrations, schema, runtime or production changes

This ledger separates **BOOTSTRAP_PREDECESSOR_SHAPE** (exact schema immediately after insertion
point `20260325161141` and before `20260325161142`) from **FINAL_ACCEPTED_SHAPE** (accepted
CI-R3A.7.1 production catalog after full migration replay).

## 0. Two-shape authority model

| Field | Value |
|-------|-------|
| `BOOTSTRAP_INSERTION_POINT` | `20260325161141` |
| `BOOTSTRAP_SHAPE_AUTHORITY` | `PREDECESSOR_AT_INSERTION_POINT` (this ledger) |
| `FINAL_SHAPE_AUTHORITY` | `ACCEPTED_CI_R3A71_PRODUCTION_JSON` (`ci-r3a7-production-catalog-evidence-2026-08.json`) |
| `BOOTSTRAP_PREDECESSOR_EQUALS_FINAL_FOR_ALL_OBJECTS` | **NO** |
| `FULL_REPLAY_MUST_PRODUCE_FINAL_ACCEPTED_SHAPE` | **YES** |
| `FINAL_PARITY_EXCEPTION_COUNT` | **0** |

## 1. Bootstrap inventory accounting

| Counter | Value |
|---------|-------|
| `BOOTSTRAP_TABLE_OBJECT_COUNT` | **11** |
| `BOOTSTRAP_ENUM_OBJECT_COUNT` | **2** |
| `BOOTSTRAP_PARITY_ONLY_TYPE_COUNT` | **6** |
| `BOOTSTRAP_TOTAL_OBJECT_COUNT` | **19** |
| `BOOTSTRAP_OBJECT_LEDGER_ROW_COUNT` | **19** |
| `BOOTSTRAP_OBJECT_LEDGER_UNIQUE_ID_COUNT` | **19** |
| `BOOTSTRAP_OBJECT_LEDGER_DUPLICATE_ID_COUNT` | **0** |
| `BOOTSTRAP_OBJECT_LEDGER_MISSING_OBJECT_COUNT` | **0** |

Partition: **11** BOOTSTRAP_REPLAY_REQUIRED (8 tables + 3 enums), **2** BOOTSTRAP_EVENTUAL_REPLAY_REQUIRED enums, **6** SCHEMA_PARITY_ONLY (1 table + 5 enums).

## 2. Overlap and classification counters

| Counter | Value |
|---------|-------|
| `PROVEN_IMMEDIATE_UNGUARDED_COLUMN_OVERLAP_COUNT` | **17** |
| `PROVEN_IMMEDIATE_UNGUARDED_INDEX_OVERLAP_COUNT` | **2** |
| `PROVEN_LATE_TYPE_DEPENDENCY_COUNT` | **2** |
| `BOOTSTRAP_DOWNSTREAM_UNGUARDED_TYPE_OVERLAP_COUNT` | **0** |
| `BOOTSTRAP_DOWNSTREAM_UNGUARDED_COLUMN_OVERLAP_COUNT` | **0** |
| `BOOTSTRAP_DOWNSTREAM_UNGUARDED_CONSTRAINT_OVERLAP_COUNT` | **0** |
| `BOOTSTRAP_DOWNSTREAM_UNGUARDED_INDEX_OVERLAP_COUNT` | **0** |
| `BOOTSTRAP_REFERENCES_NOT_YET_CREATED_TYPE_COUNT` | **0** |
| `UNCLASSIFIED_DOWNSTREAM_EVOLUTION_DDL_COUNT` | **0** |
| `BOOTSTRAP_PREDECESSOR_SHAPE_UNKNOWN_COUNT` | **0** |
| `IMPLEMENTATION_CRITICAL_UNKNOWN_COUNT` | **0** |

## 3. Downstream evolution matrix (post-`20260325161141`)

| Migration | Operation | Object | Target | Guarded | Required predecessor condition | Bootstrap treatment | Final replay effect |
|-----------|-----------|--------|--------|---------|-------------------------------|---------------------|---------------------|
| `20260325161142_trip_architecture_refactor` | CREATE TYPE | TripStatus | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | trip_status | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | avg_consumption_l_per_100km | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | fuel_confidence | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | energy_used_kwh | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | avg_consumption_kwh_per_100km | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | energy_confidence | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | outside_temperature_start_c | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | engine_temp_start_c | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | engine_temp_end_c | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | avg_rpm | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | avg_throttle_position | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | avg_engine_load | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | gap_ended | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | enriched_at | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | speeding_percent | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | max_over_speed_kmh | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | ADD COLUMN | vehicle_trips | speeding_segments | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | DROP COLUMN | vehicle_trips | dimo_mechanism | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | DROP COLUMN | vehicle_trips | road_surface_type | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | DROP COLUMN | vehicle_trips | road_surface_score | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | DROP COLUMN | vehicle_trips | climate_factor | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | DROP COLUMN | vehicle_trips | tire_wear_contrib_km | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | DROP COLUMN | vehicle_trips | dtc_codes_found | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | DROP COLUMN | vehicle_trips | avg_temperature_c | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260325161142_trip_architecture_refactor` | CREATE INDEX | vehicle_trips | vehicle_trips_trip_status_idx | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260331000000_v3_hardware_type` | CREATE TYPE | DrivingEventSource | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260331000000_v3_hardware_type` | ADD COLUMN | driving_events | organization_id | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260331000000_v3_hardware_type` | ADD COLUMN | driving_events | source | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260331000000_v3_hardware_type` | ADD COLUMN | driving_events | metadata_json | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260331000000_v3_hardware_type` | CREATE INDEX | driving_events | driving_events_source_idx | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260410000000_add_enrichment_status_fields` | ADD COLUMN | vehicle_trips | behavior_enrichment_status | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260410000000_add_enrichment_status_fields` | ADD COLUMN | vehicle_trips | behavior_enrichment_attempts | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260410000000_add_enrichment_status_fields` | ADD COLUMN | vehicle_trips | behavior_enrichment_error | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260410000000_add_enrichment_status_fields` | ADD COLUMN | vehicle_trips | behavior_enrichment_started_at | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260410000000_add_enrichment_status_fields` | ADD COLUMN | vehicle_trips | driving_impact_computed_at | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260410000000_add_enrichment_status_fields` | CREATE INDEX | vehicle_trips | vehicle_trips_behavior_enrichment_status_idx | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260413230000_add_composite_indexes_batch_c` | CREATE INDEX | vehicle_trips | vehicle_trips_vehicle_id_start_time_idx | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260413230000_add_composite_indexes_batch_c` | CREATE INDEX | driving_events | driving_events_vehicle_id_recorded_at_idx | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260413230000_add_composite_indexes_batch_c` | CREATE INDEX | driving_events | driving_events_trip_id_event_type_idx | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260413230000_add_composite_indexes_batch_c` | CREATE INDEX | trip_behavior_events | trip_behavior_events_trip_id_event_category_idx | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260425000000_retire_user_assignment_and_speeding_severity` | UPDATE | vehicle_trips | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260425000000_retire_user_assignment_and_speeding_severity` | ALTER TYPE | TripAssignmentStatus | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260425000000_retire_user_assignment_and_speeding_severity` | RENAME TYPE | TripAssignmentStatus | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260425000000_retire_user_assignment_and_speeding_severity` | CREATE TYPE | TripAssignmentStatus | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260425000000_retire_user_assignment_and_speeding_severity` | UPDATE | vehicle_trips | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260425000000_retire_user_assignment_and_speeding_severity` | ALTER TYPE | TripAssignmentSubjectType | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260425000000_retire_user_assignment_and_speeding_severity` | RENAME TYPE | TripAssignmentSubjectType | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260425000000_retire_user_assignment_and_speeding_severity` | CREATE TYPE | TripAssignmentSubjectType | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260425000000_retire_user_assignment_and_speeding_severity` | DROP COLUMN | trip_driving_impact | speeding_severity_score | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260609000000_autovacuum_tuning` | ALTER TABLE SET | vehicle_trip_tracking_runs | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260609000000_autovacuum_tuning` | ALTER TABLE SET | trip_repairs | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260609000000_autovacuum_tuning` | ALTER TABLE SET | vehicle_trip_waypoints | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | ADD COLUMN | vehicle_trips | trip_analysis_status | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | ADD COLUMN | vehicle_trips | analysis_queued_at | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | ADD COLUMN | vehicle_trips | analysis_started_at | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | ADD COLUMN | vehicle_trips | analysis_partial_at | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | ADD COLUMN | vehicle_trips | analysis_completed_at | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | ADD COLUMN | vehicle_trips | analysis_failed_at | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | ADD COLUMN | vehicle_trips | analysis_failed_reason | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | ADD COLUMN | vehicle_trips | analysis_latency_ms | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | ADD COLUMN | vehicle_trips | analysis_stages_json | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705140000_trip_analysis_status` | CREATE INDEX | vehicle_trips | vehicle_trips_trip_analysis_status_idx | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | trip_analysis_status | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | analysis_queued_at | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | analysis_started_at | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | analysis_partial_at | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | analysis_completed_at | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | analysis_failed_at | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | analysis_failed_reason | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | analysis_latency_ms | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | analysis_stages_json | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | quality_status | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | behavior_summary_status | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | ADD COLUMN | vehicle_trips | driving_impact_status | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260705200000_trip_analysis_status_guard` | CREATE INDEX | vehicle_trips | vehicle_trips_trip_analysis_status_idx | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260708044000_trip_booking_link_source` | CREATE TYPE | TripBookingLinkSource | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260708044000_trip_booking_link_source` | ADD COLUMN | vehicle_trips | booking_link_source | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260708044000_trip_booking_link_source` | UPDATE | vehicle_trips | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716220000_tire_trip_usage_attribution` | ADD COLUMN | vehicle_trips | tire_usage_attribution_status | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716220000_tire_trip_usage_attribution` | ADD COLUMN | vehicle_trips | tire_usage_processed_at | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716220000_tire_trip_usage_attribution` | CREATE INDEX | vehicle_trips | vehicle_trips_tire_usage_attribution_status_idx | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716230000_driving_event_type_native_mapper` | ALTER TYPE | DrivingEventType | UNMAPPED_PROVIDER_EVENT | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716230000_driving_event_type_native_mapper` | ALTER TYPE | DrivingEventType | SAFETY_COLLISION | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716240000_driving_event_native_identity` | CREATE TYPE | DrivingEventTripAssignment | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716240000_driving_event_native_identity` | ADD COLUMN | driving_events | provider | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716240000_driving_event_native_identity` | ADD COLUMN | driving_events | provider_event_name | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716240000_driving_event_native_identity` | ADD COLUMN | driving_events | provider_source_id | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716240000_driving_event_native_identity` | ADD COLUMN | driving_events | provider_fingerprint | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716240000_driving_event_native_identity` | ADD COLUMN | driving_events | trip_assignment | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716240000_driving_event_native_identity` | CREATE INDEX | driving_events | driving_events_vehicle_id_trip_assignment_idx | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716240000_driving_event_native_identity` | CREATE INDEX | driving_events | driving_events_organization_id_vehicle_id_recorded_at_idx | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | primary_source | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | measured_share | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | provider_classified_share | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | reconstructed_share | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | estimated_proxy_share | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | context_only_share | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | native_event_count | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | hf_event_count | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | measurement_coverage | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | hardware_profile | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | capability_version | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | health_eligibility | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | provenance_maturity | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716250000_driving_impact_provenance` | ADD COLUMN | trip_driving_impact | provenance_version | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716260000_driving_impact_braking_provenance` | ADD COLUMN | trip_driving_impact | p95_negative_decel_measured | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716260000_driving_impact_braking_provenance` | ADD COLUMN | trip_driving_impact | p95_negative_decel_proxy | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716260000_driving_impact_braking_provenance` | ADD COLUMN | trip_driving_impact | mean_brake_energy_proxy_per_km | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716270000_driving_impact_load_components` | ADD COLUMN | trip_driving_impact | load_components_json | YES | See §4 row for object | May match final shape; downstream no-ops if already present | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716310000_driving_attribution_roles` | ADD COLUMN | vehicle_trips | booking_customer_id | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716310000_driving_attribution_roles` | ADD COLUMN | vehicle_trips | assigned_driver_id | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260716310000_driving_attribution_roles` | ADD COLUMN | vehicle_trips | actual_driver_id | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | CREATE TYPE | TripDrivingImpactAnalysisStatus | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | trip_driving_impact | authoritative_distance_km | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | trip_driving_impact | source_version | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | trip_driving_impact | source_fingerprint | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | trip_driving_impact | analysis_status | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | trip_driving_impact | calculated_at | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | trip_driving_impact | source_completeness | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | trip_driving_impact | trip_distance_km_at_source | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | ADD COLUMN | trip_driving_impact | distance_discrepancy_km | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | UPDATE | trip_driving_impact | — | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | CREATE INDEX | trip_driving_impact | trip_driving_impact_analysis_status_idx | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |
| `20260717180000_trip_driving_impact_authoritative_coverage` | CREATE INDEX | trip_driving_impact | trip_driving_impact_source_fingerprint_idx | NO | See §4 row for object | Must be absent at bootstrap predecessor | Evolves toward accepted CI-R3A.7.1 shape |

Matrix row count: **125**. Every downstream statement touching the 19 bootstrap objects or prerequisite types is classified (`UNCLASSIFIED_DOWNSTREAM_EVOLUTION_DDL_COUNT` = 0).

## 4. Nineteen-object predecessor-shape ledger

### U-BT-001 — `vehicle_trips`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-001` |
| 2 | Object name | `vehicle_trips` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260325161142_trip_architecture_refactor` |
| 6 | Every downstream migration that changes it | `20260325161142_trip_architecture_refactor`, `20260410000000_add_enrichment_status_fields`, `20260413230000_add_composite_indexes_batch_c`, `20260425000000_retire_user_assignment_and_speeding_severity`, `20260705140000_trip_analysis_status`, `20260705200000_trip_analysis_status_guard`, `20260708044000_trip_booking_link_source`, `20260716220000_tire_trip_usage_attribution`, `20260716310000_driving_attribution_roles` |
| 7 | Bootstrap-time columns | 83 columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `vehicle_trips_pkey` PRIMARY KEY |
| 12 | Foreign keys | `vehicle_trips_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | 11 indexes (enumerated below) |
| 16 | Dependency order | Create enums ['DetectionConfidence', 'TripAssignmentStatus', 'TripAssignmentSubjectType', 'TripSource', 'VehicleDetectionProfile'] before `vehicle_trips` when referenced; `vehicle_trips` must exist before `20260325161142_trip_architecture_refactor` |
| 17 | Deliberately omitted (later unguarded DDL) | columns: `actual_driver_id`, `analysis_completed_at`, `analysis_failed_at`, `analysis_failed_reason`, `analysis_latency_ms`, `analysis_partial_at`, `analysis_queued_at`, `analysis_stages_json`, `analysis_started_at`, `assigned_driver_id`, `avg_consumption_kwh_per_100km`, `avg_consumption_l_per_100km`, `avg_engine_load`, `avg_rpm`, `avg_throttle_position`, `booking_customer_id`, `booking_link_source`, `energy_confidence`, `energy_used_kwh`, `engine_temp_end_c`, `engine_temp_start_c`, `enriched_at`, `fuel_confidence`, `gap_ended`, `outside_temperature_start_c`, `trip_analysis_status`, `trip_status`; indexes: `vehicle_trips_trip_analysis_status_idx`, `vehicle_trips_trip_status_idx` |
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
| 5 | `driver_name` | text | NULL |
| 6 | `assignment_status` | "TripAssignmentStatus" | NULL |
| 7 | `assignment_subject_type` | "TripAssignmentSubjectType" | NULL |
| 8 | `assignment_subject_id` | text | NULL |
| 9 | `assigned_booking_id` | text | NULL |
| 10 | `is_private_trip` | boolean | NOT NULL DEFAULT false |
| 11 | `start_time` | timestamp(3) without time zone | NOT NULL |
| 12 | `end_time` | timestamp(3) without time zone | NULL |
| 13 | `start_latitude` | double precision | NULL |
| 14 | `start_longitude` | double precision | NULL |
| 15 | `end_latitude` | double precision | NULL |
| 16 | `end_longitude` | double precision | NULL |
| 17 | `distance_km` | double precision | NULL |
| 18 | `duration_minutes` | double precision | NULL |
| 19 | `avg_speed_kmh` | double precision | NULL |
| 20 | `max_speed_kmh` | double precision | NULL |
| 21 | `driving_score` | double precision | NULL |
| 22 | `fuel_used_liters` | double precision | NULL |
| 28 | `city_share_percent` | double precision | NULL |
| 29 | `highway_share_percent` | double precision | NULL |
| 30 | `country_share_percent` | double precision | NULL |
| 37 | `speeding_percent` | double precision | NULL |
| 38 | `max_over_speed_kmh` | double precision | NULL |
| 39 | `speeding_segments` | integer | NULL |
| 40 | `speeding_sections_json` | jsonb | NULL |
| 41 | `speeding_section_count` | integer | NULL |
| 42 | `speeding_distance_m` | integer | NULL |
| 43 | `speeding_duration_s` | integer | NULL |
| 44 | `speeding_exposure_pct` | double precision | NULL |
| 45 | `avg_over_speed_kmh` | double precision | NULL |
| 46 | `harsh_brake_count` | integer | NOT NULL DEFAULT 0 |
| 47 | `harsh_accel_count` | integer | NOT NULL DEFAULT 0 |
| 48 | `harsh_corner_count` | integer | NOT NULL DEFAULT 0 |
| 49 | `acceleration_event_count` | integer | NOT NULL DEFAULT 0 |
| 50 | `braking_event_count` | integer | NOT NULL DEFAULT 0 |
| 51 | `abuse_event_count` | integer | NOT NULL DEFAULT 0 |
| 52 | `hard_acceleration_count` | integer | NOT NULL DEFAULT 0 |
| 53 | `hard_braking_count` | integer | NOT NULL DEFAULT 0 |
| 54 | `full_braking_count` | integer | NOT NULL DEFAULT 0 |
| 55 | `total_acceleration_events` | integer | NOT NULL DEFAULT 0 |
| 56 | `hard_acceleration_events` | integer | NOT NULL DEFAULT 0 |
| 57 | `total_braking_events` | integer | NOT NULL DEFAULT 0 |
| 58 | `hard_braking_events` | integer | NOT NULL DEFAULT 0 |
| 59 | `full_braking_events` | integer | NOT NULL DEFAULT 0 |
| 60 | `cornering_events` | integer | NOT NULL DEFAULT 0 |
| 61 | `abuse_events` | integer | NOT NULL DEFAULT 0 |
| 62 | `speeding_events` | integer | NOT NULL DEFAULT 0 |
| 63 | `possible_impact_count` | integer | NOT NULL DEFAULT 0 |
| 64 | `kickdown_count` | integer | NOT NULL DEFAULT 0 |
| 65 | `cold_engine_abuse_count` | integer | NOT NULL DEFAULT 0 |
| 66 | `long_idle_count` | integer | NOT NULL DEFAULT 0 |
| 67 | `abuse_score` | double precision | NULL |
| 68 | `behavior_summary_json` | jsonb | NULL |
| 69 | `behavior_enriched_at` | timestamp(3) without time zone | NULL |
| 70 | `behavior_enrichment_status` | text | NULL |
| 71 | `behavior_enrichment_attempts` | integer | NOT NULL DEFAULT 0 |
| 72 | `behavior_enrichment_error` | text | NULL |
| 73 | `behavior_enrichment_started_at` | timestamp(3) without time zone | NULL |
| 74 | `driving_impact_computed_at` | timestamp(3) without time zone | NULL |
| 75 | `detection_profile` | "VehicleDetectionProfile" | NULL |
| 76 | `start_detection_mode` | text | NULL |
| 77 | `end_detection_mode` | text | NULL |
| 78 | `start_confidence` | "DetectionConfidence" | NULL |
| 79 | `end_confidence` | "DetectionConfidence" | NULL |
| 80 | `possible_start_at` | timestamp(3) without time zone | NULL |
| 81 | `possible_end_at` | timestamp(3) without time zone | NULL |
| 82 | `first_activity_at` | timestamp(3) without time zone | NULL |
| 83 | `last_activity_at` | timestamp(3) without time zone | NULL |
| 84 | `route_tracking_started_at` | timestamp(3) without time zone | NULL |
| 85 | `driving_tracking_started_at` | timestamp(3) without time zone | NULL |
| 86 | `raw_detection_meta` | jsonb | NULL |
| 89 | `trip_source` | "TripSource" | NOT NULL DEFAULT 'V2_LIVE'::"TripSource" |
| 90 | `is_repaired` | boolean | NOT NULL DEFAULT false |
| 91 | `merge_parent_trip_id` | text | NULL |
| 92 | `quality_status` | text | NULL |
| 93 | `behavior_summary_status` | text | NULL |
| 94 | `driving_impact_status` | text | NULL |
| 95 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| 106 | `tire_usage_attribution_status` | text | NULL |
| 107 | `tire_usage_processed_at` | timestamp(3) without time zone | NULL |

#### Predecessor indexes

- `vehicle_trips_assigned_booking_id_idx` btree ()
- `vehicle_trips_assignment_status_is_private_trip_idx` btree ()
- `vehicle_trips_assignment_subject_type_assignment_subject_id_idx` btree ()
- `vehicle_trips_behavior_enrichment_status_idx` btree ()
- `vehicle_trips_dimo_segment_id_key` btree ()
- `vehicle_trips_pkey` btree ()
- `vehicle_trips_start_time_idx` btree ()
- `vehicle_trips_tire_usage_attribution_status_idx` btree ()
- `vehicle_trips_trip_source_idx` btree ()
- `vehicle_trips_vehicle_id_idx` btree ()
- `vehicle_trips_vehicle_id_start_time_idx` btree ()

### U-BT-002 — `driving_events`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-002` |
| 2 | Object name | `driving_events` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260331000000_v3_hardware_type` |
| 6 | Every downstream migration that changes it | `20260331000000_v3_hardware_type`, `20260413230000_add_composite_indexes_batch_c`, `20260716240000_driving_event_native_identity` |
| 7 | Bootstrap-time columns | 17 columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `driving_events_pkey` PRIMARY KEY |
| 12 | Foreign keys | `driving_events_trip_id_fkey` FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id) ON UPDATE CASCADE ON DELETE SET NULL; `driving_events_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | 7 indexes (enumerated below) |
| 16 | Dependency order | Create enum `DrivingEventType` before `driving_events`; `driving_events` must exist before `20260331000000_v3_hardware_type`; do not reference `DrivingEventSource`, `DrivingEventTripAssignment` or `organization_id` at bootstrap |
| 17 | Deliberately omitted (later unguarded DDL) | columns: `metadata_json`, `organization_id`, `source`; indexes: `driving_events_source_idx` |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **NO** |
| 20 | Repository evidence | accepted JSON; master audit Appendix A; migration SQL ≥ `20260325161142` |
| 21 | Unresolved authority | none |

#### Predecessor columns

| Ord | Column | Type | Nullability / default |
|-----|--------|------|----------------------|
| 1 | `id` | text | NOT NULL |
| 2 | `vehicle_id` | text | NOT NULL |
| 4 | `event_type` | "DrivingEventType" | NOT NULL |
| 6 | `severity` | double precision | NOT NULL DEFAULT 0 |
| 7 | `latitude` | double precision | NULL |
| 8 | `longitude` | double precision | NULL |
| 9 | `speed_kmh` | double precision | NULL |
| 10 | `delta_kmh` | double precision | NULL |
| 11 | `duration_ms` | integer | NULL |
| 12 | `driver_name` | text | NULL |
| 13 | `trip_id` | text | NULL |
| 15 | `recorded_at` | timestamp(3) without time zone | NOT NULL |
| 16 | `created_at` | timestamp(3) without time zone | NOT NULL DEFAULT CURRENT_TIMESTAMP |
| 17 | `provider` | text | NULL |
| 18 | `provider_event_name` | text | NULL |
| 19 | `provider_source_id` | text | NULL |
| 20 | `provider_fingerprint` | text | NULL |
| 21 | `trip_assignment` | "DrivingEventTripAssignment" | NOT NULL DEFAULT 'UNASSIGNED'::"DrivingEventTripAssignment" |

#### Predecessor indexes

- `driving_events_event_type_idx` btree ()
- `driving_events_org_provider_fingerprint` btree ()
- `driving_events_organization_id_vehicle_id_recorded_at_idx` btree ()
- `driving_events_pkey` btree ()
- `driving_events_recorded_at_idx` btree ()
- `driving_events_trip_id_event_type_idx` btree ()
- `driving_events_trip_id_idx` btree ()
- `driving_events_vehicle_id_idx` btree ()
- `driving_events_vehicle_id_recorded_at_idx` btree ()
- `driving_events_vehicle_id_trip_assignment_idx` btree ()

### U-BT-003 — `trip_behavior_events`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-003` |
| 2 | Object name | `trip_behavior_events` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260413230000_add_composite_indexes_batch_c` |
| 6 | Every downstream migration that changes it | `20260413230000_add_composite_indexes_batch_c` |
| 7 | Bootstrap-time columns | 20 columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `trip_behavior_events_pkey` PRIMARY KEY |
| 12 | Foreign keys | `trip_behavior_events_trip_id_fkey` FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id) ON UPDATE CASCADE ON DELETE CASCADE; `trip_behavior_events_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | 6 indexes (enumerated below) |
| 16 | Dependency order | Create enums ['BehaviorEventCategory', 'BehaviorEventClassification'] before `trip_behavior_events` when referenced; `trip_behavior_events` must exist before `20260413230000_add_composite_indexes_batch_c` |
| 17 | Deliberately omitted (later unguarded DDL) | columns: none; indexes: none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
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

- `trip_behavior_events_event_category_idx` btree ()
- `trip_behavior_events_pkey` btree ()
- `trip_behavior_events_started_at_idx` btree ()
- `trip_behavior_events_trip_id_event_category_idx` btree ()
- `trip_behavior_events_trip_id_idx` btree ()
- `trip_behavior_events_vehicle_id_idx` btree ()

### U-BT-004 — `vehicle_trip_waypoints`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-004` |
| 2 | Object name | `vehicle_trip_waypoints` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260609000000_autovacuum_tuning` |
| 6 | Every downstream migration that changes it | `20260609000000_autovacuum_tuning` |
| 7 | Bootstrap-time columns | 7 columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `vehicle_trip_waypoints_pkey` PRIMARY KEY |
| 12 | Foreign keys | `vehicle_trip_waypoints_trip_id_fkey` FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | 3 indexes (enumerated below) |
| 16 | Dependency order | Create enums [] before `vehicle_trip_waypoints` when referenced; `vehicle_trip_waypoints` must exist before `20260609000000_autovacuum_tuning` |
| 17 | Deliberately omitted (later unguarded DDL) | columns: none; indexes: none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
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

- `vehicle_trip_waypoints_pkey` btree ()
- `vehicle_trip_waypoints_recorded_at_idx` btree ()
- `vehicle_trip_waypoints_trip_id_idx` btree ()

### U-BT-005 — `vehicle_trip_tracking_runs`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-005` |
| 2 | Object name | `vehicle_trip_tracking_runs` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260609000000_autovacuum_tuning` |
| 6 | Every downstream migration that changes it | `20260609000000_autovacuum_tuning` |
| 7 | Bootstrap-time columns | 16 columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `vehicle_trip_tracking_runs_pkey` PRIMARY KEY |
| 12 | Foreign keys | `vehicle_trip_tracking_runs_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | 5 indexes (enumerated below) |
| 16 | Dependency order | Create enums ['TripDetectionState', 'TripTrackingRunType'] before `vehicle_trip_tracking_runs` when referenced; `vehicle_trip_tracking_runs` must exist before `20260609000000_autovacuum_tuning` |
| 17 | Deliberately omitted (later unguarded DDL) | columns: none; indexes: none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
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

- `vehicle_trip_tracking_runs_created_at_idx` btree ()
- `vehicle_trip_tracking_runs_pkey` btree ()
- `vehicle_trip_tracking_runs_run_type_idx` btree ()
- `vehicle_trip_tracking_runs_trip_id_idx` btree ()
- `vehicle_trip_tracking_runs_vehicle_id_idx` btree ()

### U-BT-006 — `trip_repairs`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-006` |
| 2 | Object name | `trip_repairs` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260609000000_autovacuum_tuning` |
| 6 | Every downstream migration that changes it | `20260609000000_autovacuum_tuning` |
| 7 | Bootstrap-time columns | 12 columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `trip_repairs_pkey` PRIMARY KEY |
| 12 | Foreign keys | `trip_repairs_trip_id_fkey` FOREIGN KEY (trip_id) REFERENCES vehicle_trips(id) ON UPDATE CASCADE ON DELETE SET NULL; `trip_repairs_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | 6 indexes (enumerated below) |
| 16 | Dependency order | Create enums [] before `trip_repairs` when referenced; `trip_repairs` must exist before `20260609000000_autovacuum_tuning` |
| 17 | Deliberately omitted (later unguarded DDL) | columns: none; indexes: none |
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

- `trip_repairs_created_at_idx` btree ()
- `trip_repairs_pkey` btree ()
- `trip_repairs_repair_type_idx` btree ()
- `trip_repairs_status_idx` btree ()
- `trip_repairs_trip_id_idx` btree ()
- `trip_repairs_vehicle_id_idx` btree ()

### U-BT-007 — `trip_driving_impact`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-007` |
| 2 | Object name | `trip_driving_impact` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `20260425000000_retire_user_assignment_and_speeding_severity` |
| 6 | Every downstream migration that changes it | `20260425000000_retire_user_assignment_and_speeding_severity`, `20260716250000_driving_impact_provenance`, `20260716260000_driving_impact_braking_provenance`, `20260716270000_driving_impact_load_components`, `20260717180000_trip_driving_impact_authoritative_coverage` |
| 7 | Bootstrap-time columns | 53 columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `trip_driving_impact_pkey` PRIMARY KEY |
| 12 | Foreign keys | `trip_driving_impact_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | 4 indexes (enumerated below) |
| 16 | Dependency order | Create enums [] before `trip_driving_impact` when referenced; `trip_driving_impact` must exist before `20260425000000_retire_user_assignment_and_speeding_severity` |
| 17 | Deliberately omitted (later unguarded DDL) | columns: `analysis_status`, `authoritative_distance_km`, `calculated_at`, `distance_discrepancy_km`, `source_completeness`, `source_fingerprint`, `source_version`, `trip_distance_km_at_source`; indexes: `trip_driving_impact_analysis_status_idx`, `trip_driving_impact_source_fingerprint_idx` |
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
| 36 | `primary_source` | text | NULL |
| 37 | `measured_share` | double precision | NULL |
| 38 | `provider_classified_share` | double precision | NULL |
| 39 | `reconstructed_share` | double precision | NULL |
| 40 | `estimated_proxy_share` | double precision | NULL |
| 41 | `context_only_share` | double precision | NULL |
| 42 | `native_event_count` | integer | NULL |
| 43 | `hf_event_count` | integer | NULL |
| 44 | `measurement_coverage` | double precision | NULL |
| 45 | `hardware_profile` | text | NULL |
| 46 | `capability_version` | text | NULL |
| 47 | `health_eligibility` | text | NULL |
| 48 | `provenance_maturity` | text | NULL |
| 49 | `provenance_version` | text | NULL |
| 50 | `p95_negative_decel_measured` | double precision | NULL |
| 51 | `p95_negative_decel_proxy` | double precision | NULL |
| 52 | `mean_brake_energy_proxy_per_km` | double precision | NULL |
| 53 | `load_components_json` | jsonb | NULL |

#### Predecessor indexes

- `trip_driving_impact_organization_id_vehicle_id_idx` btree ()
- `trip_driving_impact_pkey` btree ()
- `trip_driving_impact_trip_id_key` btree ()
- `trip_driving_impact_vehicle_id_trip_started_at_idx` btree ()

### U-BT-008 — `vehicle_trip_detection_states`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-008` |
| 2 | Object name | `vehicle_trip_detection_states` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `none` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time columns | 30 columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `vehicle_trip_detection_states_pkey` PRIMARY KEY |
| 12 | Foreign keys | `vehicle_trip_detection_states_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | 5 indexes (enumerated below) |
| 16 | Dependency order | Create enums ['DetectionConfidence', 'TripDetectionState', 'VehicleDetectionProfile'] before `vehicle_trip_detection_states` when referenced; `vehicle_trip_detection_states` must exist before `downstream FK migrations` |
| 17 | Deliberately omitted (later unguarded DDL) | columns: none; indexes: none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
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

- `vehicle_trip_detection_states_organization_id_idx` btree ()
- `vehicle_trip_detection_states_pkey` btree ()
- `vehicle_trip_detection_states_state_idx` btree ()
- `vehicle_trip_detection_states_vehicle_id_key` btree ()
- `vehicle_trip_detection_states_worker_locked_until_idx` btree ()

### U-BT-009 — `brake_trip_metrics`

| # | Field | Value |
|---|-------|-------|
| 1 | Atomic authority ID | `U-BT-009` |
| 2 | Object name | `brake_trip_metrics` |
| 3 | Object kind | table |
| 4 | Bootstrap insertion point | `20260325161141` |
| 5 | First downstream migration | `none` |
| 6 | Every downstream migration that changes it | none |
| 7 | Bootstrap-time columns | 11 columns (enumerated below) |
| 8 | Bootstrap-time PostgreSQL types | per-column below |
| 9 | Nullability | per-column below |
| 10 | Defaults | per-column below |
| 11 | Primary keys | `brake_trip_metrics_pkey` PRIMARY KEY |
| 12 | Foreign keys | `brake_trip_metrics_vehicle_id_fkey` FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON UPDATE CASCADE ON DELETE CASCADE |
| 13 | Unique constraints | none beyond PK |
| 14 | Check constraints | none recorded in accepted JSON |
| 15 | Indexes | 3 indexes (enumerated below) |
| 16 | Dependency order | Create enums [] before `brake_trip_metrics` when referenced; `brake_trip_metrics` must exist before `downstream FK migrations` |
| 17 | Deliberately omitted (later unguarded DDL) | columns: none; indexes: none |
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

- `brake_trip_metrics_pkey` btree ()
- `brake_trip_metrics_recorded_at_idx` btree ()
- `brake_trip_metrics_vehicle_id_idx` btree ()

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
| 17 | Deliberately omitted (later unguarded DDL) | none — predecessor **includes** retired label `ASSIGNED_USER` required by `20260425000000` RENAME/rebuild |
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
| 17 | Deliberately omitted (later unguarded DDL) | none — predecessor **includes** retired label `USER` required by `20260425000000` RENAME/rebuild |
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
| 17 | Deliberately omitted (later unguarded DDL) | `UNMAPPED_PROVIDER_EVENT`, `SAFETY_COLLISION` (added by guarded `ALTER TYPE … ADD VALUE IF NOT EXISTS` in `20260716230000_driving_event_type_native_mapper`) |
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
| 17 | Deliberately omitted (later unguarded DDL) | none |
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
| 17 | Deliberately omitted (later unguarded DDL) | none |
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
| 17 | Deliberately omitted (later unguarded DDL) | none |
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
| 17 | Deliberately omitted (later unguarded DDL) | none |
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
| 17 | Deliberately omitted (later unguarded DDL) | none |
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
| 17 | Deliberately omitted (later unguarded DDL) | none |
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
| 17 | Deliberately omitted (later unguarded DDL) | none |
| 18 | Final accepted shape source | `docs/audits/ci-recovery/ci-r3a7-production-catalog-evidence-2026-08.json` |
| 19 | Predecessor equals final shape | **YES** |
| 20 | Repository evidence | accepted JSON enum labels; master audit §6 |
| 21 | Unresolved authority | none |

## 5. Special authority

| Field | Value |
|-------|-------|
| `BRAKE_TRIP_METRICS_EXECUTABLE_DISPOSITION` | **TRANSITIONAL_BOOTSTRAP_REQUIRED** |
| `U043_PRODUCT_OWNER_DECISION` | **DEPRECATE_AND_REMOVE** (approved; not implemented) |
| `CI_R3B_IMPLEMENTATION_COUNT` | **0** |

## 6. Final status

**Status: CI_R3B01_PREDECESSOR_SHAPE_LEDGER_COMPLETED**

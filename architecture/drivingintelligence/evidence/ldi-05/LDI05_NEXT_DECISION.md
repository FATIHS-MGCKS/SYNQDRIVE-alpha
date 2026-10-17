# LDI05 — Next decision

1. If `orgRuptelaTelemetryEventTotal` > 0 but windows empty → pick a trip where `recordedAt` overlaps `VehicleTrip.start/end`.
2. If total = 0 → owner-approved read-only `dataSummary` or completed `DRIVING_NATIVE_EVENTS_INGEST` job logs for one vehicle.
3. Do not arm fusion until native stream evidenced on the **same** pin as LDI-03.

```
LDI05_RESULT=OFFLINE_PIPELINE_AND_DB_AUDIT_COMPLETE
PIPELINE_IMPLEMENTED=YES_code_paths_exist
INGESTION_VERIFIED=PARTIAL_jobs_or_hf_path_ran
NORMALIZATION_VERIFIED=CODE_ONLY_mapper_tested_not_trip_pin
PERSISTENCE_VERIFIED=YES_960_org_ruptela_rows
HISTORICAL_NATIVE_EVENTS_FOUND=960
EVENT_TRIP_ALIGNMENT=NO_EVENTS_IN_WINDOW_tripId_and_time_filter_both_empty
ROOT_CAUSE_CONFIDENCE=CONFIRMED_events_exist_but_not_in_manifest_trip_windows_or_tripId_filter
FOUR_STREAM_FUSION_READY=NO_native_stream_missing_on_all_8_pins
PRODUCTION_MUTATIONS=NONE
NEXT_SAFE_ACTION=Pin_trip_with_nonzero_TELEMETRY_EVENTS_or_run_readonly_DIMO_dataSummary_on_owner_approved_window
```
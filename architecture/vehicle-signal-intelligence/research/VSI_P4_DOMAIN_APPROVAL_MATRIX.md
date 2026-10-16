# VSI P4 — Consumer requirements domain approval matrix

| Requirement ID | Consumer | Feature | Domain owner | Approval | Max signal age | Notes |
|----------------|----------|---------|--------------|----------|----------------|-------|
| `battery_v2.lv_voltage.observed` | battery_v2 | lv_measurement_gate | battery_v2 | **PENDING** | — | Battery V2 measurement gates remain authoritative |
| `battery_v2.hv_battery_soc.observed` | battery_v2 | hv_soc_readiness | battery_v2 | **PENDING** | — | Publication gates authoritative |
| `di.vehicle_speed.gps_numeric` | driving_intelligence | exp021_trip_speed_qc | driving_intelligence | **PENDING** | — | EXP021 preserves GPS-speed QC; no DI algorithm change in P4 |
| `di.position_coordinates.observed` | driving_intelligence | exp021_position_context | driving_intelligence | **PENDING** | — | Position assessability TBD |
| `di.accelerator_pedal_position.observed` | driving_intelligence | behavior_accelerator_evidence | driving_intelligence | **PENDING** | — | Listed ≠ observed; proposed speed fallback **REJECTED for activation** |
| `di.brake_pedal_position.observed` | driving_intelligence | behavior_brake_evidence | driving_intelligence | **PENDING** | — | `brake_pedal_position` not materialized in profile v2 |
| `trip.provider_source_timestamp.fresh` | trip_detection | trip_boundary_support_signals | trip_detection | **PENDING** | — | Trip FSM owns boundaries |
| `dtc.diagnostic_trouble_code.observed_or_empty` | dtc_diagnostics | dtc_snapshot_readiness | dtc_diagnostics | **PENDING** | — | No DTC algorithm change |
| `apds.profile_revision.correlation` | apds | shadow_demand_profile_read | apds | **APPROVED (contract)** | — | Read-only design; not wired to shadow path |
| `di.fixture.accelerator_with_approved_fallback` | driving_intelligence | fixture_approved_fallback | VSI_TEST_FIXTURE_ONLY | **APPROVED (fixture)** | 15 min | Test-only; no production authorization |

## Fallback chains

| Chain ID | Status | Executable in P4 V1 |
|----------|--------|---------------------|
| `vsi-fallback-fixture-domain-approved` | PRODUCTION_VALIDATED (fixture) | **No** — engine records plan only |
| `di-gps-speed-for-accelerator-proposed` | PROPOSED | No |
| `hv-soc-for-lv-voltage-proposed` | REJECTED | No |

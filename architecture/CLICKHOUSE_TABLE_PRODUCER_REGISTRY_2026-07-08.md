# ClickHouse Table Producer Registry (2026-07-08)

## Purpose

SynqDrive keeps several ClickHouse tables that exist for **future analytics** or **read-only debug** paths. They must not be interpreted as broken pipelines when empty.

PostgreSQL remains the system of record. ClickHouse is a degraded-capable analytics mirror.

## Registry

Implemented in `backend/src/modules/clickhouse/clickhouse-table-registry.ts` and exposed via `ClickHouseDiagnosticsService` (Data Analyse **CH Diagnostics** tab today).

| Table | MVP status | Producer status | Expected empty? | Write producer today | Future use |
|-------|------------|-----------------|-----------------|----------------------|------------|
| `telemetry_snapshots` | active | active | no | DimoSnapshotProcessor → ClickHouseTelemetryService | Trip repair, cadence stats |
| `telemetry_state_changes` | active | active | no | Snapshot ingest state diff | Segment detectors |
| `telemetry_hf_points` | active | active_if_hf_enabled | yes (until HF mirror on) | HfMirrorService (HF_MIRROR_ENABLED) | HF availability |
| `telemetry_hf_events` | active | active_if_hf_enabled | yes | HfMirrorService | HF event timeline |
| `telemetry_waypoints` | planned | read_only_no_producer | yes | **none** — read counts only in Data Analyse | Route replay, map geometry |
| `trip_activity_windows` | planned | planned_no_producer | yes | **none** — detector reads snapshots live | Cache ActivityWindowDetector output |
| `trip_segment_candidates` | planned | planned_no_producer | yes | **none** — detector reads state_changes live | Cache IgnitionSegmentDetector candidates |
| `telemetry_hf_windows` | planned | planned_no_producer | yes | **none** | Pre-aggregated HF KPIs |
| `schema_migrations` | internal | internal | yes | ClickHouseSchemaService | Schema versioning |

## Diagnostics semantics

- **planned** / **read_only**: empty is normal — notes say *schema exists, producer not active yet*.
- **active** + empty + `expectedEmptyAllowed=false`: **empty_active_warning** (monitor ingestion, not a crash).
- **ClickHouse down**: `degraded`, HTTP 200, no 500.

## Possible future producers (not in scope)

| Table | Candidate producer |
|-------|-------------------|
| `telemetry_waypoints` | HF/GPS mirror worker post-trip or live stream ingest |
| `trip_activity_windows` | ActivityWindowDetector persist hook after repair scan |
| `trip_segment_candidates` | IgnitionSegmentDetector persist hook |
| `telemetry_hf_windows` | Post-trip aggregation job over `telemetry_hf_points` |

No tables are dropped. No destructive migrations.

## Data Analyse boundary

Data Analyse is a **temporary internal debug** surface until MVP. CH Diagnostics reuses the registry; stable product features should move to Monitoring / Trip Detail / Vehicle Detail later.

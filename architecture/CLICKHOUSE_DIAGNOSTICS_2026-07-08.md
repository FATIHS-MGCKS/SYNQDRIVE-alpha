# Changes & Architektur — ClickHouse Diagnostics (2026-07-08)

## Changes (V4.9.257)

- `ClickHouseDiagnosticsService` — reusable read-only diagnostics (never throws; degrades when CH unavailable).
- `clickhouse-table-registry.ts` — authoritative table plan status vs producers/consumers in codebase.
- `GET /organizations/:orgId/data-analyse/clickhouse-diagnostics` — internal debug surface (Data Analyse today).
- Data Analyse: org-level **CH Diagnostics** tab — status, HF mirror flag, table matrix (no product polish).
- Tests: disabled / degraded / available wiring + table matrix (HF flag, planned_no_producer).

## Architektur

### Purpose boundary

- **PostgreSQL** = system of record.
- **ClickHouse** = analytics mirror (degraded-capable sidecar).
- **Data Analyse** = temporary internal debugging/logging until MVP; stable features migrate to Trip Detail, Vehicle Detail, Monitoring, Insights, Dashboard.
- `ClickHouseDiagnosticsService` is **not** exclusive to Data Analyse — Monitoring / vehicle surfaces can reuse it later.

### Status model

| Field | Values |
|-------|--------|
| `clickhouseStatus` | `disabled` \| `available` \| `degraded` \| `schema_error` |
| `planStatus` (registry) | `active` \| `active_if_hf_enabled` \| `read_only_no_producer` \| `planned_no_producer` \| `internal` |
| `displayStatus` (UI) | `has_data` \| `empty` \| `unavailable` \| `planned_no_producer` \| `read_only_no_producer` \| `active_if_hf_disabled` \| `active_if_hf_enabled` \| `internal` |
| `dataStatus` | `has_data` \| `empty` \| `unknown` \| `unavailable` |

`degraded=true` when configured but ping/schema fails — endpoints return **200** with honest diagnostics, not 500.

### Table classification (registry)

| Table | Plan status | Producer |
|-------|-------------|----------|
| `telemetry_snapshots` | active | DimoSnapshotProcessor → ClickHouseTelemetryService |
| `telemetry_state_changes` | active | DimoSnapshotProcessor → detectAndInsertStateChanges |
| `telemetry_hf_points` | active_if_hf_enabled | HfMirrorService (HF_MIRROR_ENABLED) |
| `telemetry_hf_events` | active_if_hf_enabled | HfMirrorService (HF_MIRROR_ENABLED) |
| `telemetry_waypoints` | read_only_no_producer | schema only — no insert path |
| `trip_activity_windows` | planned_no_producer | migration only |
| `trip_segment_candidates` | planned_no_producer | migration only |
| `telemetry_hf_windows` | planned_no_producer | migration only |
| `schema_migrations` | internal | ClickHouseSchemaService |

Empty `planned_no_producer` / `read_only_no_producer` tables are **not** surfaced as broken pipelines.

### Data flow

```
ClickHouseService.getStatus()
ClickHouseAnalyticsService.getStorageStats()  (best-effort when available)
        ↓
ClickHouseDiagnosticsService.getDiagnostics()
        ↓
DataAnalyseService.getClickHouseDiagnostics()  →  Data Analyse CH tab
(future: Monitoring / Vehicle Detail read models)
```

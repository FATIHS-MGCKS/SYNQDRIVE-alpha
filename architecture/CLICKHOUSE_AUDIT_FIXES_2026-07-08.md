# ClickHouse / Prometheus Audit Fixes (V4.9.265)

## Scope

Implements audit recommendations from 2026-07-08 review without changing PostgreSQL
canonical truth.

## ClickHouse

- **Table registry** (`clickhouse-table-registry.ts`) — authoritative producer/MVP
  classification; diagnostics never treat `planned_no_producer` empties as errors.
- **Diagnostics service** — reusable `ClickHouseDiagnosticsService`; exposed via
  `GET …/data-analyse/clickhouse-diagnostics` and Data Analyse CH Diagnostics tab.
- **Runtime reconnect** — `ClickHouseService` pings every 60s; mirror writes call
  `markUnavailable()` on failure (periodic ping may restore).
- **Post-trip producers** (all flag-gated, default off except trip assist):
  - `HF_MIRROR_ENABLED` → hf_points, hf_events, hf_windows
  - `WAYPOINT_MIRROR_ENABLED` → telemetry_waypoints (PG waypoints, 30s downsample)
  - `ACTIVITY_WINDOW_MIRROR_ENABLED` → trip_activity_windows
- **Read-only evidence** — `TripEvidenceReadService`, `SignalQualityReadService`
  for trip detail / diagnostics (no final scores written to CH).

## Trip assist exception (documented)

`CLICKHOUSE_TRIP_ASSIST_ENABLED` (default **true**) gates guarded CH-assisted trip
start/continuity/repair. Set `false` to disable CH influence on PostgreSQL trip FSM.

See `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md`.

## Prometheus / Metrics

- `METRICS_BEARER_TOKEN` required in production **and** staging.
- Local dev only: `METRICS_ALLOW_OPEN_IN_DEV=true` + `NODE_ENV=development`.
- Dead reconciliation/quality metrics now instrumented.

## Ops scripts

- `npm run clickhouse:ping:url` — URL-based ping (no Docker required).
- Docker backup/restore scripts renamed `:docker` in package.json aliases.

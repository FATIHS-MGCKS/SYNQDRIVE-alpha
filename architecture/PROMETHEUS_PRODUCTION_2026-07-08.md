# Prometheus Production Monitoring (V4.9.264)

**Date:** 2026-07-08  
**Scope:** Infrastructure observability only — no business entity labels.

## Endpoint

- `GET /api/v1/metrics` — Prometheus text format
- Guard: `MetricsAuthGuard` + `METRICS_BEARER_TOKEN` (503 in production when unset)
- Removed from JWT `PUBLIC_EXACT_PATHS` — not anonymously reachable

## New metrics

| Metric | Type | Labels |
|--------|------|--------|
| `synqdrive_clickhouse_query_duration_seconds` | histogram | `query_type` |
| `synqdrive_clickhouse_schema_status` | gauge | numeric code |
| `synqdrive_clickhouse_migration_failures_total` | counter | — |
| `synqdrive_hf_mirror_enabled` | gauge | — |
| `synqdrive_clickhouse_table_rows` | gauge | `table`, `status` |
| `synqdrive_metrics_endpoint_requests_total` | counter | `result` |
| `synqdrive_queue_failed_jobs` | gauge | `queue` |
| `synqdrive_dimo_snapshot_poll_total` | counter | `result` |

## Repo artifacts

- `backend/monitoring/prometheus/prometheus.yml.example`
- `backend/monitoring/prometheus/prometheus.vps.yml` — PM2 host scrape (`127.0.0.1:3001`)
- `backend/monitoring/prometheus/alerts.yml`
- `backend/docs/prometheus-production.md`
- `backend/scripts/ops/vps-setup-prometheus.sh`
- Docker Compose profile `monitoring` (optional, localhost Prometheus UI)

## Production VPS (V4.9.266)

| Item | Value |
|------|--------|
| Container | `synqdrive-prometheus` (Docker, `--network host`) |
| UI | `http://127.0.0.1:9090` (localhost only) |
| Scrape target | `127.0.0.1:3001/api/v1/metrics` + bearer token file |
| Config dir | `/opt/synqdrive/shared/prometheus/` |
| Refresh | `bash /opt/synqdrive/current/backend/scripts/ops/vps-setup-prometheus.sh` |

Mirror flags on prod (`backend.env`): `HF_MIRROR_ENABLED`, `WAYPOINT_MIRROR_ENABLED`,
`ACTIVITY_WINDOW_MIRROR_ENABLED` — enabled via `vps-enable-clickhouse-mirrors.sh`.

## Explicit non-goals

- No vehicle/trip/org/customer IDs as metric labels
- Prometheus not required for app startup
- No Alertmanager wiring in-repo (rules only)

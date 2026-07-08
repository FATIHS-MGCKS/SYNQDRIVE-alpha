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
- `backend/monitoring/prometheus/alerts.yml`
- `backend/docs/prometheus-production.md`
- Docker Compose profile `monitoring` (optional, localhost Prometheus UI)

## Explicit non-goals

- No vehicle/trip/org/customer IDs as metric labels
- Prometheus not required for app startup
- No Alertmanager wiring in-repo (rules only)

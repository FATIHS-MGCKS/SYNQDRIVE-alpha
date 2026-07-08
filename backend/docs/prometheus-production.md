# Prometheus production monitoring (SynqDrive)

Optional operational monitoring for the NestJS backend. **PostgreSQL remains
canonical** — Prometheus carries infrastructure signals only, never business
entities (no vehicle/trip/org/customer labels).

## Metrics endpoint

| Item | Value |
|------|--------|
| Path | `GET /api/v1/metrics` |
| Format | Prometheus text exposition 0.0.4 |
| Auth | `Authorization: Bearer <METRICS_BEARER_TOKEN>` (dedicated metrics token — **not** a user JWT) |

### Security

1. Set `METRICS_BEARER_TOKEN` in production (long random secret).
2. When unset in **production** (`NODE_ENV=production`), `/metrics` returns **503**.
3. `/api/v1/metrics` bypasses the user JWT guard but is **not** anonymous: `MetricsAuthGuard` requires the metrics bearer token.
4. Scrape from an **internal network** only (VPC, Tailscale, docker bridge). Do not expose port 3000 metrics publicly.

## Environment variables

```bash
# Required in production for scraping
METRICS_BEARER_TOKEN=change-me-long-random-secret

# Existing operational flags (surfaced as gauges)
HF_MIRROR_ENABLED=true   # → synqdrive_hf_mirror_enabled
CLICKHOUSE_URL=...       # → synqdrive_clickhouse_configured / _available
```

## Files

| File | Purpose |
|------|---------|
| `monitoring/prometheus/prometheus.yml.example` | Example scrape config |
| `monitoring/prometheus/alerts.yml` | Alert rule definitions |

### Deploy Prometheus

1. Copy `prometheus.yml.example` → `prometheus.yml`.
2. Create bearer token file readable by Prometheus:
   `echo -n "$METRICS_BEARER_TOKEN" > /etc/prometheus/secrets/metrics_bearer_token`
3. Point `static_configs.targets` at your internal backend host.
4. Mount `alerts.yml` as documented in the example config.

## Local optional stack

Prometheus is **not** started by default `npm run infra:up`.

```bash
cd backend
docker compose --profile monitoring up -d prometheus
```

Prometheus UI: `http://127.0.0.1:9090` (localhost bind only).

Create `backend/monitoring/prometheus/secrets/metrics_bearer_token` before starting the profile, or set `METRICS_BEARER_TOKEN` in `backend/.env` and copy it into the secrets file.

## Key metrics (low cardinality)

| Metric | Type | Labels |
|--------|------|--------|
| `synqdrive_clickhouse_query_duration_seconds` | histogram | `query_type` |
| `synqdrive_clickhouse_schema_status` | gauge | — (0=disabled, 1=degraded, 2=schema_error, 3=available) |
| `synqdrive_clickhouse_migration_failures_total` | counter | — |
| `synqdrive_hf_mirror_enabled` | gauge | — |
| `synqdrive_clickhouse_table_rows` | gauge | `table`, `status` |
| `synqdrive_metrics_endpoint_requests_total` | counter | `result` |
| `synqdrive_queue_failed_jobs` | gauge | `queue` |
| `synqdrive_dimo_snapshot_poll_total` | counter | `result` |

Existing trip/queue/CH mirror metrics remain unchanged.

## Alerting

See `monitoring/prometheus/alerts.yml`. Wire Alertmanager in your platform — this repo ships rule definitions only.

## Validation

```bash
cd backend
npm test -- --testPathPattern="metrics-auth|trip-metrics.labels|prometheus-config"
# Optional if promtool is installed:
promtool check config monitoring/prometheus/prometheus.yml.example
promtool check rules monitoring/prometheus/alerts.yml
```

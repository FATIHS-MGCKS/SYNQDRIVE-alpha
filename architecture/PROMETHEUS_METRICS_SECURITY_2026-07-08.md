# Prometheus Metrics Endpoint Security

**Stand:** 2026-07-08

## Scope

`GET /api/v1/metrics` — application observability (trip lifecycle, ClickHouse mirror health, queues). **Not** business data storage.

## Protection model

| Layer | Mechanism |
|-------|-----------|
| Application | `MetricsAccessGuard` — `METRICS_ENABLED`, `METRICS_REQUIRE_TOKEN`, `METRICS_TOKEN`, optional `METRICS_ALLOWED_IPS` |
| Network | Reverse proxy IP allowlist / internal-only scrape (recommended in production) |
| Auth | Scrape token (Bearer or `X-Metrics-Token`), **not** JWT user sessions |

## Defaults

| Environment | `METRICS_REQUIRE_TOKEN` default |
|-------------|--------------------------------|
| `NODE_ENV=development` | `false` (curl-friendly) |
| `NODE_ENV=production` | `true` (fail-closed without `METRICS_TOKEN`) |

`METRICS_ENABLED=false` → **404** (endpoint hidden).

## Label policy

Forbidden labels: `vehicle_id`, `vin`, `booking_id`, `customer_id`, `trip_id`, `org_id`.

Enforced by `trip-metrics.labels.spec.ts`.

## Documentation

`backend/docs/prometheus-metrics-security.md` — Nginx/Cloudflare/Traefik notes + Prometheus scrape config.

# Prometheus `/api/v1/metrics` — Security & Scraping

> **Related:** `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md` (Prometheus = ops/health only; no entity-id labels).

## Overview

SynqDrive exposes application metrics at:

```
GET /api/v1/metrics
```

Content-Type: `text/plain; version=0.0.4; charset=utf-8`

The endpoint is **not** protected by JWT user sessions. Scrapers authenticate via **environment-controlled** settings (`MetricsAccessGuard`).

**Never expose this route publicly without protection.**

---

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `METRICS_ENABLED` | `true` | When `false`, `/metrics` returns **404** (endpoint hidden) |
| `METRICS_REQUIRE_TOKEN` | `false` in dev, **`true` in production** (`NODE_ENV=production`) | Require scrape token |
| `METRICS_TOKEN` | _(unset)_ | Shared secret for Prometheus / internal scrapers |
| `METRICS_ALLOWED_IPS` | _(empty)_ | Optional comma-separated allowlist (e.g. `127.0.0.1,::1,10.0.0.5`) |

### Local development (typical)

```bash
METRICS_ENABLED=true
METRICS_REQUIRE_TOKEN=false
# curl http://localhost:3001/api/v1/metrics
```

### Production (recommended)

```bash
METRICS_ENABLED=true
METRICS_REQUIRE_TOKEN=true
METRICS_TOKEN=<long-random-secret>
# Optional extra belt: METRICS_ALLOWED_IPS=127.0.0.1,::1
```

If `METRICS_REQUIRE_TOKEN=true` but `METRICS_TOKEN` is empty, the endpoint **fail-closes** (403 for all scrapes) and logs a startup warning.

---

## Scraper authentication

When `METRICS_REQUIRE_TOKEN=true`, send the token using **either**:

1. `Authorization: Bearer <METRICS_TOKEN>`
2. `X-Metrics-Token: <METRICS_TOKEN>`

### Prometheus `scrape_config` example

```yaml
scrape_configs:
  - job_name: synqdrive-backend
    metrics_path: /api/v1/metrics
    scheme: https
    static_configs:
      - targets: ['app.synqdrive.eu']
    authorization:
      type: Bearer
      credentials: '<METRICS_TOKEN>'
```

Alternative with custom header (if your Prometheus version supports `http_headers`):

```yaml
    http_headers:
      X-Metrics-Token:
        values: ['<METRICS_TOKEN>']
```

---

## Reverse proxy / deployment

`/api/v1/metrics` must **not** be publicly reachable without controls.

### Recommended patterns

| Pattern | Notes |
|---------|--------|
| **Bind scraper to localhost** | Prometheus on same host as backend → `127.0.0.1` only |
| **Internal network** | Scrape via private VPC / Tailscale; block public ingress |
| **IP allowlist** | `METRICS_ALLOWED_IPS` + proxy that sets trusted `X-Forwarded-For` |
| **Token required** | `METRICS_REQUIRE_TOKEN=true` + strong `METRICS_TOKEN` |
| **Disable externally** | `METRICS_ENABLED=false` on internet-facing instances if metrics collected elsewhere |

### Nginx example (block public, allow internal)

```nginx
location /api/v1/metrics {
    allow 10.0.0.0/8;
    allow 127.0.0.1;
    deny all;
    proxy_pass http://127.0.0.1:3001;
}
```

### Cloudflare

Do **not** publish `/api/v1/metrics` through Cloudflare to the internet. Use a WAF rule to block the path, or scrape only on origin/private network.

### Traefik

Use `IPWhiteList` middleware or route metrics only on an internal entrypoint.

---

## Label cardinality policy

**Forbidden** Prometheus labels (never add):

- `vehicle_id`, `vin`, `booking_id`, `customer_id`, `trip_id`, `org_id`

**Allowed** low-cardinality examples already in use:

- `table`, `result`, `query`, `profile`, `detector`, `phase`, `path`, `status`, `queue`, `reason`, `tier`, `bucket`

`vehicle_profile` (EV / ICE / HYBRID / UNKNOWN) is a **detection profile enum**, not a per-vehicle id.

Unit test: `trip-metrics.labels.spec.ts`

---

## Disabling metrics entirely

```bash
METRICS_ENABLED=false
```

Returns **404** for `/api/v1/metrics`. In-process metric collection for logs/debug may still run; only the HTTP export is disabled.

---

## Operational checks

```bash
# Dev (no token)
curl -sS "http://localhost:3001/api/v1/metrics" | head

# Prod-style (token required)
curl -sS -H "Authorization: Bearer $METRICS_TOKEN" \
  "https://app.synqdrive.eu/api/v1/metrics" | head
```

Health/readiness (`GET /api/v1/health/readiness`) remains separate and is not a substitute for Prometheus scraping.

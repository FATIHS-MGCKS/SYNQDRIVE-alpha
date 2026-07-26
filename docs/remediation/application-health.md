# Application Health — Phase 2F.5

**Date:** 2026-07-26  
**Status:** Implemented  
**Scope:** Deterministic, fast, meaningful health probes for all critical application dependencies

---

## Executive summary

Phase 2F.5 replaces shallow or indirect health signals with **real dependency probes** exposed via three public endpoints and Prometheus gauges (`synqdrive_dependency_up`).

| Endpoint | Purpose | I/O |
|----------|---------|-----|
| `GET /api/v1/health` | **Liveness** — process alive | None |
| `GET /api/v1/health/readiness` | **Readiness** — hard deps for routing | Parallel probes, ≤3s each |
| `GET /api/v1/health/dependencies` | **Full application health** | All integrations |

**No fake health checks:** every probe performs a real operation (SQL, PING, API call, storage headBucket, BullMQ metadata read, etc.) or is explicitly `skipped` when the integration is not configured.

---

## Dependency matrix

| Dependency | Probe | Required (readiness) | Skipped when |
|------------|-------|----------------------|--------------|
| **API** | Process uptime / Node version | No | Never |
| **Postgres** | `SELECT 1` via Prisma | **Yes** | Never |
| **Redis** | `PING` → `PONG` | **Yes** | Never |
| **ClickHouse** | Live `client.ping()` | No | `CLICKHOUSE_URL` unset |
| **Queue** | BullMQ `getJobCounts` on `notification.evaluation` | **Yes** | Workers disabled |
| **Workers** | `WORKERS_ENABLED` + Redis major ≥ 5 | **Yes** | Never |
| **DIMO** | `DimoAuthService.getHealthSnapshot()` developer JWT | No | No `DIMO_CLIENT_ID` / key |
| **Stripe** | `balance.retrieve()` | No | No `STRIPE_SECRET_KEY` |
| **AI** | Mistral `models.list()` when configured | No | No `MISTRAL_API_KEY` |
| **Notification Engine** | BullMQ probes on evaluation + delivery queues | No | `NOTIFICATIONS_V2=false` |
| **Storage** | `DocumentStorageHealthService.checkHealth()` (local R/W or S3 HeadBucket) | No | Module unavailable |
| **Document Extraction** | `DocumentExtractionHealthService.getHealth()` | **Yes** (when queue enabled) | Queue disabled → ok |

### Readiness HTTP semantics

- **200** — all hard dependencies healthy (`ready: true`)
- **503** — hard dependency failure (`ready: false`, `status: degraded`)

Hard dependencies: `postgres`, `redis`, `workers`, `queue`, `documentExtraction` (degraded doc-extract does not block).

---

## Implementation

### Module layout

```
backend/src/modules/health/
├── application-health.module.ts   # Probe service wiring (no Observability import)
├── application-health.service.ts  # All dependency probes
├── application-health.service.spec.ts
├── dependency-health.types.ts
├── health-probe.util.ts           # withProbeTimeout (default 3s)
├── health.controller.ts
├── health.service.ts              # Readiness + legacy checks map
└── health.module.ts
```

`ClickHouseService.probeConnectivity()` adds a **live ping** path separate from cached status.

### Prometheus

**Gauge:** `synqdrive_dependency_up{dependency="<key>"}`  
- `1` = probe `ok`  
- `0` = `error` or `degraded`  
- No sample when `skipped` (optional integration off)

Refreshed every **30s** by `MetricsRefreshService.refreshDependencyUpGauges()`.

**Alerts:** `backend/monitoring/prometheus/alerts-app-health.yml` (11 rules)

Loaded by:
- `prometheus.vps.yml`
- `prometheus.yml.example`
- `docker-compose.yml` (monitoring profile)

---

## Probe details (no fakes)

### API
Returns uptime and Node version only — no external calls. Confirms the HTTP stack is serving.

### Postgres
```sql
SELECT 1
```
Fails on connection pool exhaustion, auth failure, or DB down.

### Redis
`PING` must return exactly `PONG`.

### ClickHouse
When configured: bounded `client.ping()` via `withQueryTimeout`.  
`schema_error` → `degraded` (reachable but migrations failed).  
Unconfigured → `skipped` (not a fault).

### Queue / Workers
- **Queue:** BullMQ broker read via `getJobCounts` — proves Redis keys for queues are accessible.
- **Workers:** Bootstrap flag `WORKERS_ENABLED` plus Redis `INFO server` major version ≥ 5 (BullMQ requirement).

### DIMO
Uses in-process token health snapshot (not a blind “configured=true”):
- `VALID` → ok
- `NEVER_ACQUIRED` → degraded (cold start)
- `ERROR` / `EXPIRED` → error

### Stripe
When `STRIPE_SECRET_KEY` set: `stripe.balance.retrieve()` with 2.5s timeout.

### AI
When LLM configured: Mistral `models.list()` with 2.5s timeout.  
Configuration-only checks are **not** used as success signals.

### Notification Engine
When `NOTIFICATIONS_V2=true`:
- Workers must be enabled
- Parallel `getJobCounts` on `notification.evaluation` and `notification.delivery`

### Storage
Delegates to storage port `checkHealth()`:
- **Local:** mkdir + read/write access on base + quarantine dirs
- **S3:** `HeadBucket`

### Document Extraction
Existing composite health (queue, OCR, AI extraction, storage) — unchanged semantics, now part of unified report.

---

## Operations

### Manual verification

```bash
curl -s https://app.synqdrive.eu/api/v1/health | jq .
curl -s https://app.synqdrive.eu/api/v1/health/readiness | jq .
curl -s https://app.synqdrive.eu/api/v1/health/dependencies | jq .
```

### VPS deploy health gate

`vps-deploy-release.sh` uses **liveness** only (`/api/v1/health`). Use **readiness** for load balancer / orchestrator routing decisions.

### Master Admin

`GET /api/v1/admin/platform-health` continues to aggregate readiness via `HealthService.checkReadiness()`.

---

## Performance budget

| Constraint | Value |
|------------|-------|
| Per-probe timeout | 3s default (`health-probe.util.ts`) |
| Stripe / AI timeout | 2.5s |
| Full `/dependencies` | Parallel `Promise.all` — wall clock ≈ slowest probe, not sum |
| Metrics refresh | Same service, 30s cron — acceptable for Stripe/AI at this interval |

---

## Related docs

- `docs/remediation/observability-architecture.md` — Phase 2F.1 audit
- `docs/remediation/worker-observability.md` — Phase 2F.4 queue metrics
- `architecture/MASTER_ADMIN_APPLICATION_HEALTH_2026-07-26.md`

---

## Files changed (reference)

| Area | Files |
|------|-------|
| Health module | `backend/src/modules/health/*` |
| ClickHouse | `clickhouse.service.ts` — `probeConnectivity()` |
| Stripe | `stripe-billing.service.ts` — `probeApiConnectivity()` |
| Metrics | `trip-metrics.service.ts`, `metrics-refresh.service.ts` |
| Alerts | `alerts-app-health.yml`, Prometheus configs |
| Documents | `documents.module.ts` — exports `DocumentStorageHealthService` (already listed) |

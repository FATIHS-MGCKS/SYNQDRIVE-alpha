# Master Admin Remediation — Phase 2G.4 — Platform Load Validation

**Date:** 2026-07-26  
**Scope:** Platform load analysis across API, PostgreSQL, ClickHouse, Redis, BullMQ, Rental Dashboard, Monitoring, and Master Admin control plane.  
**Branch:** `cursor/master-admin-load-validation-2g4-b5f0`  
**Verdict:** **Conditional acceptance** — synthetic scale suites and production health probes pass; **no HTTP load generator (k6/Artillery) in repo**; CPU/RAM under sustained load **not measured** in this run.

---

## 1. Executive summary

| Layer | Validation method | Result |
|-------|-------------------|--------|
| **API (liveness)** | 20 concurrent `GET /health` against production | p50 **302 ms**, p95 **321 ms**, all 200 |
| **API (readiness)** | Single prod probe + dependency timings | All hard checks **ok** |
| **PostgreSQL** | Readiness `SELECT 1` | **4 ms** (prod snapshot) |
| **Redis** | Readiness `PING` | **1 ms** (prod snapshot) |
| **ClickHouse** | Readiness + storage stats | **13 ms** probe; **813k rows** / **3.7 MB** compressed |
| **BullMQ** | Code review + queue thresholds + readiness workers | Workers enabled; document queue **0 waiting/active** |
| **Dashboard (Fleet Health)** | Frontend + backend scale Jest suites | **37 tests pass** (100–5000 vehicles) |
| **Notifications** | In-memory load harness | **16/16** scenarios; 10k ingest p99 **0.89 ms** |
| **Monitoring** | Prometheus config tests | **10/10 pass** |
| **Master Admin** | Architecture + `/admin/*` auth probe | 401 unauthenticated; monitoring aggregates queues + health |
| **CPU / RAM** | — | **Not captured** (no VPS SSH / no load driver) |
| **Concurrent bookings / DIMO HTTP flood** | — | **Not executed** (no staging creds, no k6) |

### Final verdict

The platform has **documented scale budgets**, **automated synthetic benchmarks**, and **production dependency health** consistent with normal operation. **Full load sign-off** requires staging k6/Artillery runs with concurrent orgs, vehicles, users, bookings, and DIMO webhook replay — not available in the Cloud Agent environment.

---

## 2. Test methodology

### 2.1 What was executed (2026-07-26)

```bash
# Notification engine — 16 load/resilience scenarios (in-memory harness)
cd backend && NOTIFICATION_LOAD_REPORT=1 npm test -- notification-load-resilience

# Fleet health scale — backend Prisma read budget
cd backend && npm test -- rental-health-fleet.scale

# Fleet health scale — frontend CPU/URL/memory budgets
cd frontend && npm test -- fleet-rental-health-pagination.scale fleet-condition-pipeline.scale \
  fleet-health-service.view-model.scale useVehicleHealth.scale

# Observability config gate
cd backend && npm test -- --testPathPattern="prometheus-config|metrics-auth|trip-metrics"

# Production probes (unauthenticated, light concurrency)
for i in $(seq 1 20); do curl -s -o /dev/null -w "%{time_total}\n" \
  https://app.synqdrive.eu/api/v1/health & done; wait
curl -s https://app.synqdrive.eu/api/v1/health/readiness
```

### 2.2 What was not executed

| Gap | Reason |
|-----|--------|
| Docker local stack (`npm run infra:up`) | No Docker daemon in Cloud Agent VM |
| k6 / Artillery HTTP load tests | **Not present in repository** |
| Sustained CPU/RAM sampling | No VPS SSH / no `node_exporter` scrape from agent |
| Authenticated Master Admin dashboard under load | No platform JWT |
| Concurrent booking creates (100+) | Documented manual matrix only |
| DIMO webhook burst replay | Requires `DIMO_WEBHOOK_VERIFICATION_TOKEN` + staging |

---

## 3. Component analysis

### 3.1 API

| Endpoint | Auth | Prod measurement | Notes |
|----------|------|------------------|-------|
| `GET /api/v1/health` | Public | p50 **302 ms**, p95 **321 ms** (n=20 concurrent) | Includes TLS + CDN latency |
| `GET /api/v1/health/readiness` | Public | **308 ms** total; per-check ms below | Hard: postgres, redis, workers, document-extraction |
| `GET /api/v1/admin/*` | `MASTER_ADMIN` | **401** without JWT | Verified in 2G.2 |
| `GET /api/v1/metrics` | Bearer token | Not probed | `METRICS_BEARER_TOKEN` required on prod |

**Readiness dependency timings (production snapshot 2026-07-26T14:44:25Z):**

| Check | Status | responseMs |
|-------|--------|------------|
| postgres | ok | 4 |
| redis | ok | 1 |
| clickhouse | ok | 13 |
| workers | ok | 0 |
| documentExtraction | ok | 1 |

**Documented SLO thresholds (Prometheus `alerts.yml`):**

| Alert | Threshold |
|-------|-----------|
| `QueueLagHigh` | p95 queue lag > **300 s** for 10m |
| `EvaluationsApiLatencyP95High` | p95 > **2 s** for 10m |
| `EvaluationsApiLatencyP95Critical` | p95 > **5 s** for 10m |
| Fleet health rental page p99 | Documented **< 8 s** (15m window) |

### 3.2 PostgreSQL (primary SoT)

| Dimension | Finding |
|-----------|---------|
| Role | Canonical store for orgs, users, vehicles, bookings, trips, billing |
| Fleet health API | **Exactly 3 Prisma reads per fleet page** (`count`, `groupBy`, `findMany`) regardless of fleet size — verified `rental-health-fleet.scale.spec.ts` at 100 / 500 / 1000 / 5000 vehicles |
| Page size cap | **50 vehicles** per `GET .../rental-health/fleet` request |
| Readiness | `SELECT 1` in **4 ms** on prod |
| Bottleneck risk | Master Admin dashboard runs **12 parallel `count`/`findMany` queries** (`PlatformAdminService.getDashboardStats`) — acceptable at current scale; may need caching at 10k+ orgs |

### 3.3 ClickHouse (analytics mirror)

| Metric (prod readiness) | Value |
|-------------------------|-------|
| Status | available |
| Database | synqdrive |
| Total rows | **813,351** |
| Compressed storage | **3.69 MB** |
| Uncompressed | **99.5 MB** |
| Largest table | `telemetry_snapshots` — **607,951** rows |
| Recent ingestion (15m) | 3 snapshots, 3 state changes |
| Pending migrations | 0 |

**Architecture boundary:** ClickHouse is **append-only analytics**; PostgreSQL remains SoT. CH degradation does not block core API readiness (informational unless `schema_error`).

**Bottleneck risk:** HF mirror and snapshot insert rate under large fleets; alert `HfMirrorIdleWithEnabled` if enabled but no inserts in 2h.

### 3.4 Redis

| Dimension | Finding |
|-----------|---------|
| Role | BullMQ backend, session/cache, fingerprint locks (notifications V2) |
| Prod readiness | `PING` **1 ms**, Redis major version **7** |
| Config | `maxRetriesPerRequest: null` (BullMQ requirement); host/port/password via env |

**Bottleneck risk:** Redis memory growth from completed job retention (`removeOnComplete: count 1000, age 24h`; failed: count 5000, age 7d).

### 3.5 BullMQ (20 queues)

**Queue registry** (`backend/src/workers/queues/queue-names.ts`):

| Category | Queues |
|----------|--------|
| DIMO | `dimo.snapshot.poll`, `dimo.vehicle.sync`, `dimo.dtc.poll`, `dimo.tire.recalculation`, `dimo.brake.recalculation`, `dimo.trip-tracking` |
| Trips / driving | `trip.behavior.enrichment`, `trip.driving-impact.compute`, `driving.intelligence.jobs` |
| Documents / AI | `document.extraction`, `booking.document.generation`, `dtc.knowledge.enrichment` |
| Notifications | `notification.evaluation`, `notification.delivery` |
| Other | `payment.email`, `task.automation`, `battery.v2`, `voice.webhook.process`, `connectivity.webhook.process` |

**Processor concurrency (selected):**

| Queue | Concurrency | Lock / notes |
|-------|-------------|--------------|
| `dimo.snapshot.poll` | **5** | 60s lock; 30s scheduler cadence per vehicle |
| `notification.evaluation` | **2** | 300s lock |
| `notification.delivery` | **4** | 120s lock |
| `connectivity.webhook.process` | **4** | DIMO OBD events async |
| `voice.webhook.process` | **4** | — |
| `dimo.tire.recalculation` | **2** | 120s lock |

**Queue health thresholds** (`QueueMonitoringService`):

| Status | Condition |
|--------|-----------|
| critical | failed > 10 **or** delayed > 50 |
| warning | failed > 0 **or** delayed > 10 **or** waiting > 100 |
| idle | no jobs in any state |

**Prod snapshot (readiness):** `document.extraction` — waiting **0**, active **0**.

### 3.6 Dashboard (Rental — Fleet Health Service)

Synthetic scale benchmarks (`docs/testing/fleet-health-service-scale-benchmarks.md`):

| Tier | Vehicles | HTTP pages (50/page) | Client filter+group budget | View-model budget |
|------|----------|----------------------|----------------------------|-------------------|
| S | 100 | 2 | ≤ **80 ms** | ≤ **120 ms** |
| M | 500 | 10 | ≤ **250 ms** | ≤ **400 ms** |
| L | 1,000 | 20 | ≤ **500 ms** | ≤ **800 ms** |
| XL | 5,000 | 100 | ≤ **2 s** | ≤ **3 s** |

**Test result:** All 32 frontend + 5 backend scale tests **passed** on 2026-07-26.

**Known scale gaps (documented, not blocking):**

1. `useFleetHealthMap` materializes full org map client-side after paginated fetch
2. Service Center tasks load unpaginated
3. Station filter not passed server-side from Fleet Health shell

### 3.7 Monitoring

| Component | Status |
|-----------|--------|
| Prometheus config | `prometheus-config.spec.ts` — **pass** |
| Metrics auth | `metrics-auth.guard.spec.ts` — **pass** |
| Alert rules | `backend/monitoring/prometheus/alerts.yml` — queue, DIMO, fleet health, evaluations, document intake, voice |
| Grafana dashboards | `synqdrive-ops`, fleet-health, notifications, battery-v2, document-intake, driving-intelligence, evaluations |
| Master Admin UI | `GET /admin/monitoring/queues`, `/monitoring/summary`, `/platform-health` |

**Gap:** Production Prometheus/Grafana not queried from Cloud Agent (no `METRICS_BEARER_TOKEN` / no VPS tailnet).

### 3.8 Master Admin control plane

| Surface | Load characteristic |
|---------|---------------------|
| `GET /admin/dashboard` | 12 parallel aggregate DB queries (orgs, users, vehicles, MRR, tickets, activity log) |
| `GET /admin/monitoring/*` | Queue counts + poll logs + worker stats + DIMO token health |
| `POST /admin/prune`, hardware backfill | Destructive / bulk — not load-tested |
| Frontend `/master` | SPA; no dedicated scale suite |

**Risk:** Dashboard cold load scales with **global** org/user/vehicle counts, not per-tenant pagination.

---

## 4. Concurrent scenario matrix

| Scenario | Test executed | Result | Evidence |
|----------|---------------|--------|----------|
| **Concurrent organisations** | Multi-org notification ingest (50+50 parallel occurrences) | **Pass** — no cross-tenant leak | `notification-load-resilience` scenario 16 |
| **Concurrent vehicles** | Fleet health scale 100–5000 vehicles | **Pass** — bounded Prisma reads + client CPU budgets | `rental-health-fleet.scale` + frontend scale suite |
| **Concurrent users** | 50 parallel notification list/count API (mocked repo) | **Pass** — list p99 **45.3 ms**, counts p99 **1.2 ms** | Harness scenarios 14–15 |
| **Concurrent bookings** | — | **Not tested** | Manual matrix in `docs/testing/booking-production-test-matrix.md` |
| **Concurrent DIMO events** | In-memory dedup + connectivity queue architecture review | **Partial** — 10/100 parallel ingest pass; no HTTP webhook burst | Harness scenarios 2–3; `connectivity.webhook.process` concurrency 4 |
| **Concurrent API (health)** | 20 parallel `GET /health` | **Pass** — all 200, p95 **321 ms** | Prod probe 2026-07-26 |

### 4.1 DIMO event path under load (architecture)

```
DIMO Vehicle Triggers → POST /api/v1/webhooks/dimo
  ├─ OBD connect/disconnect → inbox → BullMQ connectivity.webhook.process (c=4)
  ├─ DTC → DtcService (sync path)
  └─ RPM/speed/ignition → candidate services

DimoSnapshotScheduler (30s) → dimo.snapshot.poll (c=5) → PostgreSQL VLS + CH mirror
  → trip-tracking queue → enrichment chain
```

**Load drivers:**

- **N vehicles × 1 poll / 30s** → snapshot queue throughput bounded by concurrency **5** and DIMO API rate limits
- **Webhook bursts** → inbox idempotency + async processor; sync DTC path is potential hotspot
- **Suspend recovery** → gap > 3 min triggers segment backfill (CPU/DB spike)

---

## 5. Measured response times

### 5.1 Production API (external, includes network)

| Probe | n | min | p50 | p95 | max |
|-------|---|-----|-----|-----|-----|
| `GET /health` concurrent | 20 | 295 ms | 302 ms | 321 ms | 321 ms |
| `GET /health/readiness` single | 1 | — | — | — | 308 ms |

### 5.2 Notification harness (in-memory, μs→ms)

| Scenario | p50 | p95 | p99 | max |
|----------|-----|-----|-----|-----|
| 10k distinct ingest | 0.39 ms | 0.77 ms | 0.89 ms | 9.05 ms |
| 100 parallel distinct | 1.83 ms | 2.12 ms | 2.16 ms | 2.20 ms |
| API list (50 parallel, 200 rows) | 45.0 ms | 45.0 ms | 45.3 ms | 45.3 ms |
| API counts (50 parallel) | 1.08 ms | 1.10 ms | 1.22 ms | 1.22 ms |

*Source: `backend/tmp/notification-load-resilience-report.json`*

### 5.3 Fleet health synthetic (client CPU ceilings — tests assert under budget)

| Vehicles | Pipeline | View-model |
|----------|----------|------------|
| 100 | < 80 ms | < 120 ms |
| 500 | < 250 ms | < 400 ms |
| 1,000 | < 500 ms | < 800 ms |
| 5,000 | < 2,000 ms | < 3,000 ms |

---

## 6. CPU and RAM

| Source | CPU | RAM |
|--------|-----|-----|
| Cloud Agent test run | Not instrumented | Not instrumented |
| Production VPS | **Not available** in this audit | **Not available** |
| Node process (expected) | PM2 cluster (prod); workers co-located or separate | BullMQ job payloads + Prisma connection pool |

**Recommendation:** During staging load test, capture:

- `process_cpu_seconds_total`, `process_resident_memory_bytes` from `/api/v1/metrics`
- VPS `node_exporter` or `pm2 monit` during k6 ramp
- Redis `INFO memory` and Postgres `pg_stat_activity` at peak

---

## 7. Queue posture (production snapshot)

From readiness `documentExtraction` and architecture defaults:

| Queue | Waiting | Active | Assessment |
|-------|---------|--------|------------|
| `document.extraction` | 0 | 0 | Healthy idle |
| `dimo.snapshot.poll` | Not exposed in readiness | — | Monitor via `/admin/monitoring/queues` |
| All others | — | — | Require authenticated admin monitoring endpoint |

**Alerting when loaded:**

- `QueueLagHigh` — p95 lag > 5 min
- `QueueFailedJobsHigh` — failed > 10
- `DimoSnapshotSuccessRateLow` — success < 80% over 30m
- `DocumentExtractionQueueAgeHigh` — oldest job > 10 min

---

## 8. Bottleneck register

| ID | Severity | Component | Bottleneck | Mitigation (existing or planned) |
|----|----------|-----------|------------|--------------------------------|
| LOAD-1 | P1 | **Load testing gap** | No k6/Artillery; no sustained HTTP load validation | Add staging load suite; document in CI |
| LOAD-2 | P2 | **DIMO snapshot poll** | 30s × N vehicles, concurrency 5 | Per-vehicle `jobId` dedup; scheduler janitor; DIMO rate limits |
| LOAD-3 | P2 | **Master Admin dashboard** | 12 unbounded global aggregates | Cache dashboard stats; paginate activity log (already `take` limited) |
| LOAD-4 | P2 | **DTC webhook sync path** | Synchronous processing on webhook thread | Already async for OBD; DTC remains sync hotspot |
| LOAD-5 | P3 | **Fleet health client** | Full-fleet map materialization after paginated API | Documented gap P51; virtualization for >50 rows |
| LOAD-6 | P3 | **ClickHouse mirror** | Insert throughput at high telemetry rates | Best-effort mirror; PG remains SoT |
| LOAD-7 | P3 | **Evaluations / data-analyse API** | p95 > 2s alert threshold | Runbook: `docs/operations/evaluations-observability-runbook.md` |
| LOAD-8 | P3 | **Notification staging** | In-memory harness ≠ Postgres+Redis+BullMQ | Staging multi-PM2 benchmark open per audit docs |

---

## 9. Manual staging load checklist

Execute on staging with k6 or Artillery (not in repo — create scripts):

| # | Profile | Target | Success criteria |
|---|---------|--------|------------------|
| 1 | 50 VUs × 5 min | `GET /health`, `GET /health/readiness` | p95 < 1s, 0% errors |
| 2 | 10 orgs × 20 users | Login + `GET /organizations/:orgId/vehicles` | p95 < 2s, no cross-tenant data |
| 3 | 100 vehicles/org | `GET .../rental-health/fleet?page=1` | p99 < 8s per SLO |
| 4 | 20 concurrent bookings | `POST .../bookings` | < 5% 409/validation errors; no 5xx |
| 5 | DIMO webhook replay | 100 events/s for 60s | inbox drain; queue lag p95 < 300s |
| 6 | Master Admin | `GET /admin/dashboard` under DB load | p95 < 3s |
| 7 | Observability | Prometheus scrape during test | No `QueueFailedJobsHigh` firing |

**Sample k6 stub (to add to repo):**

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
export const options = { vus: 50, duration: '5m' };
export default function () {
  const res = http.get('https://staging.synqdrive.eu/api/v1/health');
  check(res, { 'status is 200': (r) => r.status === 200 });
  sleep(1);
}
```

---

## 10. Acceptance decision

| Criterion | Status |
|-----------|--------|
| API dependency health verified | ✅ |
| DB/Redis/CH readiness timings captured | ✅ |
| BullMQ architecture + thresholds documented | ✅ |
| Dashboard scale budgets tested (synthetic) | ✅ |
| Notification concurrency tested (harness) | ✅ |
| Monitoring config validated | ✅ |
| Master Admin load path analyzed | ✅ |
| CPU/RAM under sustained load | ❌ Not measured |
| Concurrent bookings HTTP load | ❌ Not executed |
| DIMO webhook HTTP burst | ❌ Not executed |

### Final verdict

**Load validation: CONDITIONAL PASS**

The platform demonstrates **sound scale architecture** (paginated fleet health, bounded Prisma reads, queue monitoring, Prometheus alerts) and **healthy production dependencies** at rest. **Full load sign-off** requires staging HTTP load tests with CPU/RAM/queue metrics collection per §9.

---

## 11. Source artifacts

| Artifact | Path |
|----------|------|
| Notification load report | `backend/tmp/notification-load-resilience-report.json` |
| Notification audit | `docs/audits/notification-engine-load-resilience-test-2026-07.md` |
| Fleet health benchmarks | `docs/testing/fleet-health-service-scale-benchmarks.md` |
| ClickHouse boundaries | `architecture/CLICKHOUSE_RUNTIME_AND_BOUNDARIES_2026-07-08.md` |
| Queue names | `backend/src/workers/queues/queue-names.ts` |
| Queue monitoring | `backend/src/modules/observability/queue-monitoring.service.ts` |
| Health service | `backend/src/modules/health/health.service.ts` |
| Platform admin aggregates | `backend/src/modules/platform-admin/platform-admin.service.ts` |
| Prometheus alerts | `backend/monitoring/prometheus/alerts.yml` |
| DIMO scheduler | `backend/src/workers/schedulers/dimo-snapshot.scheduler.ts` |

---

## 12. Changes / Architektur

**Not updated** — documentation-only load validation audit (consistent with Phase 2G.1–2G.3).

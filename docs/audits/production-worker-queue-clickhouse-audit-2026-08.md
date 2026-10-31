# Production Worker / Queue / ClickHouse Reliability Audit — August 2026

| Field | Value |
|-------|-------|
| **Audit ID** | `production-worker-queue-clickhouse-audit-2026-08` |
| **Mode** | Phase 1 — read-only investigation (no remediation performed) |
| **VPS host** | `srv1374778.hstgr.cloud` |
| **Production release** | `/opt/synqdrive/releases/20260826132257_v4994` |
| **Production main SHA** | `75579f1373171807ce9132158a9fcb29cfb40307` |
| **Audit branch** | `cursor/production-infra-audit-c835` |
| **Audit timestamp (UTC)** | 2026-08-26T15:00Z |

---

## 1. Executive Summary

**Is production currently at risk?** **Yes — partially.** Core API, PostgreSQL, Redis, DIMO snapshot polling, and trip tracking are **operational**. Two subsystems are **actually unhealthy**: ClickHouse (down 5 days) and Battery V2 REST-target reconciliation (actively failing). BullMQ shows **77 accumulated failed jobs**, dominated by **68 terminal Battery V2 failures** that are both **historical residue and still growing**.

**Actually unhealthy components**

| Component | Verdict |
|-----------|---------|
| ClickHouse | **Down** — Docker container OOM-killed 2026-08-21; `ECONNREFUSED 127.0.0.1:8123` |
| Battery V2 REST-target jobs | **Actively failing** every ~2 min (`REST target job missing restWindowId`) |
| ClickHouse mirror retry queue | **6 terminal failures** (`ClickHouse is not available`) |

**False positives / misleading observability**

| Master Admin signal | Verdict |
|---------------------|---------|
| Polling: “6 vehicles stale” | **Misleading** — polling succeeds (720 SNAPSHOT successes/hour); stale count uses `vehicleLatestState.lastSeenAt` (DIMO signal age), not poll health |
| Enrichment: “12 pending” | **Misleading** — legacy `vehicle_enrichment_jobs` rows; **no consumer** processes `PENDING` |
| BullMQ: “critical” | **Partially misleading** — count includes **7-day retained terminal jobs**; threshold `failed > 10` does not distinguish active outage vs. accumulated corpses |
| Worker failed jobs (~68) | **Accurate count, wrong semantics** — equals `battery.v2` failed ZSET size; not general worker outage |

**Data loss**

| Area | Assessment |
|------|------------|
| PostgreSQL operational data | **No evidence of loss** |
| ClickHouse analytics mirror | **Writes blocked** since CH down (~5 days); Postgres remains SoT |
| Trip / snapshot polling | **No loss** — polls succeeding |

**Processing backlogs**

| Queue | Backlog |
|-------|---------|
| `trip.behavior.enrichment` | **0** waiting/active/delayed |
| `battery.v2` | **0** waiting; failures accumulate in failed set |
| All other queues | **0** meaningful backlog |

**Acute actions (audit only — not executed)**

| Priority | Action |
|----------|--------|
| P0 | Restore ClickHouse container (OOM root cause + memory limits) |
| P1 | Fix Battery V2 REST-target enqueue payload (`restWindowId`) or disable shadow reconciliation until fixed |
| P2 | Repair Master Admin health semantics (failed-job retention, enrichment source, stale-vehicle definition) |

---

## 2. Current Production State

### 2.1 Infrastructure matrix

| Component | Expected (repo) | Running | Health | Restarts / uptime | Resources | Finding |
|-----------|-----------------|---------|--------|-------------------|-----------|---------|
| **SynqDrive API + workers** | Single PM2 `synqdrive` NestJS monolith (`backend/dist/src/main.js`) | **Yes** PID 507192 | **OK** readiness | PM2 restarts: **2**; uptime ~91m (deploy 13:28 UTC) | Heap ~186 MiB / 200 MiB (93%) | All BullMQ processors in-process; workers enabled |
| **PostgreSQL 16** | `postgresql@16-main` | **Yes** | **OK** | systemd active 40d+ | — | Readiness 2ms |
| **Redis 7.0.15** | `redis-server` | **Yes** | **OK** | systemd active | 14.7M used; maxmemory 0; noeviction | 113 clients, 20 blocked (BullMQ normal) |
| **ClickHouse 25.8** | Docker `synqdrive-clickhouse` | **No** | **DOWN** | Exited 137 **OOM** 2026-08-21 04:45 UTC | Limit 2G RAM / 4G swap | Not listening on 8123/9000 |
| **Nginx** | Reverse proxy TLS | **Yes** | **OK** | active | — | `app.synqdrive.eu` healthy |
| **Prometheus** | Docker | **Yes** | Up 7d | — | — | Monitoring stack OK |
| **Grafana** | Docker | **Yes** | Up 2h | — | — | Restarted recently |
| **Alertmanager** | Docker | **Yes** | Up 2h | — | — | — |
| **Node exporter** | Docker | **Yes** | Up 7d | — | — | — |
| **Blackbox exporter** | Docker | **Yes** | Up 7d | — | — | — |
| **PM2 logrotate** | root PM2 module | **Yes** | Running | — | — | synqdrive-error.log active |
| **Separate worker PM2 apps** | **Not expected** | **None** | — | Repo: all workers in monolith | — | Architecture match |

### 2.2 Host resources

| Metric | Value |
|--------|-------|
| Disk `/` | 75G / 193G (39%) |
| RAM | 1.9G used / 15G; 13G available |
| Load | ~0.0–0.7 |
| Uptime | 40 days |

### 2.3 Fleet snapshot (production DB)

| Metric | Value |
|--------|-------|
| Vehicles total | 9 |
| DIMO connected | 6 |
| Stale (`lastSeenAt` > 30 min or null) | **6** (all connected fleet) |
| SNAPSHOT polls last 1h | **720 SUCCESS**, **0 FAILURE** |
| TRIP_TRACKING last 1h | **80 SUCCESS**, **0 FAILURE** |

---

## 3. BullMQ Findings (queue-by-queue)

Live counts from Redis (`bull:<queue>:<state>`) at audit time:

| Queue | waiting | active | delayed | failed | completed | paused | Status (code rules) |
|-------|---------|--------|---------|--------|-----------|--------|---------------------|
| `dimo.snapshot.poll` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `dimo.vehicle.sync` | 0 | 0 | 1 | **1** | 2 | 0 | warning |
| `dimo.dtc.poll` | 0 | 0 | 1 | 0 | 60 | 0 | healthy |
| `dimo.tire.recalculation` | 0 | 0 | 0 | 0 | 72 | 0 | idle |
| `dimo.brake.recalculation` | 0 | 0 | 0 | 0 | 12 | 0 | idle |
| `dimo.trip-tracking` | 0 | 0 | 0 | **2** | 0 | 0 | warning |
| `trip.behavior.enrichment` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `trip.driving-impact.compute` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `driving.intelligence.jobs` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `document.extraction` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `booking.document.generation` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `dtc.knowledge.enrichment` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `notification.evaluation` | 0 | 0 | 0 | 0 | 16 | 0 | idle |
| `notification.delivery` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `payment.email` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `task.automation` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| **`battery.v2`** | 0 | 0 | 0 | **68** | 1000 | 0 | **critical** |
| `voice.webhook.process` | 0 | 0 | 0 | 0 | 0 | 0 | idle |
| `connectivity.webhook.process` | 0 | 0 | 0 | 0 | 2 | 0 | idle |
| **`clickhouse.mirror.retry`** | 0 | 0 | 0 | **6** | 0 | 0 | warning |
| **TOTAL failed** | | | | **77** | | | |

**Status rules** (`queue-monitoring.service.ts`): `critical` if `failed > 10` OR `delayed > 50`; `warning` if `failed > 0` OR `delayed > 10` OR `waiting > 100`.

**Retention (global defaults `app.module.ts`)**

- `removeOnComplete`: `{ count: 1000, age: 24h }`
- `removeOnFail`: `{ count: 5000, age: 7d }`
- `battery.v2` override: `removeOnFail: { count: 2000, age: 14d }`

**Semantics:** Failed ZSET counts are **accumulated terminal jobs** within retention window, **not** “jobs failing right now”. However, Battery V2 is **also actively producing new failures** (see §4).

---

## 4. Failed Job Root Causes

### 4.1 Summary by queue

| Queue | Failed | Root error | Age | Active? |
|-------|--------|------------|-----|---------|
| `battery.v2` | 68 | `REST target job missing restWindowId` (100%) | First ~Jun; latest **2026-08-26T14:58:24Z** | **Yes — ongoing** |
| `clickhouse.mirror.retry` | 6 | `ClickHouse is not available` | **2026-08-21T04:48Z** cluster + post-deploy | Terminal |
| `dimo.trip-tracking` | 2 | FK violation + PG recovery | **2026-06-23** | No |
| `dimo.vehicle.sync` | 1 | `DIMO_CLIENT_ID and DIMO_PRIVATE_KEY must be set` | **2026-06-22** | No |

### 4.2 Battery V2 — RC detail

- **Handler:** `battery-rest-target-evaluate.handler.ts` throws when `payload.restWindowId` is missing.
- **Job type:** `BATTERY_REST_TARGET_EVALUATE`
- **Producer:** Battery V2 reconciliation scheduler enqueues `rest-target` jobs with jobIds like `battery-v2_rest-target_<vehicle>_REST__60M_<ts>` but payload lacks `restWindowId`.
- **Retry policy:** `retryable: false` → terminal failure after attempts exhausted.
- **Log evidence:** `battery.v2.processor.worker_failed` — **961** lines in current error log; recurring at **:53** and **:58** each hour (reconciliation interval).
- **Vehicles affected:** `c43c3b45…`, `c10351f8…`, `8c850ff1-…` (masked in logs as keyFp only).

### 4.3 ClickHouse mirror — RC detail

- All 6 jobs failed with `ClickHouse is not available` when mirror processor could not reach CH.
- Timestamps align with **ClickHouse container death** (2026-08-21) and likely **post-deploy mirror retry** burst.

### 4.4 Historical / terminal corpses

| Jobs | Classification |
|------|----------------|
| `dimo.vehicle.sync` ×1 | **Historical** — June DIMO env misconfiguration |
| `dimo.trip-tracking` ×2 | **Historical** — June DB recovery / FK |
| `battery.v2` ×68 | **Mixed** — retention keeps failures 14d; **new failures still added** |
| `clickhouse.mirror.retry` ×6 | **Historical** — CH outage period |

### 4.5 Answer: what are the ~77 failures?

**Both A and B:**

- **A:** 77 is the **current live failed ZSET total** across queues (not a UI cache).
- **B:** The majority are **accumulated terminal jobs** under `removeOnFail` retention (especially `battery.v2` with 14-day retention).
- **Critical distinction:** Unlike pure historical corpses, **Battery V2 failures are still actively incrementing** (~every 2 minutes from reconciliation). BullMQ “critical” reflects **real ongoing failure** for that queue, not only stale counts.

---

## 5. Enrichment Backlog

### 5.1 Master Admin “12 enrichment pending”

| Field | Value |
|-------|-------|
| **Data source** | `vehicle_enrichment_jobs` PostgreSQL table |
| **Query** | `count(status = PENDING)` in `PlatformAdminService.getMonitoringSummary()` |
| **NOT** | BullMQ `trip.behavior.enrichment` depth |

**Live state:** `PENDING = 12` — **only status present in table** (no COMPLETED/FAILED rows).

| job_type | count | created_at range |
|----------|-------|------------------|
| BATTERY | 6 | 2026-04-04 → 2026-07-06 |
| BRAKE | 6 | 2026-04-04 → 2026-07-06 |

### 5.2 Producer / consumer trace

| Role | Implementation |
|------|----------------|
| **Producer** | `vehicles.service.ts` — on DIMO vehicle registration creates `vehicleEnrichmentJob` with `jobType: BATTERY`, `status: PENDING` |
| **Consumer** | **None** — `EnrichmentJobsService` is CRUD-only; BRAKE creation explicitly deprecated |
| **Canonical enrichment** | `trip.behavior.enrichment` BullMQ queue (0 backlog) via `TripEnrichmentOrchestratorService` |

### 5.3 Verdict

**Not a queue backlog.** These are **orphaned legacy rows** never picked up by any worker. Master Admin label “enrichment jobs pending” is **observability debt** — it does not reflect BullMQ or trip enrichment health.

---

## 6. Worker Runtime

### 6.1 Expected vs actual workers

Repo defines **22 BullMQ processors** + **~15 schedulers** + billing outbox interval workers — all **in-process** in `synqdrive` PM2 app. **Production matches** — no separate worker processes.

### 6.2 Logical “workers” in Master Admin UI

Derived from `dimo_poll_logs` job types (last 1h), **not** BullMQ worker heartbeats:

| Logical worker | 1h total | success | failed | failure ratio | UI status |
|----------------|----------|---------|--------|---------------|-----------|
| DIMO Snapshot | 720 | 720 | 0 | 0% | healthy |
| V2 Trip Tracking | 80 | 80 | 0 | 0% | healthy |
| Others | 0 | — | — | — | idle |

**unhealthyWorkers = 0** for current 1h window (degraded requires ≥50% failure ratio with activity).

### 6.3 Error log clusters (24h, `synqdrive-error.log`)

| Error cluster | Count (approx) | First seen | Last seen | Component | Severity | Likely cause |
|---------------|----------------|------------|-----------|-----------|----------|--------------|
| `ECONNREFUSED 127.0.0.1:8123` | 901 | 2026-08-21 | ongoing (every 60s) | ClickHouse client | High | CH container down |
| `battery.v2.processor.worker_failed` | 961 | weeks ago | **2026-08-26 14:58** | Battery V2 | Medium | Missing `restWindowId` in enqueue |
| PM2 process restarts | 2 | 2026-08-26 13:28 | deploy | Runtime | Low | Planned deploy |

No OOM/SIGKILL on synqdrive node process. ClickHouse container **OOMKilled=true**.

---

## 7. Redis Infrastructure

| Check | Result |
|-------|--------|
| PING | PONG |
| Memory | 14.66M used; maxmemory 0 (unlimited); noeviction |
| Evicted keys | 0 |
| Connected clients | 113 |
| Blocked clients | 20 (BullMQ blocking pop — expected) |
| Rejected connections | 0 |
| Persistence | RDB; AOF disabled; last save active |
| DBSIZE | 1337 keys |
| Latency | Readiness check ~1–2ms |

**No Redis infrastructure failure detected.** BullMQ state is consistent with active monolith consumers.

---

## 8. ClickHouse

### 8.1 Health code path

```
Master Admin / Platform Ops
  → GET /api/v1/admin/platform-health
  → PlatformAdminService.getPlatformHealth()
  → HealthService.checkReadiness()
  → HealthService.checkClickHouse()
  → ClickHouseService.getStatus() + optional ingestion probe
```

**Readiness mapping:** `clickhouse.status === 'error'` when CH status is `degraded` or `schema_error` (not `available`/`disabled`).

**Platform Ops mapping:** `degraded` when readiness check errors; not `critical`.

### 8.2 Production reality

| Check | Result |
|-------|--------|
| `CLICKHOUSE_URL` | Configured → `127.0.0.1:8123` (masked) |
| Container `synqdrive-clickhouse` | **exited (137)** since **2026-08-21T04:45:34Z** |
| OOMKilled | **true** |
| Memory limit | 2GB / 4GB swap |
| Data on disk | ~13M under `/opt/synqdrive/shared/clickhouse` |
| HTTP/native ports | **Not listening** |
| Backup cron | **Failing daily** since 2026-08-22: `container … is not running` |
| Last successful backup | **2026-08-21** |

### 8.3 Degraded cause

**SynqDrive integration correctly reports degraded** because configured CH is unreachable (`ECONNREFUSED`). This is **not** a false positive — ClickHouse is **actually down**.

**Root cause of outage:** Docker container **OOM kill** (exit 137), not auth/schema drift.

### 8.4 Downstream impact

- `clickhouse.mirror.retry` jobs fail terminal.
- Analytics ingestion blocked; **PostgreSQL remains operational SoT**.
- Hourly ClickHouse ping warnings in application logs.

---

## 9. Polling Warning (6 stale vehicles)

### 9.1 Code path

```
Master Admin alert "Stale vehicles"
  → PlatformAdminService.getMonitoringSummary()
  → staleVehicles = count(vehicleLatestState where lastSeenAt null OR > 30 min)
  → getMonitoringAlerts() if staleVehicles > 0
```

**Threshold:** 30 minutes on `last_seen_at` (DIMO signal timestamp), **not** `provider_fetched_at`.

### 9.2 The 6 vehicles (IDs shortened)

| Vehicle | lastSeenAt (DB) | Last SNAPSHOT success | Gap | Category |
|---------|-----------------|----------------------|-----|----------|
| VW Golf | 2026-07-18 | 2026-08-26 14:59:54 | ~39 days | **E** upstream stale DIMO timestamps |
| VW Tiguan | 2026-07-23 | 2026-08-26 14:59:54 | ~34 days | **E** |
| VW Arteon | 2026-08-25 16:42 | 2026-08-26 14:59:54 | ~22h | **C/E** signal age vs live poll |
| Tesla Model 3 | 2026-08-25 17:57 | 2026-08-26 14:59:54 | ~21h | **C/E** |
| Audi A4 | 2026-08-26 09:10 | 2026-08-26 14:59:54 | ~6h | **C/E** |
| Mercedes C63 AMG | 2026-08-26 11:58 | 2026-08-26 14:59:54 | ~3h | **C/E** |

### 9.3 Mechanism (`dimo-snapshot.processor.ts`)

On successful poll, if incoming DIMO `lastSeenAt` is **older** than stored `sourceTimestamp`, monotonic guard **skips** `lastSeenAt` update (only updates `providerFetchedAt`). Poll logs **SUCCESS**; freshness metric stays stale.

### 9.4 Verdict

| Question | Answer |
|----------|--------|
| Is polling broken? | **No** — 720 successes/hour, 0 failures |
| Are vehicles offline? | **Partially** — Golf/Tiguan have **weeks-old DIMO signal timestamps** |
| Is warning accurate for “polling”? | **No** — measures **telemetry signal age**, not poll execution |
| False positive? | **Yes** for polling health; **valid** as upstream telemetry staleness if labeled correctly |

---

## 10. Cross-System Correlation Timeline

Evidence-based sequence (UTC):

| Time | Event | Evidence |
|------|-------|----------|
| 2026-06-22 09:46 | `dimo.vehicle.sync` terminal fail (DIMO creds) | Redis failed job |
| 2026-06-23 00:23 | `dimo.trip-tracking` fail (PG recovery / FK) | Redis failed job |
| 2026-08-18 19:11 | ClickHouse container (re)started | Docker inspect StartedAt |
| 2026-08-21 04:45 | **ClickHouse OOM killed** exit 137 | Docker OOMKilled=true |
| 2026-08-21 04:48+ | CH mirror retry failures begin | failed job ts 1787287684813 |
| 2026-08-22 – 08-26 | Daily CH backup failures | `/var/log/synqdrive-clickhouse-backup.log` |
| 2026-08-21 – 08-26 | Continuous `ECONNREFUSED 8123` in app logs | 901 log lines / 24h |
| Weeks – ongoing | Battery REST-target failures every ~2 min | 961 worker_failed lines; failed ZSET growing |
| 2026-08-26 13:28 | Deploy release `20260826132257_v4994`; PM2 restart | PM2 created_at; uptime reset |
| 2026-08-26 13:28+ | Post-deploy CH readiness = error | `/health/readiness` |
| 2026-08-26 14:58 | Latest battery.v2 failed jobs | Redis ZSET scores |

**Correlation chain (confirmed):** ClickHouse OOM → CH unavailable → mirror retry failures + readiness degraded + backup failures. **Independent:** Battery V2 REST-target bug (pre-dates CH outage). **Not correlated:** Polling “stale” warning (DIMO signal age / monotonic guard).

---

## 11. Master Admin Observability Accuracy

| Indicator | Data source | Endpoint | Calculation | Accurate? | Notes |
|-----------|-------------|----------|-------------|-----------|-------|
| **BullMQ critical** | Redis failed ZSET counts | `/admin/monitoring/queues`, `/admin/platform-health` | `failed > 10` → critical; Platform Ops: any `failed > 0` → critical | **Partial** | Reflects real battery.v2 outage + retention corpses; threshold lacks “active vs stale” |
| **ClickHouse degraded** | `HealthService.checkClickHouse()` | `/health/readiness`, Platform Ops | `available=false` → error/degraded | **Yes** | CH actually down |
| **Worker failed jobs (~68)** | Sum of queue `failed` or battery.v2 dominant | platform-health queues | Raw failed ZSET sum | **Misleading label** | Count is correct; implies general worker failure |
| **Enrichment pending (12)** | `vehicle_enrichment_jobs.PENDING` | monitoring summary | `count(PENDING)` | **False positive** | Legacy table; no processor |
| **Polling stale (6)** | `vehicle_latest_states.last_seen_at` | monitoring summary / alerts | `> 30 min` | **Misleading for polling** | Polls succeed; metric is signal age |
| **unhealthyWorkers** | `dimo_poll_logs` 1h failure ratio | monitoring summary | ≥50% failed → degraded count | **Yes (currently)** | 0 unhealthy in live window |
| **Overall critical** | Composite | platform-health | readiness degraded OR monitoring critical OR queue critical | **Partial** | Queue critical from battery.v2 failed count |

**Key observability bugs (P2):**

1. Old failed jobs can keep BullMQ **critical** indefinitely (7–14d retention).
2. `failed > 0` in Platform Ops marks BullMQ critical even for **1** historical corpse.
3. Enrichment pending counts **deprecated PG table**.
4. Stale vehicles should use `providerFetchedAt` or label “signal delayed” vs “polling stale”.

---

## 12. Root Causes

| ID | Root cause | Evidence | Impact | Severity | Component | Confidence |
|----|------------|----------|--------|----------|-----------|------------|
| **RC-01** | ClickHouse Docker container OOM-killed | Docker `OOMKilled=true`, exit 137, 2026-08-21 | Analytics unavailable; mirror fails; backups fail; readiness CH error | **High** | ClickHouse | **Confirmed** |
| **RC-02** | Battery V2 reconciliation enqueues REST-target jobs without `restWindowId` | 68/68 failed same error; handler line 46–50; logs every 2 min | Terminal job accumulation; false worker crisis signal | **Medium** | battery.v2 queue | **Confirmed** |
| **RC-03** | Master Admin BullMQ health uses raw failed ZSET without staleness semantics | `queue-monitoring.service.ts` thresholds; Platform Ops `failed > 0` | Permanent/semi-permanent “critical” during retention | **Low** (ops noise) | Observability | **Confirmed** |
| **RC-04** | Legacy `vehicle_enrichment_jobs` PENDING rows with no consumer | 12 PENDING only; `EnrichmentJobsService` no worker; registration still creates BATTERY rows | False “enrichment backlog” | **Low** | Master Admin | **Confirmed** |
| **RC-05** | Stale vehicle metric uses DIMO `lastSeenAt` not poll success / `providerFetchedAt` | 6 stale but 720 snapshot successes/h; monotonic guard in processor | False polling warnings | **Medium** (ops noise) | Polling observability | **Confirmed** |
| **RC-06** | Upstream DIMO stale telemetry for Golf/Tiguan (weeks-old signals) | lastSeenAt July; polls succeed | Vehicles show offline in freshness views | **Medium** | DIMO / fleet | **High** |
| **RC-07** | Historical terminal jobs (Jun vehicle sync, trip-tracking) | Failed job timestamps June 2026 | Inflate failed counts marginally | **Low** | BullMQ retention | **Confirmed** |

---

## 13. Remediation Plan (not executed — Phase 2)

### P0 — Immediate

| # | Problem | Change | Files / services | Risk | Validation | Rollback |
|---|---------|--------|------------------|------|------------|----------|
| P0.1 | ClickHouse down 5 days | Investigate OOM; increase memory limit or reduce CH memory footprint; **restart container**; verify 8123 + readiness | Docker compose `synqdrive-clickhouse`, CH config XML | Medium — brief analytics gap | `curl 127.0.0.1:8123/ping`; readiness CH ok; backup cron success | Stop container; revert memory config |
| P0.2 | Analytics mirror backlog risk | After CH up, assess whether mirror retry needs manual replay (separate decision) | `clickhouse.mirror.retry` processor | Low | Insert test row; mirror job success | Disable mirror feature flag |

### P1 — Short term

| # | Problem | Change | Files / services | Risk | Validation | Rollback |
|---|---------|--------|------------------|------|------------|----------|
| P1.1 | REST-target jobs missing `restWindowId` | Fix enqueue in Battery V2 reconciliation to include `restWindowId` OR skip enqueue until window exists OR disable shadow mode | `battery-v2` reconciliation scheduler / orchestrator | Low | No new `worker_failed` lines; failed ZSET stable | Revert deploy |
| P1.2 | 68+ terminal battery jobs | After fix, **optional** failed-job cleanup (Phase 2 explicit approval) | Redis / BullMQ admin | Low | failed count drops | N/A |
| P1.3 | 12 orphan enrichment rows | Mark FAILED/CANCELLED or delete with migration script; stop creating BATTERY PENDING on register if unused | `vehicles.service.ts`, data migration | Low | PENDING count 0 | DB restore from backup |

### P2 — Observability

| # | Problem | Change | Files / services | Risk | Validation | Rollback |
|---|---------|--------|------------------|------|------------|----------|
| P2.1 | BullMQ critical from stale failures | Health based on **recent** failures (e.g. last 1h) or `failed` age histogram | `queue-monitoring.service.ts`, `platform-ops.service.ts` | Low | Critical clears when no active failures | Revert UI logic |
| P2.2 | Enrichment pending false signal | Remove or replace with `trip.behavior.enrichment` waiting count + label clarity | `platform-admin.service.ts`, Master Admin UI | Low | UI matches BullMQ | Revert |
| P2.3 | Stale vehicle semantics | Use `providerFetchedAt` for poll health; keep `lastSeenAt` for signal age; split alerts | `platform-admin.service.ts`, alerts | Medium | Poll warning only when polls fail | Revert |
| P2.4 | Platform Ops `failed > 0` → critical | Align with queue `status` field only | `platform-ops.service.ts` | Low | 1 old corpse ≠ critical | Revert |

### P3 — Hardening

| # | Problem | Change | Files / services | Risk | Validation | Rollback |
|---|---------|--------|------------------|------|------------|----------|
| P3.1 | CH OOM recurrence | CH memory alerts; merge backlog monitoring; right-size container | Prometheus/Grafana, Docker limits | Low | Alert fires before OOM | Revert alerts |
| P3.2 | Failed job retention policy | Review `removeOnFail` for non-retryable job types (shorter age for terminal errors) | `app.module.ts`, battery v2 enqueue opts | Low | Failed set self-heals faster | Revert config |
| P3.3 | CH backup dependency | Alert on backup cron failure (already partially in logs) | Alertmanager rules | Low | Page on 2 consecutive fails | Revert rule |

---

## 14. Audit Method & Safety

- **Read-only:** No queue purges, restarts, migrations, Redis/CH/DB mutations, or deploys during audit.
- **Secrets:** Env vars inspected by name only; values masked in this document.
- **Tools:** SSH (synqdrive-admin + sudo), `redis-cli`, `psql`, `docker inspect`, public/local health endpoints, PM2 logs.

---

## 15. References (codebase)

| Area | Path |
|------|------|
| Queue names | `backend/src/workers/queues/queue-names.ts` |
| Queue monitoring thresholds | `backend/src/modules/observability/queue-monitoring.service.ts` |
| Platform health aggregation | `backend/src/modules/platform-admin/platform-admin.service.ts` |
| Platform Ops service states | `backend/src/modules/platform-admin/platform-ops.service.ts` |
| ClickHouse health | `backend/src/modules/health/health.service.ts`, `clickhouse.service.ts` |
| Snapshot / freshness | `backend/src/workers/processors/dimo-snapshot.processor.ts` |
| Battery REST handler | `backend/src/modules/vehicle-intelligence/battery-health/jobs/handlers/battery-rest-target-evaluate.handler.ts` |
| Legacy enrichment jobs | `backend/src/modules/vehicle-intelligence/enrichment-jobs/enrichment-jobs.service.ts` |
| BullMQ inspect script | `backend/scripts/ops/vps-inspect-bullmq-redis.sh` |

---

**Changes / Architektur:** Audit-only documentation — no application code changed. Architecture docs not modified (investigation record only).

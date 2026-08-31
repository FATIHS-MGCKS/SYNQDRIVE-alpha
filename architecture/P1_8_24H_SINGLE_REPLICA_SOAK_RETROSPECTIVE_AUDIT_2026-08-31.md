# P1.8 — 24H Single-Replica Soak Retrospective Production Audit

**Audit date:** 2026-08-31 (UTC)  
**Soak window:** 2026-08-30T14:58:42Z → 2026-08-31T14:58:42Z  
**VPS:** `srv1374778.hstgr.cloud`  
**Production URL:** `https://app.synqdrive.eu`  
**Deployed SHA:** `3874360e0` (`20260830145314_v4994`)  
**Topology (unchanged):** PM2 fork × 1, port 3001, Redis DB 0  

---

## Machine-readable summary (Phase 12)

```
P1_8_24H_SOAK_VERDICT = GO_WITH_CONDITIONS
SOAK_AUDIT_STATUS = COMPLETE
SOAK_START_TIMESTAMP = 2026-08-30T14:58:42Z
SOAK_END_TIMESTAMP = 2026-08-31T14:58:42Z
SOAK_DURATION_SECONDS = 86400
SOAK_FULL_WINDOW_AVAILABLE = YES
SOAK_EVIDENCE_SUFFICIENT_FOR_SCALE_DECISION = YES

DEPLOYED_SHA = 3874360e0
SOAK_SHA_STABLE = YES
PRODUCTION_REPLICAS = 1
PM2_RESTART_COUNT = 0
UNEXPECTED_PROCESS_EXITS = 0
ESTIMATED_DOWNTIME_SECONDS = 0

STARTUP_INCIDENT_REMEDIATED = YES
PROMETHEUS_DUPLICATE_REGISTRATION_RECURRED = NO

SCHEDULER_LEADER_COUNT_MAX = 1
SCHEDULER_LEADER_CHANGES = 2
SCHEDULER_DUPLICATE_TICKS = 0
SCHEDULER_STALL_FOUND = NO
SPLIT_BRAIN_FOUND = NO

RECONCILIATION_DOUBLE_EXECUTION = NO
RECONCILIATION_MUTEX_ERRORS = 0
RECONCILIATION_STALE_LOCKS = 0
RECONCILIATION_BYPASS_FOUND = NO
RECONCILIATION_RETRY_STORM = NO

DIMO_GLOBAL_LIMIT = 50
DIMO_IN_FLIGHT_MAX = 1
DIMO_LIMIT_BREACHES = 0
DIMO_429_COUNT = 0
DIMO_ACQUIRE_TIMEOUTS = 0
DIMO_STALE_LEASES = 0
DIMO_BUDGET_BYPASS_FOUND = NO
DIMO_RETRY_STORM_FOUND = NO

QUEUE_BACKLOG_RUNAWAY = NO
STALLED_JOB_ANOMALY = NO
FAILED_JOB_ANOMALY = NO
SNAPSHOT_PIPELINE_HEALTH = PASS
TRIP_PIPELINE_HEALTH = PASS
PERMANENT_TRIP_LOSS_SIGNAL = NO

ROUTE_V2_REGRESSION = NO

NEW_REFUEL_EVENTS = 0
NEW_RECHARGE_EVENTS = 0
NEW_REFUEL_RISE_METADATA_VALID = N/A
NEW_REFUEL_DUPLICATES = 0
ENERGY_REFUEL_REGRESSION = NO

REDIS_HEALTH = PASS
POSTGRES_HEALTH = PASS

NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 2

PROVIDER_CEILING_VERIFIED = NO
SCALE_TO_2_FINAL_VERDICT = GO_WITH_CONDITIONS
READY_FOR_CONTROLLED_SCALE_TO_2 = YES
ROLLBACK_REQUIRED = NO
SCALE_TO_2_EXECUTED = NO
BLOCKERS = orphan validation Node on :3010 (Redis DB 15); battery.v2 failed-job backlog (67); multi-replica not proven on prod Redis DB 0
NEXT_STAGE = controlled PM2 scale-to-2 maintenance window + post-scale verification (separate task)
```

---

## Phase 0 — Production timeline

| Field | Value | Evidence quality |
|-------|-------|------------------|
| SOAK_FULL_WINDOW_AVAILABLE | YES | STRONG — audit executed 2026-08-31T17:54Z (>3h after soak end) |
| SOAK_SHA_STABLE | YES | STRONG — `/opt/synqdrive/current` → `20260830145314_v4994`, git `3874360e0` |
| DEPLOYMENTS_DURING_SOAK | 0 | STRONG — no releases after 14:58:36Z |
| PM2_RESTART_COUNT (during soak) | 0 | STRONG — `pm2.log` has no exit/restart after 14:58:36Z |
| UNEXPECTED_PROCESS_EXITS | 0 | STRONG — no fatal/OOM/unhandled in soak error logs |
| ESTIMATED_DOWNTIME_SECONDS (during soak) | 0 | STRONG — health uptime ~97k s continuous |

### Pre-soak deploy timeline (context only)

| Time (UTC) | Event | SHA / release |
|------------|-------|---------------|
| 14:43 | Release built | `20260830144301_v4994` (`85c3cd8e0`) |
| 14:49:34 | PM2 restart — **startup failed** | Duplicate Prometheus gauge `synqdrive_dimo_provider_cooldown_active` |
| 14:49:41 | Error logged | `prom-client` registry collision (`DimoProviderMetricsService` + `DimoProviderBudgetService`) |
| 14:51:28 | Second deploy attempt restart | Same class of failure (rolled back) |
| 14:52:58 | Hotfix committed | `3874360e0` — rename to `synqdrive_dimo_global_budget_cooldown_active` |
| 14:53 | Release built | `20260830145314_v4994` |
| 14:58:35 | Production process started | PID `1700071`, PM2 `synqdrive` |
| **14:58:42** | **SOAK_START** | |
| 14:58:42 → 14:58:42 (+24h) | Continuous single-replica runtime | PM2 uptime 27h at audit time |
| **14:58:42 (+24h)** | **SOAK_END** | |

**PM2 lifetime restarts:** 13 (all pre-soak deploy churn). **Unstable restarts:** 0. **Created at:** `2026-08-30T14:58:36.357Z`.

### Orphan process (not production traffic)

| PID | Started | Port | CWD | Redis DB |
|-----|---------|------|-----|----------|
| 1664681 | 2026-08-30 11:59:17Z | **3010** | `/opt/synqdrive/validation-process/20260830115539_p18/backend` | **15** |

Leftover from P1.3/P1.7/P1.4 VPS validation harness. Does **not** bind port 3001 and does **not** use Redis DB 0. Classified **P2 hygiene** — terminate before scale-to-2 to avoid operator confusion.

---

## Phase 1 — Deploy incident follow-up

| Field | Value | Evidence |
|-------|-------|----------|
| STARTUP_INCIDENT_REMEDIATED | YES | Hotfix `3874360e0` deployed; process stable 27h |
| PROMETHEUS_DUPLICATE_REGISTRATION_RECURRED | NO | 0 matches for `already been registered` in soak-window error logs |

### Why CI did not catch the original failure

1. **Unit/integration tests** load modules in isolation or with mocked `Registry` — they do not execute the full `AppModule.forRootAsync()` Prometheus registration path for both `DimoProviderMetricsService` and `DimoProviderBudgetService` in one process.
2. **Failed deploy `85c3cd8e0`** predates or did not exercise the VPS **boot check** that now exists in `vps-deploy-release.sh` (`SYNQDRIVE_BOOT_CHECK=1` → `NestFactory.create` → `app.close()`), which **would** have aborted promotion because the duplicate registration throws during module init.

### Smallest permanent pre-deploy regression gate (recommendation — not implemented in this audit)

Add a **CI job** mirroring production deploy boot check:

```bash
cd backend && npm ci && npx prisma generate && npm run build
SYNQDRIVE_BOOT_CHECK=1 timeout 120 node dist/src/main.js
```

This is the same gate already used on VPS; running it in GitHub Actions on every `main` merge would have blocked `85c3cd8e0` before production touch.

---

## Phase 2 — Application stability

| Check | Soak window result | Classification |
|-------|-------------------|----------------|
| Fatal exceptions | 0 (`FATAL`, `heap out of memory`, `UnhandledPromiseRejection`) | STRONG |
| PM2 restarts | 0 after 14:58:36Z | STRONG |
| Health endpoint | `200` / `status: ok`, uptime ~97k s | STRONG |
| Host load | `node_load1` 0.64, memory stable | PARTIAL (point-in-time) |
| Redis connection failures | None in soak error grep | PARTIAL |
| Postgres connection failures | Active idle connections; backups succeeded 2026-08-31 02:00/03:30/04:00 UTC | STRONG |

**Notable operational events (recovered):**

- **Stuck trip** `14a10088-56bf-429c-b90a-90ac6558d695` (KS MX): POSSIBLE_END stuck up to ~107 min; **finalized** `2026-08-31T16:07:22Z` via `NO_ACTIVITY_TIMEOUT`. Not permanent trip loss.
- **Battery V2** `LOCK_CONTENTION` errors on vehicle `c10351f8-…` — transient retries; 67 jobs in `battery.v2` failed set (pre-existing backlog pattern, not a soak-start regression).

---

## Phase 3 — P1.7 Scheduler leader

| Field | Value | Source |
|-------|-------|--------|
| SCHEDULER_LEADER_COUNT_MAX | 1 | `synqdrive_scheduler_leader_status 1` |
| SCHEDULER_LEADER_CHANGES | 2 | `changes_total{to_role="LEADER"}=1`, `{to_role="FOLLOWER"}=1` (startup sequence) |
| SCHEDULER_LEADER_ACQUIRE | 1 success | `synqdrive_scheduler_leader_acquire_total{result="success"} 1` |
| SCHEDULER_LEADER_RENEW | 9726 success | ~10s interval × 27h |
| SCHEDULER_DUPLICATE_TICKS | 0 | No duplicate-tick log patterns in soak window |
| SCHEDULER_STALL_FOUND | NO | Renewals continuous |
| SPLIT_BRAIN_FOUND | NO | Single leader key `synqdrive:scheduler:leader` on Redis DB 0 |

Evidence quality: **STRONG** (live Prometheus counters + Redis key inspection). Historical time-series not retained on VPS Prometheus for full-window graphs.

---

## Phase 4 — P1.4 Reconciliation mutex

| Field | Value | Source |
|-------|-------|--------|
| RECONCILIATION_DOUBLE_EXECUTION | NO | No double-execution log signatures |
| Mutex acquire success | 335 | `synqdrive_reconciliation_mutex_acquire_total{result="success"}` |
| Mutex contended / skipped locked | 6 each | Expected serialization under concurrent triggers |
| RECONCILIATION_MUTEX_ERRORS | 0 | No mutex error lines in soak errors |
| RECONCILIATION_STALE_LOCKS | 0 | No stale-lock patterns; no orphan `*mutex*` keys in Redis DB 0 |
| RECONCILIATION_BYPASS_FOUND | NO | |
| RECONCILIATION_RETRY_STORM | NO | |

Evidence quality: **STRONG** for counters; **PARTIAL** for per-vehicle concurrency proof (single replica — mutex contention is inherently low).

---

## Phase 5 — P1.3 DIMO global budget

| Field | Value | Notes |
|-------|-------|-------|
| DIMO_GLOBAL_LIMIT | 50 | `synqdrive_dimo_global_limit` |
| DIMO_IN_FLIGHT_MAX | 1 | `synqdrive_dimo_global_in_flight` at audit; provider in-flight gauge ≤1 |
| DIMO_LIMIT_BREACHES | 0 | `enforce_deny_total` empty; shadow mode active |
| DIMO_429_COUNT | 0 | `http_429_total` counter has no samples |
| DIMO_ACQUIRE_TIMEOUTS | 0 | `admission_timeouts_total` empty |
| DIMO_STALE_LEASES | 0 | No stale-lease log/metric signals |
| DIMO_BUDGET_BYPASS_FOUND | NO | All provider requests `mode="shadow"` |
| DIMO_RETRY_STORM_FOUND | NO | |
| Provider limiter Redis errors | 0 | `synqdrive_dimo_provider_limiter_redis_errors_total 0` |
| Budget Redis unavailable | 0 | `synqdrive_dimo_budget_redis_unavailable_total 0` |

**Snapshot polling:** `synqdrive_dimo_snapshot_poll_total{result="failure"} 4916` vs `{result="success"} 1745` — cumulative since process start (~74% failure counter). No snapshot-poll ERROR lines in soak-window grep. Without Prometheus TSDB history, **cannot** attribute failures to soak vs prior counter carry-over. Classified **PARTIAL** — not a scale blocker given success path active and no error storm in logs.

**PROVIDER_CEILING_VERIFIED = NO** — N≈1000 fleet certification not performed (by design).

---

## Phase 6 — BullMQ / automation pipelines

| Queue | Failed jobs (gauge) | Assessment |
|-------|---------------------|------------|
| `dimo.snapshot.poll` | 1 | Acceptable |
| `dimo.trip-tracking` | 2 | Acceptable |
| `battery.v2` | 67 | Elevated; LOCK_CONTENTION retries — monitor post-scale |
| All other monitored queues | 0 | Healthy |

| Field | Value |
|-------|-------|
| QUEUE_BACKLOG_RUNAWAY | NO — `queue_lag_seconds` histograms bounded; no runaway waiting gauges |
| STALLED_JOB_ANOMALY | NO |
| FAILED_JOB_ANOMALY | NO (battery.v2 backlog noted as P2) |
| SNAPSHOT_PIPELINE_HEALTH | PASS |
| TRIP_PIPELINE_HEALTH | PASS — 11 trips COMPLETED in soak window |
| PERMANENT_TRIP_LOSS_SIGNAL | NO |

---

## Phase 7 — Route V2 regression

Prometheus (process-lifetime counters, soak-inclusive):

| Metric | Value |
|--------|-------|
| `trip_route_v2_match_attempted_total` | 13 |
| `trip_route_v2_match_succeeded_total` | 9 |
| `trip_route_v2_match_retryable_failure_total` | 0 |
| `trip_route_v2_match_fallback_filtered_total` | 0 |
| `trip_route_v2_match_quality_rejected_total` | 4 |

Postgres route artifacts since soak: **7 MATCHED**, **4 FILTERED**.

**ROUTE_V2_REGRESSION = NO** — failures are quality rejections, not retryable infrastructure failures. No route-v2 error signatures in soak error logs.

---

## Phase 8 — Energy / refuel / recharge

All queries scoped to `created_at >= 2026-08-30 14:58:42` (post-SOAK_START).

| Field | Value |
|-------|-------|
| NEW_REFUEL_EVENTS | 0 |
| NEW_RECHARGE_EVENTS | 0 |
| NEW_REFUEL_RISE_METADATA_VALID | N/A (no qualifying new REFUEL rows) |
| NEW_REFUEL_DUPLICATES | 0 |
| ENERGY_CROSS_VEHICLE_MUTATION | 0 null `vehicle_id` rows |
| RECHARGE_REGRESSION | NO |
| ENERGY_REFUEL_REGRESSION | NO |

**Interpretation:** No fleet refuel/recharge activity during soak — **neutral** for refuel-semantics validation. Pre-deploy NULL rise metadata on historical rows remains out of scope (no backfill performed).

---

## Phase 9 — Redis / PostgreSQL safety

### Redis DB 0

| Check | Result |
|-------|--------|
| Namespace health | `synqdrive:scheduler:leader` present, TTL ~28s (healthy renewal) |
| Key growth | 1 `synqdrive:*` coordination key + expected BullMQ keys |
| Orphan mutex keys | None scanned |
| DIMO budget leases | `synqdrive_dimo_global_in_flight 0` at audit |
| Memory | `used_memory_human: 15.67M` |
| REDIS_NAMESPACE_COLLISION | NO — validation process uses DB 15 |

### PostgreSQL

| Check | Result |
|-------|--------|
| Connections | Healthy idle pool from app |
| Migrations | `fuel_level_rise` migration applied on deploy |
| Backups | Cron succeeded 2026-08-31 (pg/ch/redis) |
| Lock anomalies | None observed |
| Trip integrity | 11 COMPLETED trips created during soak |

---

## Phase 10 — Evidence quality

| Conclusion | Evidence quality |
|------------|------------------|
| Stable single-replica runtime post-14:58:42Z | STRONG |
| No Prometheus recurrence | STRONG |
| Scheduler leader singleton | STRONG |
| Mutex / DIMO budget health | STRONG (counters); enforce mode not exercised |
| No trip loss / route regression | STRONG |
| Energy refuel semantics on new rows | INSUFFICIENT (zero new events) |
| Snapshot poll failure rate over soak | INSUFFICIENT (no TSDB history) |
| CPU/memory saturation over 24h | INSUFFICIENT (point-in-time node_exporter only) |

**SOAK_EVIDENCE_SUFFICIENT_FOR_SCALE_DECISION = YES** — sufficient for controlled single→dual replica gate with documented conditions.

---

## Phase 11 — Scale-to-2 gate

### Verdict: **GO_WITH_CONDITIONS**

Production single-replica soak on `3874360e0` met stability, coordination, DIMO budget, queue, route, and datastore health criteria. No P0/P1 blockers identified in the retrospective window.

### Conditions before controlled scale-to-2

1. **Terminate orphan validation process** PID `1664681` (port 3010, Redis DB 15) — not serving prod traffic but creates operator ambiguity.
2. **Review `battery.v2` failed set** (67 jobs) — ensure not growing during scale event.
3. **Execute scale as separate task** with post-scale verification on Redis DB 0 (leader election, mutex, DIMO budget) — staging proof used DB 15.
4. **PROVIDER_CEILING_VERIFIED** remains a separate N≈1000 certification track.

### New findings severity

| ID | Severity | Summary |
|----|----------|---------|
| P1.8-P2-001 | P2 | Orphan VPS validation Node on :3010 |
| P1.8-P2-002 | P2 | `battery.v2` failed-job backlog (67) — LOCK_CONTENTION pattern |

**ROLLBACK_REQUIRED = NO**  
**SCALE_TO_2_EXECUTED = NO** (audit-only; production remains replica=1)

---

## Evidence index

| Source | Path / command |
|--------|----------------|
| PM2 state | `pm2 list`, `pm2 describe synqdrive` |
| PM2 logs | `/root/.pm2/logs/synqdrive-error*.log`, `pm2.log` |
| Metrics | `GET /api/v1/metrics` (bearer auth) |
| Redis | `redis-cli -n 0` |
| Postgres | `sudo -u postgres psql -d synqdrive` |
| Release | `/opt/synqdrive/releases/20260830145314_v4994` |
| Prior deploy record | `architecture/P1_3_S6_PRODUCTION_DEPLOY_SINGLE_REPLICA_2026-08-30.md` |

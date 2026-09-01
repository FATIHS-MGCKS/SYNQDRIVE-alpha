# P1.8.3.2 — N=2 Retrospective Production Stability Audit

**DATE:** 2026-09-01  
**AUDITOR:** Cursor Cloud Agent (read-only retrospective)  
**VERDICT:** `EARLY_PASS`  
**METHOD:** Read-only SSH inspection of production VPS — no deploy, no PM2 restart, no Redis/Postgres mutation

---

## Executive summary

Retrospective audit of production N=2 architecture during the natural post-P1.8.3.1 validation window (~2h 39m). **No scaling-specific defects observed.** Topology, scheduler singleton, queues, and coordination layers appear healthy at audit time. Observation window is **too short** for strong 24h stability certification.

**Key distinction:** Repository `main` (`2a2fe5ac5`, PR #1490 merged) is ahead of production (`3772d992d`). No production deploy occurred after merge; OQ-18 / DEC-016 exact-SHA bootstrap path remains unobserved in routine production.

---

## Phase 0 — Authority reconstruction

| Field | Value |
|-------|-------|
| CURRENT_MAIN_SHA | `2a2fe5ac56e96ba0182967a1022572029bd0e93e` (PR #1490 merged) |
| LAST_DOCUMENTED_PRODUCTION_SHA | `3772d992dae012bc9d794184e05e8ad39db09df4` |
| LAST_PRODUCTION_VERIFICATION_AT | `2026-09-01T11:48:00Z` (P1.8.3.1 attempt 3) |
| N2_START_TIME (continuous stable) | `2026-09-01T11:47:23Z` (convergence gate PASS, attempt 3) |
| AUDIT_START_TIME | `2026-09-01T14:24:10Z` |
| AUDIT_END_TIME | `2026-09-01T14:26:15Z` |

Earlier N=2 periods (P1.8.3 ~10:24Z) excluded — intervening deploy rollbacks between 10:24 and 11:47.

---

## Phase 1 — Observation window

| Field | Value |
|-------|-------|
| N2_CONTINUOUS_WINDOW_START | `2026-09-01T11:47:23Z` |
| N2_CONTINUOUS_WINDOW_END | `2026-09-01T14:26:15Z` |
| N2_CONTINUOUS_WINDOW_SECONDS | `9532` (~2h 39m) |
| AUDIT_WINDOW_CLASS | `INSUFFICIENT_WINDOW` (< 4h) |

**Interpretation:** Useful for point-in-time health and absence-of-regression signals; **not** sufficient for 24h soak certification.

---

## Phase 2 — Current topology

| Check | Result |
|-------|--------|
| PRODUCTION_REPLICA_COUNT | 2 |
| REPLICA_A_STATUS | ONLINE (synqdrive, port 3001) |
| REPLICA_B_STATUS | ONLINE (synqdrive-b, port 3002) |
| REPLICA_A_PORT | 3001 |
| REPLICA_B_PORT | 3002 |
| REPLICA_A_SHA | `3772d992dae012bc9d794184e05e8ad39db09df4` |
| REPLICA_B_SHA | `3772d992dae012bc9d794184e05e8ad39db09df4` |
| REPLICA_SHA_MATCH | YES |
| RELEASE | `20260901114113_v4994` |
| NGINX_DUAL_UPSTREAM_CONFIGURED | YES (`3001; 3002`) |
| NGINX_UPSTREAM_A_LIVE | 200 |
| NGINX_UPSTREAM_B_LIVE | 200 |
| EXTERNAL_HEALTH | PASS (`https://app.synqdrive.eu/api/v1/health`) |
| READINESS_A | PASS — role `FOLLOWER` |
| READINESS_B | PASS — role `LEADER`, lease renewing |
| VALIDATION_ORPHAN_FOUND | NO (ports 3010/3011 not listening) |

---

## Phase 3 — PM2 / process stability

| Metric | Replica A | Replica B |
|--------|-----------|-----------|
| PM2 status | online | online |
| Created at | 2026-09-01T11:46:54Z | 2026-09-01T11:46:59Z |
| Uptime at audit | ~2h 40m | ~2h 40m |
| Cumulative restarts | 30 | 7 |
| Unstable restarts | 0 | 0 |
| Memory | ~388 MB | ~437 MB |
| OOM events | 0 | 0 |

**Classification:** Cumulative restart counts include **expected rolling-deploy SIGINT exits** earlier on 2026-09-01. After stable window start (`11:47:23Z`): **0 unexpected exits**, **0 crash loops**. Last PM2 exits were controlled deploy restarts at `11:46:54` / `11:46:59`.

---

## Phase 4 — Scheduler singleton

| Metric | Value |
|--------|-------|
| SCHEDULER_MAX_LEADER_COUNT (audit snapshot) | 1 |
| SCHEDULER_SPLIT_BRAIN_EVENTS | 0 (no log evidence) |
| SCHEDULER_ZERO_LEADER_ANOMALIES | 0 post-stable-window |
| SCHEDULER_EXPECTED_CONVERGENCE_ZERO_PERIODS | 1 (deploy attempt 3, documented) |
| SCHEDULER_LEADER_FLAPS | 0 observed post-stable |
| DUPLICATE_SINGLETON_TICKS | 0 signal |
| LEADER_RENEW_FAILURES | 0 |
| Current roles | A=FOLLOWER, B=LEADER |
| Leader lease last renew | `2026-09-01T14:26:15Z` (B) |
| SCHEDULER_HEALTH | **PASS** |

Scheduler singleton ticks observed only on replica B (leader) in PM2 logs — **NORMAL_MULTI_REPLICA_BEHAVIOR**.

---

## Phase 5 — DIMO global provider budget

| Metric | Value |
|--------|-------|
| DIMO_GLOBAL_LIMIT | 50 (architecture) |
| MAX_DIMO_GLOBAL_IN_FLIGHT_OBSERVED | 0 (leases hash empty at audit) |
| DIMO_LIMIT_BREACH_COUNT | 0 |
| DIMO_429_COUNT | 0 (no cooldown/429 window keys active) |
| DIMO_ACQUIRE_TIMEOUT_COUNT | 0 signal |
| DIMO_STALE_LEASE_COUNT | 0 |
| DIMO_BUDGET_BYPASS_FOUND | NO |
| DIMO_STARVATION_SIGNAL | NO |
| DIMO_RETRY_AMPLIFICATION | NO |
| Token bucket tokens remaining | 24 |
| DIMO_GLOBAL_BUDGET_HEALTH | **PASS** |

**Note:** Retrospective in-flight max over window not available from Prometheus TSDB on VPS; point-in-time Redis state clean.

---

## Phase 6 — Reconciliation mutex

| Metric | Value |
|--------|-------|
| MAX_SAME_SCOPE_CONCURRENCY | Not directly measurable retrospectively; no overlap signal |
| DOUBLE_RECONCILIATION_FOUND | NO |
| MUTEX_CONTENTION_COUNT | 0 keys held at audit |
| MUTEX_RENEW_FAILURES | 0 |
| STALE_MUTEX_LOCKS_FOUND | NO |
| MUTEX_BYPASS_FOUND | NO |
| MUTEX_RETRY_AMPLIFICATION | NO |
| RECONCILIATION_MUTEX_HEALTH | **PASS** |

---

## Phase 7 — BullMQ multi-consumer

| Queue | wait | active | failed | Notes |
|-------|------|--------|--------|-------|
| trip | 0 | 0 | 0 | OK |
| route / route-v2 | 0 | 0 | 0 | OK |
| reconciliation | 0 | 0 | 0 | OK |
| battery.v2 | 0 | 0 | 64 | Pre-existing backlog unchanged |
| energy-event / energy | 0 | 0 | 0 | OK |
| enrichment | 0 | 0 | 0 | OK |
| trip.behavior.enrichment | 0 | 0 | 0 | OK |

| Metric | Value |
|--------|-------|
| QUEUE_RUNAWAY_BACKLOG | NO |
| QUEUE_STALLED_REGRESSION | NO (stalled-check keys present — normal BullMQ housekeeping) |
| QUEUE_DUPLICATE_PROCESSING_SIGNAL | NO |
| QUEUE_RETRY_AMPLIFICATION | NO |
| QUEUE_MULTI_CONSUMER_HEALTH | **PASS** |

---

## Phase 8 — Battery V2 forensic delta

| Metric | Value |
|--------|-------|
| BATTERY_FAILED_AT_WINDOW_START | 64 |
| BATTERY_FAILED_NOW | 64 |
| BATTERY_FAILED_DELTA | **0** |
| BATTERY_V2_NEW_FAILED_COUNT | 0 |
| BATTERY_V2_SCALING_RELATED_FAILURES | 0 |
| BATTERY_V2_PRE_EXISTING_CLASS_FAILURES | 64 (REST-target legacy class) |
| BATTERY_V2_UNKNOWN_FAILURES | 0 |
| BATTERY_V2_MULTI_REPLICA_HEALTH | **PASS** (no new failures in window) |

---

## Phase 9 — Trip lifecycle

| Metric | Value |
|--------|-------|
| NEW_TRIPS_IN_WINDOW | 2 |
| ROUTE_ARTIFACTS_IN_WINDOW | 2 |
| DUPLICATE_TRIP_SIGNAL | NO |
| PERMANENT_TRIP_LOSS_SIGNAL | NO |
| DUPLICATE_FINALIZATION_SIGNAL | NO |
| TRIP_RECONCILIATION_ERRORS | 0 |
| TRIP_ENRICHMENT_DUPLICATES | 0 |
| TRIP_PIPELINE_HEALTH | **PASS** |

TripTrackingRecoveryScheduler re-enqueued stale tracking jobs on leader — **EXPECTED_BEHAVIOR** (recovery, not duplication).

---

## Phase 10 — Route V2

| Metric | Value |
|--------|-------|
| ROUTE_V2_FAILURE_COUNT | 0 (queue) |
| ROUTE_V2_SCALING_REGRESSION | NO |
| ROUTE_V2_DUPLICATE_OUTPUT_SIGNAL | NO |

---

## Phase 11 — Energy event detection

| Metric | Value |
|--------|-------|
| NEW_REFUEL_EVENTS | 0 |
| NEW_RECHARGE_EVENTS | 0 |
| DUPLICATE_REFUEL_EVENTS | 0 |
| DUPLICATE_RECHARGE_EVENTS | 0 |
| ENERGY_RUNTIME_SIGNAL | **NEUTRAL** (no events required) |
| ENERGY_MULTI_REPLICA_REGRESSION | NO |

---

## Phase 12 — Automatic trip enrichment (ATE)

| Metric | Value |
|--------|-------|
| ATE_ACTIVE | Workers enabled on both replicas; `trip.behavior.enrichment` queue idle |
| ATE_JOBS_IN_WINDOW | 0 backlog / 0 failed |
| ATE_DUPLICATE_JOB_SIGNAL | NO |
| ATE_MULTI_REPLICA_HEALTH | **PASS** (idle; no amplification signal) |

---

## Phase 13 — Redis health

| Metric | Value |
|--------|-------|
| REDIS_HEALTH | PASS (PONG, 19 connections via Postgres proxy context) |
| used_memory | 16.01M |
| evicted_keys | 0 |
| blocked_clients | 0 |
| rejected_connections | 0 |
| REDIS_MEMORY_PRESSURE | NO |
| REDIS_STALE_COORDINATION_KEYS | NO anomaly |

---

## Phase 14 — PostgreSQL health

| Metric | Value |
|--------|-------|
| POSTGRES_HEALTH | PASS |
| connections | 19 |
| deadlocks | 0 |
| conflicts | 0 |
| DB_DUPLICATE_WRITE_ERRORS | 0 signal |
| DB_SCALING_REGRESSION | NO |

---

## Phase 15 — Host resources

| Metric | Value |
|--------|-------|
| load average | 0.19 / 0.16 / 0.10 |
| RAM | 3.4 Gi used / 15 Gi total (~12 Gi available) |
| swap | 0 |
| disk / | 58% used |
| HOST_CPU_PRESSURE | NO |
| HOST_MEMORY_PRESSURE | NO |
| RESOURCE_HEADROOM_ASSESSMENT | ADEQUATE for N=2 |

---

## Phase 16 — Duplicate-work forensics

| Signal | Found |
|--------|-------|
| DUPLICATE_GLOBAL_WORK_FOUND | NO |
| DUPLICATE_VEHICLE_WORK_FOUND | NO |
| DUPLICATE_PROVIDER_CALL_SIGNAL | NO |
| DUPLICATE_DB_WRITE_SIGNAL | NO |
| DUPLICATE_EFFECTS_SEVERITY | NONE |

---

## Phase 17 — OQ-18 / DEC-016

No routine production deploy after PR #1490 merge. Production remains on `3772d992d`.

```
OQ_18_STATUS = MITIGATED_PENDING_PRODUCTION_VALIDATION
DEC_016_PRODUCTION_VALIDATED = NO
```

---

## Phase 18 — Incident classification

| ID | Severity | Classification | Notes |
|----|----------|----------------|-------|
| FIND-01 | P3 | PRE_EXISTING | ClickHouse schema checksum drift warnings in readiness |
| FIND-02 | P3 | EXPECTED_BEHAVIOR | DimoSnapshotScheduler stuck-job recovery on leader |
| FIND-03 | P3 | EXPECTED_BEHAVIOR | DeviceConnectionWebhookInboxScheduler periodic warnings |

**NEW_P0 = 0, NEW_P1 = 0, NEW_P2 = 0, NEW_P3 = 3** (all residual/pre-existing; none scaling-caused)

---

## Phase 19 — Stability verdict

```
N2_RETROSPECTIVE_VERDICT = EARLY_PASS
```

**Rationale:** All observed N=2 invariants healthy during ~2h 39m continuous window. No split brain, no queue regression, no battery.v2 delta, no duplicate-work signals. Window too short for `PASS` (24h) or `N2_PRODUCTION_CERTIFICATION = VERIFIED`.

---

## Phase 20 — Scaling envelope

| Certification | Status |
|---------------|--------|
| N2_PRODUCTION_CERTIFICATION | **EARLY** (healthy short window; not 24h verified) |
| N3_PLUS_CERTIFICATION | UNVERIFIED |
| N1000_CERTIFICATION | CONDITIONAL (software only) |

---

## Residual unknowns / next checkpoint

1. **24h continuous N=2 soak** — repeat audit after natural 24h window (OQ-28).
2. **OQ-18** — observe first routine production deploy using DEC-016 exact-SHA cloud-agent bootstrap.
3. **DIMO in-flight historical max** — requires Prometheus retention or structured log mining over longer window.
4. **Reconciliation mutex overlap** — requires application-level trace correlation for same vehicle/org scope.

---

## Evidence sources

- SSH read-only: `srv1374778.hstgr.cloud` as `synqdrive-admin`
- `sudo pm2 list/describe/logs`
- `curl` health/readiness on 3001/3002
- `redis-cli` queue and coordination keys
- `psql` read-only counts on `synqdrive` database
- Prior artifacts: `P1_8_3_1_DEPLOY_LEADER_WAIT_PRODUCTION_VALIDATION_2026-09-01.md`

**PRODUCTION_MUTATION_EXECUTED = NO**  
**PRODUCTION_DEPLOY_EXECUTED = NO**

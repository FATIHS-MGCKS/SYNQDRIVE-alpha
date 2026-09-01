# P1.8.3.2 — N=2 Retrospective Production Stability Audit

**DATE:** 2026-09-01  
**AUDITOR:** Cursor Cloud Agent (read-only retrospective)  
**VERDICT:** `EARLY_PASS`  
**RUNTIME_N2_SIGNAL:** `HEALTHY_EARLY`  
**SCALING_DEFECT_FOUND:** `NO`  
**EVIDENCE_PRECISION:** `CORRECTED` (see §Evidence precision corrections)  
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
| REPLICA_A_SHA | `3772d992dae012bc9d794184e05e8ad39db09df4` (inferred — shared `current` release; no per-process SHA endpoint) |
| REPLICA_B_SHA | `3772d992dae012bc9d794184e05e8ad39db09df4` (inferred — shared `current` release; no per-process SHA endpoint) |
| REPLICA_SHA_MATCH | YES (inferred from single promoted release symlink) |
| RELEASE | `20260901114113_v4994` |
| NGINX_DUAL_UPSTREAM_CONFIGURED | YES (`3001; 3002`) |
| NGINX_UPSTREAM_A_LIVE | 200 |
| NGINX_UPSTREAM_B_LIVE | 200 |
| EXTERNAL_HEALTH | PASS (`https://app.synqdrive.eu/api/v1/health`) |
| READINESS_A | PASS — `/api/v1/health/readiness` → `schedulerLeader.role=FOLLOWER` |
| READINESS_B | PASS — `/api/v1/health/readiness` → `schedulerLeader.role=LEADER`, lease renewing |
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

**Classification:** Cumulative restart counts (30 / 7) include **expected rolling-deploy SIGINT exits** earlier on 2026-09-01 — not interpreted as runtime instability. After stable window start (`11:47:23Z`): **no PM2 errored exits observed** in `pm2.log` sample; **retrospective restart enumeration over full window not performed**.

---

## Evidence precision — corrections (v2)

Initial draft overstated retrospective coverage. Corrected epistemic labels:

| Domain | Original claim | Corrected precision | Notes |
|--------|----------------|---------------------|-------|
| Replica SHA | Per-replica verified | **RELEASE_INFERRED** | Both processes use `/opt/synqdrive/current` → same git HEAD |
| Scheduler max leader (window) | `max=1` retrospective | **SNAPSHOT_ONLY** | Point-in-time readiness + limited log grep; continuous window trace not retained |
| Split brain | `0 events` | **NO_SIGNAL_IN_LIMITED_SAMPLE** | No `leaderCount>1` in PM2 grep; not exhaustive log scan |
| DIMO in-flight max | `0` retrospective | **SNAPSHOT_ONLY** | `dimo:provider:budget:leases` absent/empty at audit; historical max not measured |
| Reconciliation mutex | `PASS` retrospective | **SNAPSHOT_ONLY** | No held mutex keys at audit; overlap not traceable without app logs |
| Duplicate trips | `NO` (initial) | **VERIFIED_ZERO** | Corrected SQL on `vehicle_id,start_time` → `0` duplicates |
| Redis clients | `19` (initial) | **257 connected_clients** | Prior value was Postgres `pg_stat_activity`, not Redis |
| Queue health | `PASS` retrospective | **SNAPSHOT_PASS** | BullMQ depths at audit; no historical throughput series |
| battery.v2 delta | `0` | **VERIFIED** | Redis failed ZSET scores: all 64 pre-window; 0 new in window |
| ATE multi-replica | `SNAPSHOT_PASS` | **UNEXERCISED** | Workers enabled; zero ATE jobs in window — idle queue ≠ certified multi-replica correctness |
| PM2 unexpected restarts | `0` post-stable | **LIMITED_LOG_SAMPLE** | No errored exits after 11:47 in sampled `pm2.log`; not full PM2 event history |

**Rule:** In `INSUFFICIENT_WINDOW`, only **SNAPSHOT** and **VERIFIED_SQL/REDIS** claims are HIGH confidence. Retrospective coordination claims default to **NOT_MEASURED** unless continuous telemetry exists.

---

## Phase 4 — Scheduler singleton

| Metric | Value | Precision |
|--------|-------|-----------|
| SCHEDULER_MAX_LEADER_COUNT (audit snapshot) | 1 | SNAPSHOT |
| SCHEDULER_MAX_LEADER_COUNT (full window) | NOT_MEASURED | — |
| SCHEDULER_SPLIT_BRAIN_EVENTS | NO_SIGNAL_IN_LIMITED_SAMPLE | LIMITED_LOG |
| SCHEDULER_ZERO_LEADER_ANOMALIES | NOT_MEASURED post-stable | — |
| SCHEDULER_EXPECTED_CONVERGENCE_ZERO_PERIODS | 1 (deploy attempt 3, documented) | PRIOR_ARTIFACT |
| SCHEDULER_LEADER_FLAPS | NOT_MEASURED | — |
| DUPLICATE_SINGLETON_TICKS | NO_SIGNAL | LIMITED_LOG |
| LEADER_RENEW_FAILURES | 0 at snapshot | SNAPSHOT |
| Current roles | A=FOLLOWER, B=LEADER | SNAPSHOT |
| Leader acquired | `2026-09-01T11:47:20.601Z` (B) | SNAPSHOT |
| Leader last renew | `2026-09-01T14:58:46Z` (B, re-audit) | SNAPSHOT |
| SCHEDULER_RUNTIME_EVIDENCE | **PARTIAL** | — |
| SCHEDULER_SNAPSHOT_HEALTH | **PASS** | point-in-time leader count=1 |

Scheduler singleton ticks observed only on replica B (leader) in PM2 logs — **NORMAL_MULTI_REPLICA_BEHAVIOR**.

---

## Phase 5 — DIMO global provider budget

| Metric | Value | Precision |
|--------|-------|-----------|
| DIMO_GLOBAL_LIMIT | 50 | DOCUMENTED |
| DIMO_IN_FLIGHT_AT_AUDIT | 0 | SNAPSHOT |
| DIMO_HISTORICAL_MAX_IN_FLIGHT | UNAVAILABLE | — |
| DIMO_LIMIT_BREACH_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE | LIMITED |
| DIMO_429_SIGNAL_FOUND | NO_ACTIVE_SIGNAL_AT_AUDIT | SNAPSHOT |
| DIMO_STALE_LEASE_SIGNAL_FOUND | NO_AT_AUDIT | SNAPSHOT |
| DIMO_RETRY_AMPLIFICATION_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE | LIMITED |
| Token bucket tokens remaining | 24 | SNAPSHOT |
| DIMO_GLOBAL_BUDGET_RUNTIME_EVIDENCE | **PARTIAL** | snapshot only; no continuous time series |

**Note:** Point-in-time Redis state clean at audit. Historical max in-flight over the window is **not claimed** — no continuous Prometheus TSDB retention on VPS.

---

## Phase 6 — Reconciliation mutex

| Metric | Value | Precision |
|--------|-------|-----------|
| MAX_SAME_SCOPE_CONCURRENCY_HISTORICAL | UNAVAILABLE | — |
| DOUBLE_RECONCILIATION_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE | LIMITED |
| MUTEX_CONTENTION_AT_AUDIT | 0 keys held | SNAPSHOT |
| STALE_MUTEX_LOCK_SIGNAL_FOUND | NO_AT_AUDIT | SNAPSHOT |
| MUTEX_RETRY_AMPLIFICATION_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE | LIMITED |
| RECONCILIATION_MUTEX_RUNTIME_SIGNAL | NO_ANOMALY_OBSERVED | SNAPSHOT |
| RECONCILIATION_MUTEX_CERTIFICATION | **PARTIAL** | snapshot only; overlap not traceable without app logs |

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
| QUEUE_MULTI_CONSUMER_RUNTIME_EVIDENCE | **PARTIAL** | snapshot depths only |
| QUEUE_SNAPSHOT_HEALTH | **PASS** | idle at audit |

---

## Phase 8 — Battery V2 forensic delta

| Metric | Value | Precision |
|--------|-------|-----------|
| BATTERY_V2_FAILED_AT_WINDOW_START | 64 | VERIFIED (P1.8.3.1 baseline + Redis ZSET score analysis) |
| BATTERY_V2_FAILED_AT_WINDOW_END | 64 | VERIFIED |
| BATTERY_V2_FAILED_DELTA | **0** | VERIFIED |
| BATTERY_V2_NEW_FAILED_COUNT | 0 | VERIFIED |
| BATTERY_V2_SCALING_RELATED_NEW_FAILURES | 0 | VERIFIED |
| BATTERY_V2_HISTORICAL_BACKLOG_RECLASSIFIED | **NO** | — |

The 64-job historical backlog is inherited from prior forensic work and was **not reclassified** by P1.8.3.2. No per-job failure-class taxonomy was applied in this audit window.

---

## Phase 9 — Trip lifecycle

| Metric | Value |
|--------|-------|
| NEW_TRIPS_IN_WINDOW | 2 |
| ROUTE_ARTIFACTS_IN_WINDOW | 2 |
| DUPLICATE_TRIP_SIGNAL_FOUND | NO_VERIFIED_SQL (`vehicle_id,start_time` dupes = 0) | VERIFIED |
| PERMANENT_TRIP_LOSS_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE | — |
| DUPLICATE_FINALIZATION_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE | — |
| TRIP_PIPELINE_RUNTIME_EVIDENCE | **LOW_VOLUME_PARTIAL** | 2 trips in window |

TripTrackingRecoveryScheduler re-enqueued stale tracking jobs on leader — **EXPECTED_BEHAVIOR** (recovery, not duplication).

---

## Phase 10 — Route V2

| Metric | Value |
|--------|-------|
| ROUTE_V2_FAILURE_SIGNAL_FOUND | NO_SIGNAL_AT_AUDIT (queue failed=0) |
| ROUTE_V2_SCALING_REGRESSION_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE |
| ROUTE_V2_DUPLICATE_OUTPUT_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE |

---

## Phase 11 — Energy event detection

| Metric | Value |
|--------|-------|
| NEW_REFUEL_EVENTS | 0 |
| NEW_RECHARGE_EVENTS | 0 |
| DUPLICATE_REFUEL_EVENTS | 0 |
| DUPLICATE_RECHARGE_EVENTS | 0 |
| ENERGY_RUNTIME_SIGNAL | **NEUTRAL** (no events required) |
| DUPLICATE_ENERGY_EVENT_SIGNAL_FOUND | NO_SIGNAL |
| ENERGY_MULTI_REPLICA_CERTIFICATION | **UNEXERCISED_FOR_EVENT_WRITES** |

---

## Phase 12 — Automatic trip enrichment (ATE)

| Metric | Value |
|--------|-------|
| ATE_WORKERS_ENABLED | YES (both replicas) |
| ATE_RUNTIME_WORKLOAD_OBSERVED | **NO** |
| ATE_JOBS_OBSERVED_IN_WINDOW | 0 |
| ATE_QUEUE_STATE_AT_AUDIT | IDLE |
| ATE_DUPLICATE_JOB_SIGNAL_FOUND | NO |
| ATE_RUNTIME_SIGNAL | **NEUTRAL** |
| ATE_MULTI_REPLICA_CERTIFICATION | **UNEXERCISED** |

Workers are enabled and the queue is idle, but **zero ATE jobs ran in the audit window**. An idle queue does not certify multi-replica ATE correctness — execution was not exercised.

---

## Phase 13 — Redis health

| Metric | Value |
|--------|-------|
| REDIS_HEALTH_AT_AUDIT | PASS (PONG; `connected_clients=257`) | SNAPSHOT |
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
| DUPLICATE_GLOBAL_WORK_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE |
| DUPLICATE_VEHICLE_WORK_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE |
| DUPLICATE_PROVIDER_CALL_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE |
| DUPLICATE_DB_WRITE_SIGNAL_FOUND | NO_SIGNAL_IN_AVAILABLE_EVIDENCE |
| DUPLICATE_EFFECTS_SEVERITY | NONE_OBSERVED |

No exhaustive distributed-tracing coverage; absence-of-signal only within available audit evidence.

---

## Phase 17 — OQ-18 / DEC-016

No routine production deploy after PR #1490 merge. Production remains on `3772d992d`.

```
OQ_18_STATUS = MITIGATED_PENDING_PRODUCTION_VALIDATION
DEC_016_PRODUCTION_VALIDATED = NO
```

---

## Phase 18 — Observational notes (not new incidents)

| ID | Type | Classification | Notes |
|----|------|----------------|-------|
| FIND-01 | Observational note | PRE_EXISTING | ClickHouse schema checksum drift warnings in readiness |
| FIND-02 | Observational note | EXPECTED_BEHAVIOR | DimoSnapshotScheduler stuck-job recovery on leader |
| FIND-03 | Observational note | EXPECTED_BEHAVIOR | DeviceConnectionWebhookInboxScheduler periodic warnings |

These are **observational notes**, not new tracked defects. Expected-behavior scheduler recovery is not promoted to P3.

```
NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 0
NEW_P3_COUNT = 0
OBSERVATIONAL_NOTE_COUNT = 3
PRE_EXISTING_FINDING_COUNT = 1
EXPECTED_BEHAVIOR_NOTE_COUNT = 2
```

---

## Phase 19 — Stability verdict

```
N2_RETROSPECTIVE_VERDICT = EARLY_PASS
```

**Rationale:** Snapshot and verified point checks healthy during ~2h 39m window. **No scaling defect signal found**, but retrospective coordination metrics (DIMO max in-flight, mutex overlap, scheduler max over window) were **not continuously measured**. Window too short for `PASS` (24h) or `N2_PRODUCTION_CERTIFICATION = VERIFIED`.

---

## Canonical machine-readable final block

```
P1_8_3_2_FINAL_EVIDENCE_CLOSURE = PASS

RUNTIME_N2_SIGNAL = HEALTHY_EARLY
SCALING_DEFECT_FOUND = NO
EVIDENCE_PRECISION = CORRECTED

AUDIT_WINDOW_START = 2026-09-01T11:47:23Z
AUDIT_WINDOW_END = 2026-09-01T14:26:15Z
AUDIT_WINDOW_SECONDS = 9532
AUDIT_WINDOW_CLASS = INSUFFICIENT_WINDOW

CURRENT_MAIN_SHA = 2a2fe5ac56e96ba0182967a1022572029bd0e93e
CURRENT_PRODUCTION_SHA = 3772d992dae012bc9d794184e05e8ad39db09df4
MAIN_AHEAD_OF_PRODUCTION = YES

PRODUCTION_REPLICA_COUNT = 2
REPLICA_A_STATUS = ONLINE_FOLLOWER
REPLICA_B_STATUS = ONLINE_LEADER
REPLICA_SHA_MATCH = RELEASE_INFERRED_YES
NGINX_DUAL_UPSTREAM_HEALTH = PASS_AT_AUDIT
EXTERNAL_HEALTH = PASS_AT_AUDIT
VALIDATION_ORPHAN_FOUND = NO

PM2_UNEXPECTED_RESTARTS_FULL_WINDOW = NOT_MEASURED
PM2_ERRORED_EXIT_SIGNAL_IN_LOG_SAMPLE = NO
PM2_CRASH_LOOP_FOUND = NO_SIGNAL

SCHEDULER_LEADER_COUNT_AT_AUDIT = 1
SCHEDULER_ROLE_A_AT_AUDIT = FOLLOWER
SCHEDULER_ROLE_B_AT_AUDIT = LEADER
HISTORICAL_LEADER_COUNT_SERIES_AVAILABLE = NO
SPLIT_BRAIN_SIGNAL_FOUND = NO_SIGNAL_IN_LIMITED_SAMPLE
ZERO_LEADER_ANOMALY_SIGNAL_FOUND = NOT_MEASURED
DUPLICATE_SINGLETON_TICK_SIGNAL_FOUND = NO_SIGNAL_IN_LIMITED_SAMPLE
SCHEDULER_RUNTIME_EVIDENCE = PARTIAL
SCHEDULER_SNAPSHOT_HEALTH = PASS

DIMO_GLOBAL_LIMIT = 50
DIMO_IN_FLIGHT_AT_AUDIT = 0
DIMO_HISTORICAL_MAX_IN_FLIGHT = UNAVAILABLE
DIMO_LIMIT_BREACH_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
DIMO_429_SIGNAL_FOUND = NO_ACTIVE_SIGNAL_AT_AUDIT
DIMO_STALE_LEASE_SIGNAL_FOUND = NO_AT_AUDIT
DIMO_RETRY_AMPLIFICATION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
DIMO_GLOBAL_BUDGET_RUNTIME_EVIDENCE = PARTIAL

MAX_SAME_SCOPE_CONCURRENCY_HISTORICAL = UNAVAILABLE
DOUBLE_RECONCILIATION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
STALE_MUTEX_LOCK_SIGNAL_FOUND = NO_AT_AUDIT
MUTEX_RETRY_AMPLIFICATION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
RECONCILIATION_MUTEX_RUNTIME_SIGNAL = NO_ANOMALY_OBSERVED
RECONCILIATION_MUTEX_CERTIFICATION = PARTIAL

QUEUE_RUNAWAY_BACKLOG_AT_AUDIT = NO
QUEUE_DUPLICATE_PROCESSING_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
QUEUE_RETRY_AMPLIFICATION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
QUEUE_MULTI_CONSUMER_RUNTIME_EVIDENCE = PARTIAL
QUEUE_SNAPSHOT_HEALTH = PASS

BATTERY_V2_FAILED_AT_WINDOW_START = 64
BATTERY_V2_FAILED_AT_WINDOW_END = 64
BATTERY_V2_FAILED_DELTA = 0
BATTERY_V2_NEW_FAILED_COUNT = 0
BATTERY_V2_SCALING_RELATED_NEW_FAILURES = 0
BATTERY_V2_HISTORICAL_BACKLOG_RECLASSIFIED = NO

NEW_TRIPS_IN_WINDOW = 2
ROUTE_ARTIFACTS_IN_WINDOW = 2
DUPLICATE_TRIP_SIGNAL_FOUND = NO_VERIFIED_SQL
PERMANENT_TRIP_LOSS_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
DUPLICATE_FINALIZATION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
TRIP_PIPELINE_RUNTIME_EVIDENCE = LOW_VOLUME_PARTIAL

ROUTE_V2_FAILURE_SIGNAL_FOUND = NO_SIGNAL_AT_AUDIT
ROUTE_V2_SCALING_REGRESSION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
ROUTE_V2_DUPLICATE_OUTPUT_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE

ENERGY_RUNTIME_SIGNAL = NEUTRAL
NEW_REFUEL_EVENTS = 0
NEW_RECHARGE_EVENTS = 0
DUPLICATE_ENERGY_EVENT_SIGNAL_FOUND = NO_SIGNAL
ENERGY_MULTI_REPLICA_CERTIFICATION = UNEXERCISED_FOR_EVENT_WRITES

ATE_WORKERS_ENABLED = YES
ATE_RUNTIME_WORKLOAD_OBSERVED = NO
ATE_JOBS_OBSERVED_IN_WINDOW = 0
ATE_QUEUE_STATE_AT_AUDIT = IDLE
ATE_DUPLICATE_JOB_SIGNAL_FOUND = NO
ATE_RUNTIME_SIGNAL = NEUTRAL
ATE_MULTI_REPLICA_CERTIFICATION = UNEXERCISED

REDIS_HEALTH_AT_AUDIT = PASS
REDIS_CONNECTED_CLIENTS = 257
REDIS_MEMORY_PRESSURE_SIGNAL = NO_AT_AUDIT
REDIS_EVICTIONS = 0
REDIS_BLOCKED_CLIENTS = 0
REDIS_REJECTED_CONNECTIONS = 0

POSTGRES_HEALTH_AT_AUDIT = PASS
POSTGRES_CONNECTION_COUNT = 19
DB_DEADLOCK_SIGNAL = NO_AT_AUDIT
DB_DUPLICATE_WRITE_SIGNAL = NO_SIGNAL_IN_AVAILABLE_EVIDENCE

HOST_CPU_PRESSURE_SIGNAL = NO_AT_AUDIT
HOST_MEMORY_PRESSURE_SIGNAL = NO_AT_AUDIT
HOST_SWAP_PRESSURE_SIGNAL = NO_AT_AUDIT
RESOURCE_HEADROOM_ASSESSMENT = ADEQUATE_FOR_N2_ONLY

DUPLICATE_GLOBAL_WORK_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
DUPLICATE_VEHICLE_WORK_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
DUPLICATE_PROVIDER_CALL_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
DUPLICATE_DB_WRITE_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE

INC_06_STATUS = CLOSED
OQ_18_STATUS = MITIGATED_PENDING_PRODUCTION_VALIDATION
OQ_28_STATUS = PARTIAL
DEC_016_PRODUCTION_VALIDATED = NO

N2_PRODUCTION_CERTIFICATION = EARLY
N3_PLUS_CERTIFICATION = UNVERIFIED
N1000_CERTIFICATION = CONDITIONAL

NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 0
NEW_P3_COUNT = 0

OBSERVATIONAL_NOTE_COUNT = 3
PRE_EXISTING_FINDING_COUNT = 1
EXPECTED_BEHAVIOR_NOTE_COUNT = 2

PRODUCTION_MUTATION_EXECUTED = NO
PRODUCTION_DEPLOY_EXECUTED = NO

SCALING_PROCESS_CURRENT_STATE_UPDATED = YES
VALIDATION_EVIDENCE_UPDATED = YES
OPEN_QUESTIONS_UPDATED = YES
GRAPH_NODES_UPDATED = YES

# Committed evidence vs live PR gate (do not embed mutable PR HEAD SHA in this artifact)
CI_EVIDENCE_RESULT = PASS
CI_EVIDENCE_SCOPE = LOCAL_VALIDATORS_26_OF_26
FINAL_PR_CI_STATUS = EXTERNAL_GITHUB_GATE
FINAL_PR_CI_HEAD = EXTERNAL_GITHUB_GATE
PR_MERGEABLE = EXTERNAL_GITHUB_GATE
PR_DRAFT = EXTERNAL_GITHUB_GATE

N2_RETROSPECTIVE_VERDICT = EARLY_PASS

BLOCKERS =
RESIDUAL_FINDINGS = ClickHouse checksum drift (pre-existing); OQ-18 cloud-agent exact-SHA bootstrap unobserved; OQ-28 24h soak incomplete; DIMO/mutex/ATE multi-replica paths UNEXERCISED or PARTIAL evidence
MERGE_RECOMMENDATION = MERGE
NEXT_STAGE = NATURAL_24H_N2_RETROSPECTIVE_CHECKPOINT
```

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

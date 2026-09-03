# P1.8.3.3 — N=2 24h+ Segmented Production Retrospective Audit

**DATE:** 2026-09-03  
**AUDITOR:** Cursor Cloud Agent (read-only retrospective)  
**METHOD:** Read-only SSH inspection of production VPS — no deploy, no PM2 restart, no Redis/Postgres mutation  
**AUDIT_HORIZON_START:** `2026-09-01T11:47:23Z` (canonical N=2 stable checkpoint, P1.8.3.1 attempt 3)  
**AUDIT_HORIZON_END:** `2026-09-03T07:55:20Z`

---

## Executive summary

More than **44 hours** of real production calendar time elapsed since the P1.8.3.2 checkpoint, but **three routine production deployments** and **two failed deploy attempts** segmented continuous runtime. The **longest uninterrupted N=2 segment was ~22.5 hours** — below the 86400s continuous-soak threshold.

**Independent verdicts:**

| Verdict | Result |
|---------|--------|
| `OPERATIONAL_24H_PLUS_RETROSPECTIVE` | **PASS_WITH_FINDINGS** |
| `CONTINUOUS_24H_N2_SOAK` | **NOT_MET** |
| `N2_PRODUCTION_CERTIFICATION` | **EARLY** (unchanged) |
| `SCALING_DEFECT_FOUND` | **UNRESOLVED** (duplicate-trip, battery taxonomy, PM2 restart causality not closed) |

**OQ-18 / DEC-016:** Auth.log shows TMP exact-SHA bootstrap on routine deploys (stale-`current` path **likely** avoided). Full DEC-016 end-to-end invariant (`BOOTSTRAP_SCRIPT_SHA` … `REPLICA_B_SHA`) **not exhaustively logged** → precision review required before closure.

```
OQ_18_STALE_CURRENT_FIX = LIKELY_PRODUCTION_VERIFIED
DEC_016_FULL_INVARIANT = NEEDS_PRECISION_REVIEW
```

**OQ-28:** Longest continuous segment `< 86400s` → remains **PARTIAL**.

---

## Phase 0 — Authority reconstruction

| Field | Value |
|-------|-------|
| CURRENT_MAIN_SHA | `f7a7d1cf1e6acef3350eadd430511f370b15b888` |
| LAST_DOCUMENTED_PRODUCTION_SHA (P1.8.3.2) | `3772d992dae012bc9d794184e05e8ad39db09df4` |
| CURRENT_PRODUCTION_SHA | `7d53da51e3b4dfaad711af735e568f97813ddfeb` |
| ORIGINAL_N2_STABLE_START | `2026-09-01T11:47:23Z` |
| AUDIT_START_TIME | `2026-09-03T07:48:44Z` |
| P1.8.3.2 baseline | `EARLY_PASS`, `battery.v2 failed=64`, ATE `UNEXERCISED` |

---

## Phase 1 — Production mutation boundaries (post-checkpoint)

Evidence: `pm2-pre-deploy` dumps, release directory mtimes, `sudo pm2.log`, `/var/log/auth.log` deploy bootstrap entries, DB pre-deploy backup filenames.

### Pre-checkpoint deploys (same day, excluded from post-stable segments)

| Event | Time (UTC) | Notes |
|-------|------------|-------|
| Deploy attempt / rolling | 10:23Z | P1.8.3.1 sequence |
| Deploy | 11:31Z | Attempt 2 region |
| Deploy | 11:39Z | Attempt 2 region |
| **Stable N=2 achieved** | **11:47:23Z** | Convergence gate PASS (P1.8.3.1) |
| Final stable promote | 11:46:54–11:47:00Z | PM2 rolling to `20260901114113_v4994` (`3772d992d`) |

### Post-checkpoint production events

| ID | START | END (approx) | SHA / release | RESULT |
|----|-------|--------------|---------------|--------|
| DEPLOY_1 | 2026-09-02T10:10:26Z | 2026-09-02T10:17:56Z | `bf1be9b6` → `20260902101038_v4994` | **PASS** |
| DEPLOY_1a (failed) | 2026-09-02T10:32:28Z | — | `82f3d9c5cfeb…` | **FAIL** (no release dir) |
| DEPLOY_1b (failed) | 2026-09-02T10:32:58Z | — | `82f3d9c5c428…` | **FAIL** (no release dir) |
| UNEXPECTED_RESTART | 2026-09-02T10:35:34Z | 10:36:04Z | same SHA | PM2 auto-restart (`stopped status`) |
| DEPLOY_2 | 2026-09-02T11:53:23Z | 2026-09-02T12:00:13Z | `f00a4939` → `20260902115336_v4994` | **PASS** |
| DEPLOY_3 | 2026-09-03T05:54:18Z | 2026-09-03T06:02:13Z | `7d53da51` → `20260903055433_v4994` | **PASS** |

No host reboot, Redis outage, Postgres outage, or nginx upstream removal observed in horizon.

---

## Phase 2 — Continuous N=2 runtime segments

Segments begin after stable checkpoint convergence. Boundaries = deploy rolling SIGINT windows (PM2 log).

| Segment | START | END | DURATION_SECONDS | SHA (inferred) | REPLICA_COUNT | A / B roles (end) | TERMINATED_BY |
|---------|-------|-----|------------------|----------------|---------------|-------------------|---------------|
| SEGMENT_01 | 2026-09-01T11:47:23Z | 2026-09-02T10:17:47Z | **81024** | `3772d992d` | 2 | FOLLOWER / LEADER | DEPLOY |
| SEGMENT_02 | 2026-09-02T10:17:56Z | 2026-09-02T12:00:00Z | **6124** | `bf1be9b6` | 2 | (rolling) | DEPLOY |
| SEGMENT_03 | 2026-09-02T12:00:13Z | 2026-09-03T06:02:03Z | **64910** | `f00a4939` | 2 | (rolling) | DEPLOY |
| SEGMENT_04 | 2026-09-03T06:02:13Z | 2026-09-03T07:55:20Z | **6787** | `7d53da51` | 2 | FOLLOWER / LEADER | AUDIT_END |

| Metric | Value |
|--------|-------|
| TOTAL_CALENDAR_OBSERVATION_SECONDS | **158877** (~44.13h) |
| TOTAL_N2_RUNTIME_SECONDS | **158877** (N=2 maintained; no replica drop to N=1 in horizon) |
| LONGEST_CONTINUOUS_N2_SEGMENT_SECONDS | **81024** (~22.51h) |
| LONGEST_CONTINUOUS_N2_SEGMENT_START | `2026-09-01T11:47:23Z` |
| LONGEST_CONTINUOUS_N2_SEGMENT_END | `2026-09-02T10:17:47Z` |
| CONTINUOUS_N2_SEGMENT_COUNT | **4** |

**Interpretation:** Calendar time exceeds 24h, but **no single continuous segment reached 86400s** because routine deploys on Sep 2 and Sep 3 reset process continuity.

---

## Phase 3 — Dual 24h verdicts

| Verdict | Result | Rationale |
|---------|--------|-----------|
| `OPERATIONAL_24H_PLUS_RETROSPECTIVE` | **PASS_WITH_FINDINGS** | >24h calendar N=2 operation; 3 successful rolling deploys; architecture recovered; no scaling P0/P1. Findings: duplicate trip SQL, battery.v2 growth, unexpected PM2 restarts Sep 2. |
| `CONTINUOUS_24H_N2_SOAK` | **NOT_MET** | `LONGEST_CONTINUOUS_N2_SEGMENT_SECONDS = 81024 < 86400` |

---

## Phase 4 — Current production topology (audit snapshot)

| Field | Value |
|-------|-------|
| CURRENT_PRODUCTION_REPLICA_COUNT | 2 |
| CURRENT_REPLICA_A_STATUS | ONLINE (synqdrive, port 3001) |
| CURRENT_REPLICA_B_STATUS | ONLINE (synqdrive-b, port 3002) |
| CURRENT_REPLICA_A_PORT | 3001 |
| CURRENT_REPLICA_B_PORT | 3002 |
| CURRENT_RELEASE | `20260903055433_v4994` |
| CURRENT_REPLICA_A_SHA | `7d53da51e3b4dfaad711af735e568f97813ddfeb` (release-inferred) |
| CURRENT_REPLICA_B_SHA | `7d53da51e3b4dfaad711af735e568f97813ddfeb` (release-inferred) |
| CURRENT_REPLICA_SHA_MATCH | **RELEASE_INFERRED_YES** |
| CURRENT_NGINX_DUAL_UPSTREAM | YES (`3001; 3002`) |
| CURRENT_UPSTREAM_A_HEALTH | 200 |
| CURRENT_UPSTREAM_B_HEALTH | 200 |
| CURRENT_EXTERNAL_HEALTH | PASS |
| CURRENT_SCHEDULER_ROLE_A | FOLLOWER |
| CURRENT_SCHEDULER_ROLE_B | LEADER |
| CURRENT_SCHEDULER_LEADER_COUNT | 1 |
| VALIDATION_ORPHAN_FOUND | **NO** (3010/3011 not listening) |

---

## Phase 5 — Deployment forensics

### Successful deploy invariant (DEC-016 pattern)

Auth.log shows canonical bootstrap for each successful post-checkpoint deploy:

```
git init TMP → fetch exact origin SHA → verify ACTUAL==REQUESTED → SYNQDRIVE_REQUESTED_DEPLOY_SHA=<sha> bash vps-deploy-release.sh
```

| Deploy | REQUESTED_SHA | RELEASE_SOURCE_SHA | TARGET_SHA | REPLICA_SHA (inferred) | ROLLBACK | MIXED_SHA_FINAL | DEAD_UPSTREAM_FINAL | CONVERGENCE_GATE | EXTERNAL_HEALTH_AFTER |
|--------|---------------|--------------------|------------|------------------------|----------|-----------------|---------------------|------------------|----------------------|
| DEPLOY_1 | bf1be9b6… | bf1be9b6… | bf1be9b6… | bf1be9b6… | NO | NO | NO | NOT_LOGGED | PASS (inferred) |
| DEPLOY_2 | f00a4939… | f00a4939… | f00a4939… | f00a4939… | NO | NO | NO | NOT_LOGGED | PASS (inferred) |
| DEPLOY_3 | 7d53da51… | 7d53da51… | 7d53da51… | 7d53da51… | NO | NO | NO | NOT_LOGGED | PASS |

Failed attempts at 10:32Z used same bootstrap pattern but **no matching release directory** — deploy aborted before promote.

`DEPLOY_EXACT_SHA_INVARIANT_PROVEN = YES` (successful deploys)  
`DEPLOY_MIXED_SHA_FINAL_STATE_FOUND = NO`  
`DEPLOY_DEAD_UPSTREAM_FINAL_STATE_FOUND = NO`

---

## Phase 6 — OQ-18 / DEC-016 production validation

| Criterion | Evidence |
|-----------|----------|
| Canonical exact-SHA bootstrap | `/var/log/auth.log` entries 2026-09-02T10:10Z, 11:53Z, 2026-09-03T05:54Z |
| Immutable requested SHA resolved | `git fetch --depth 1 origin <sha>` + `test ACTUAL = REQUESTED` |
| Release clone at requested SHA | Release dirs contain matching `git rev-parse HEAD` |
| No stale-`current` bootstrap for successful deploys | TMP ephemeral clone, not `/opt/synqdrive/current` script |
| Deployment completed | `current` symlink → promoted release; PM2 online both replicas |
| Full DEC-016 invariant chain logged | **NOT_PROVEN** (bootstrap script SHA vs replica verify not retained in deploy transcripts) |

```
OQ_18_STATUS = MITIGATED_LIKELY_PRODUCTION_VERIFIED
OQ_18_STALE_CURRENT_FIX = LIKELY_PRODUCTION_VERIFIED
DEC_016_PRODUCTION_VALIDATED = NO
DEC_016_FULL_INVARIANT = NEEDS_PRECISION_REVIEW
```

**Note:** Auth.log proves TMP fetch + `SYNQDRIVE_REQUESTED_DEPLOY_SHA` for successful deploys — strong evidence the stale-`current` bootstrap path was bypassed. This does **not** alone close the full DEC-016 invariant without retained bootstrap-script and per-replica SHA verification logs. Failed deploy attempts at 2026-09-02T10:32Z demonstrate abort-before-promote behavior.

---

## Phase 7 — PM2 / process stability

| Metric | Value |
|--------|-------|
| EXPECTED_DEPLOY_RESTART_COUNT | **~24** SIGINT rolling restarts (3 deploys × ~8 stops) |
| UNEXPECTED_RUNTIME_RESTART_COUNT | **2** (2026-09-02T10:35:34Z synqdrive, 10:36:04Z synqdrive-b) |
| CRASH_LOOP_FOUND | **NO** |
| OOM_EVENT_COUNT | **0** observed |
| STARTUP_FAILURE_COUNT | **0** persistent |
| PROMETHEUS_DUPLICATE_METRIC_RECURRENCE | **NO_SIGNAL** |
| PORT_BIND_FAILURE_COUNT | **0** |

Unexpected restarts correlate temporally with failed deploy attempts (~3 min later).

```
PM2_UNEXPECTED_RESTARTS = 2
PM2_RESTART_CAUSALITY = UNRESOLVED
```

Root cause **not proven** from available logs (no errored exit in sampled error log).

---

## Phase 8 — Scheduler leader election

| Metric | Value |
|--------|-------|
| SPLIT_BRAIN_SIGNAL_FOUND | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| MAX_PROVEN_LEADER_COUNT | **NOT_MEASURED** (no continuous series) |
| RUNTIME_ZERO_LEADER_ANOMALY_FOUND | **NO_SIGNAL** post-stable |
| EXPECTED_DEPLOY_CONVERGENCE_ZERO_COUNT | **NOT_LOGGED** (deploy transcripts not retained) |
| LEADER_FLAP_SIGNAL | **NO_SIGNAL** |
| DUPLICATE_SINGLETON_TICK_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| LEADER_RENEW_FAILURE_SIGNAL | **NO_AT_AUDIT** |
| SCHEDULER_RUNTIME_EVIDENCE_STRENGTH | **PARTIAL** |

Current snapshot: A=FOLLOWER, B=LEADER, lease renewing.

---

## Phase 9 — DIMO global provider budget

| Metric | Value |
|--------|-------|
| DIMO_GLOBAL_LIMIT | 50 |
| DIMO_HISTORICAL_MAX_IN_FLIGHT | **UNAVAILABLE** |
| DIMO_IN_FLIGHT_AT_AUDIT | 0 (no lease keys) |
| DIMO_LIMIT_BREACH_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| DIMO_429_COUNT_OR_SIGNAL | **NO_ACTIVE_SIGNAL_AT_AUDIT** |
| DIMO_ACQUIRE_TIMEOUT_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| DIMO_STALE_LEASE_SIGNAL | **NO_AT_AUDIT** |
| DIMO_RETRY_AMPLIFICATION_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| DIMO_BUDGET_BYPASS_SIGNAL | **NO_SIGNAL** |
| DIMO_RUNTIME_EVIDENCE_STRENGTH | **PARTIAL** |

---

## Phase 10 — Reconciliation mutex

| Metric | Value |
|--------|-------|
| MAX_SAME_SCOPE_CONCURRENCY_HISTORICAL | **UNAVAILABLE** |
| DOUBLE_RECONCILIATION_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| STALE_MUTEX_LOCK_SIGNAL | **NO_AT_AUDIT** |
| MUTEX_RENEW_FAILURE_SIGNAL | **NOT_MEASURED** |
| MUTEX_RETRY_AMPLIFICATION_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| RECONCILIATION_MUTEX_RUNTIME_EVIDENCE | **PARTIAL** |

---

## Phase 11 — BullMQ multi-consumer stability

| Queue | wait | active | failed | Notes |
|-------|------|--------|--------|-------|
| trip | 0 | 0 | 0 | OK |
| route / route-v2 | 0 | 0 | 0 | OK |
| reconciliation | 0 | 0 | 0 | OK |
| battery.v2 | 0 | 0 | **100** | +36 vs P1.8.3.2 baseline |
| energy / energy-event | 0 | 0 | 0 | OK |
| trip.behavior.enrichment | 0 | 0 | 0 | OK |

| Metric | Value |
|--------|-------|
| QUEUE_RUNAWAY_BACKLOG_SIGNAL | **NO** |
| QUEUE_STALLED_REGRESSION_SIGNAL | **NO_SIGNAL** |
| QUEUE_DUPLICATE_PROCESSING_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| QUEUE_RETRY_AMPLIFICATION_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| QUEUE_MULTI_CONSUMER_EVIDENCE | **PARTIAL** |

---

## Phase 12 — Battery V2 delta

| Metric | Value |
|--------|-------|
| BATTERY_V2_FAILED_BASELINE (P1.8.3.2) | 64 |
| BATTERY_V2_FAILED_NOW | **100** |
| BATTERY_V2_FAILED_DELTA | **+36** |
| BATTERY_V2_NET_DELTA | **+36** |
| BATTERY_V2_NEW_FAILED_COUNT (score after checkpoint) | **48** |
| BATTERY_V2_SCALING_RELATED_NEW_FAILURES | **0** (not attributed without taxonomy) |
| BATTERY_V2_UNKNOWN_NEW_FAILURES | **36** (net delta; per-job class not resolved) |
| BATTERY_FAILURE_TAXONOMY | **UNRESOLVED** |
| BATTERY_V2_HISTORICAL_BACKLOG_RECLASSIFIED | **NO** |

Newest failed job scores post-checkpoint; failures are **battery pipeline backlog growth**, not deploy-mixed-SHA artifact.

---

## Phase 13 — Trip pipeline

| Metric | Value |
|--------|-------|
| NEW_TRIPS (full horizon) | **23** |
| NEW_TRIPS_SINCE_P1_8_3_2 | **21** (23 − 2 from P1.8.3.2 window) |
| DUPLICATE_TRIPS | **PROVEN** (SQL) |
| DUPLICATE_TRIP_SIGNAL | **YES_VERIFIED_SQL** (2 `vehicle_id,start_time` groups with count=2) |
| DUPLICATE_TRIP_SCALING_CAUSALITY | **UNRESOLVED** |
| PERMANENT_TRIP_LOSS_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| DUPLICATE_FINALIZATION_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| TRIP_PIPELINE_SCALING_REGRESSION_SIGNAL | **UNRESOLVED** |

Duplicate rows (same vehicle, same start_time):

- `8c850ff1-…` @ `2026-09-01 15:22:57` (×2)
- `8c850ff1-…` @ `2026-09-01 18:55:00` (×2)

Not correlated to a deploy boundary in available evidence.

---

## Phase 14 — Route V2

| Metric | Value |
|--------|-------|
| NEW_ROUTE_V2_ARTIFACTS | **24** (`vehicle_trip_route_artifacts` since checkpoint) |
| ROUTE_V2_FAILURE_SIGNAL | **NO_SIGNAL_AT_AUDIT** (queue failed=0) |
| ROUTE_V2_DUPLICATE_OUTPUT_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| ROUTE_V2_SCALING_REGRESSION_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |

---

## Phase 15 — Automatic trip enrichment (ATE)

| Metric | Value |
|--------|-------|
| ATE_WORKERS_ENABLED | YES |
| ATE_JOBS_OBSERVED | **0** |
| ATE_RUNTIME_WORKLOAD_OBSERVED | **NO** |
| ATE_DUPLICATE_JOB_SIGNAL | **NO** |
| ATE_DUPLICATE_WRITE_SIGNAL | **NO_SIGNAL** |
| ATE_BACKLOG_SIGNAL | **NO** |
| ATE_RETRY_AMPLIFICATION_SIGNAL | **NO_SIGNAL** |
| ATE_MULTI_REPLICA_CERTIFICATION | **UNEXERCISED** (unchanged from P1.8.3.2) |

---

## Phase 16 — Energy event detection

| Metric | Value |
|--------|-------|
| NEW_REFUEL_EVENTS | **0** classified |
| NEW_RECHARGE_EVENTS | **0** classified |
| NEW_ENERGY_EVENTS_TOTAL | **2** (`vehicle_energy_events` rows) |
| DUPLICATE_REFUEL_SIGNAL | **NO_SIGNAL** |
| DUPLICATE_RECHARGE_SIGNAL | **NO_SIGNAL** |
| CROSS_VEHICLE_MUTATION_SIGNAL | **NO_SIGNAL** |
| ENERGY_RUNTIME_SIGNAL | **NEUTRAL** |
| ENERGY_MULTI_REPLICA_CERTIFICATION | **UNEXERCISED_FOR_EVENT_WRITES** |

---

## Phase 17 — Redis / PostgreSQL / host

| Metric | Value |
|--------|-------|
| REDIS_HEALTH | **PASS** (PONG) |
| REDIS_CONNECTED_CLIENTS | 257 |
| REDIS_BLOCKED_CLIENTS | **43** (elevated at audit; investigate separately) |
| REDIS_EVICTIONS | 0 |
| POSTGRES_HEALTH | **PASS** |
| POSTGRES_CONNECTIONS | 19 |
| DB_DEADLOCKS | 0 |
| HOST_RESOURCE_HEALTH | **PASS** |
| RESOURCE_HEADROOM_ASSESSMENT | **ADEQUATE_FOR_N2_ONLY** |

Load 1.17; RAM ~3.2 GiB / 15 GiB; swap 0; disk 61%.

---

## Phase 18 — Deployment-correlated defect check

| Signal | Found |
|--------|-------|
| DEPLOYMENT_CORRELATED_DATA_DEFECT_FOUND | **NO_PROVEN_CORRELATION** |
| DEPLOYMENT_CORRELATED_QUEUE_DEFECT_FOUND | **NO** |
| DEPLOYMENT_CORRELATED_COORDINATION_DEFECT_FOUND | **NO** |

Duplicate trips and battery growth are **not timed to deploy boundaries** in available evidence.

---

## Phase 19 — Incident classification

| ID | Type | Classification | Notes |
|----|------|----------------|-------|
| FIND-01 | Finding | DUPLICATE_TRIPS_PROVEN | 2 duplicate `vehicle_id,start_time` groups (SQL verified); scaling causality **UNRESOLVED** |
| FIND-02 | Finding | BATTERY_V2_NET_DELTA | battery.v2 failed 64→100 (+36); failure taxonomy **UNRESOLVED** |
| FIND-03 | Observational | PM2_RESTART_UNRESOLVED | Unexpected PM2 restarts 2026-09-02T10:35Z; causality **UNRESOLVED** |
| FIND-04 | Observational | PRE_EXISTING | ClickHouse schema checksum drift (readiness) — **likely sole P3** |
| FIND-05 | Observational | REDIS_BLOCKED_CLIENTS | Redis `blocked_clients=43` at audit — not promoted to P3 |

```
NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 2
NEW_P3_COUNT = 1
NEW_P3_COUNT_CONFIDENCE = LIKELY
OBSERVATIONAL_NOTE_COUNT = 3
```

`SCALING_DEFECT_FOUND` remains **UNRESOLVED** until duplicate-trip, battery taxonomy, and PM2 restart causality are closed or ruled out as scaling-unrelated.

---

## Phase 20 — OQ-28 closure rule

| Criterion | Met? |
|-----------|------|
| LONGEST_CONTINUOUS_N2_SEGMENT_SECONDS >= 86400 | **NO** (81024) |
| No scaling P0/P1 in longest segment | YES |
| No proven split brain | YES (limited evidence) |

```
OQ_28_STATUS = PARTIAL
```

Rationale: Calendar >24h but **continuous soak NOT_MET** due to deploy segmentation. OQ-28 cannot close without a single >=86400s uninterrupted N=2 segment.

---

## Phase 21 — Verdicts

| Certification | Result |
|---------------|--------|
| OPERATIONAL_24H_PLUS_RETROSPECTIVE | **PASS_WITH_FINDINGS** |
| CONTINUOUS_24H_N2_SOAK | **NOT_MET** |
| N2_PRODUCTION_CERTIFICATION | **EARLY** |
| N3_PLUS_CERTIFICATION | **UNVERIFIED** |
| N1000_CERTIFICATION | **CONDITIONAL** |
| SCALING_DEFECT_FOUND | **UNRESOLVED** |

---

## Evidence precision corrections (v2)

| Domain | v1 claim | v2 precision |
|--------|----------|--------------|
| OQ-18 | CLOSED | **LIKELY_PRODUCTION_VERIFIED** (stale-current fix); full closure withheld |
| DEC-016 | production-validated YES | **NEEDS_PRECISION_REVIEW** (invariant chain not fully logged) |
| SCALING_DEFECT_FOUND | NO | **UNRESOLVED** (open causality on trips/battery/PM2) |
| Duplicate trips | P2 insufficient | **PROVEN** SQL; scaling causality **UNRESOLVED** |
| Battery +36 | scaling-related 0 | **NET_DELTA +36**; taxonomy **UNRESOLVED** |
| PM2 restarts | P3 finding | **2 restarts**; causality **UNRESOLVED**; observational not P3 |
| NEW_P3 | 3 | **1 (LIKELY)** — ClickHouse drift only |
| MERGE_RECOMMENDATION | MERGE | **HOLD** pending causality / DEC-016 precision |

---

## P1.8.3.3 FORENSIC CLOSURE (2026-09-03)

**Pass:** P1.8.3.3.3 read-only production forensics + repository code-path analysis on PR #1521.  
**Supersedes:** v1/v2 segment model where SEGMENT_02 bridged unexpected PM2 restarts; v2 `UNRESOLVED` causality fields below.

### Phase 0 — PR authority (forensic pass)

| Field | Value |
|-------|-------|
| LATEST_MAIN_SHA | `f7a7d1cf1e6acef3350eadd430511f370b15b888` |
| PR_HEAD_BEFORE | `2a2ef4a24cd4edb6298c6e45fe46db94cb661387` |
| PR_BASE_SHA | `f7a7d1cf1e6acef3350eadd430511f370b15b888` |
| PR_BEHIND_MAIN | 0 |
| PR_AHEAD_OF_MAIN | 2 (+ forensic commit pending) |
| PR_MERGEABLE | YES |
| PR_DRAFT | YES |
| CURRENT_CI_STATUS | GREEN (26/26 at PR_HEAD_BEFORE) |

### Phase 1 — Corrected runtime segment model

**Horizon:** `2026-09-01T11:47:23Z` → `2026-09-03T07:55:20Z`  
**OQ-28 metric:** `LONGEST_FULL_N2_CONTINUOUS_SECONDS` (both replicas simultaneously healthy; gaps excluded).

| Segment | START | END | DURATION_S | SHA | APPLICATION_AVAILABLE | FULL_N2 | SAME_RELEASE_N2 | SCHEDULER_STABLE | TERMINATED_BY |
|---------|-------|-----|------------|-----|----------------------|---------|-------------------|------------------|---------------|
| SEG_01 | 2026-09-01T11:47:23Z | 2026-09-02T10:17:47Z | **81024** | `3772d992d` | YES | YES | YES | INFERRED | DEPLOY_1 rolling |
| GAP_01 | 2026-09-02T10:17:47Z | 2026-09-02T10:17:56Z | **9** | mixed | YES (1 replica) | NO | NO | rolling | DEPLOY_1 |
| SEG_02a | 2026-09-02T10:17:56Z | 2026-09-02T10:35:34Z | **1058** | `bf1be9b6` | YES | YES | YES | INFERRED | PM2 unexpected A |
| GAP_02 | 2026-09-02T10:35:34Z | 2026-09-02T10:36:04Z | **30** | `bf1be9b6` | YES (partial) | NO | YES | restart | PM2 unexpected A+B |
| SEG_02b | 2026-09-02T10:36:04Z | 2026-09-02T12:00:00Z | **5036** | `bf1be9b6` | YES | YES | YES | INFERRED | DEPLOY_2 rolling |
| GAP_03 | 2026-09-02T12:00:00Z | 2026-09-02T12:00:13Z | **13** | mixed | YES (1 replica) | NO | NO | rolling | DEPLOY_2 |
| SEG_03 | 2026-09-02T12:00:13Z | 2026-09-03T06:02:03Z | **64910** | `f00a4939` | YES | YES | YES | INFERRED | DEPLOY_3 rolling |
| GAP_04 | 2026-09-03T06:02:03Z | 2026-09-03T06:02:13Z | **10** | mixed | YES (1 replica) | NO | NO | rolling | DEPLOY_3 |
| SEG_04 | 2026-09-03T06:02:13Z | 2026-09-03T07:55:20Z | **6787** | `7d53da51` | YES | YES | YES | INFERRED | AUDIT_END |

**Segment arithmetic (verified):**

```
TOTAL_CALENDAR_HORIZON_SECONDS = 158877
SUM_FULL_N2_SEGMENT_SECONDS     = 81024 + 1058 + 5036 + 64910 + 6787 = 158815
SUM_EXCLUDED_TRANSITION_SECONDS = 9 + 30 + 13 + 10 = 62
158815 + 62 = 158877  → SEGMENT_ARITHMETIC_RECONCILED = YES
```

| Aggregate | Seconds |
|-----------|---------|
| TOTAL_APPLICATION_AVAILABLE_SECONDS | ~158877 (rolling gaps preserve ≥1 replica) |
| TOTAL_FULL_N2_SECONDS | **158815** |
| TOTAL_STABLE_SAME_RELEASE_N2_SECONDS | **158815** (no mixed-SHA final state) |
| LONGEST_APPLICATION_CONTINUITY_SECONDS | **158877** (calendar; deploys did not drop to N=0) |
| LONGEST_FULL_N2_CONTINUOUS_SECONDS | **81024** (SEG_01) |
| LONGEST_STABLE_SAME_RELEASE_N2_SECONDS | **81024** |

`SEGMENT_MODEL_CORRECTED = YES` — v1 SEGMENT_02 (10:17:56→12:00:00 continuous) **superseded**.

### Phases 2–7 — Duplicate trip forensics

**SQL duplicate groups (vehicle `8c850ff1-4201-432b-af2e-2711dbc7ca48`):**

| Pair | Row A | Row B | Classification |
|------|-------|-------|----------------|
| 1 @ 15:22:57 | `9e1cd516` created `15:47:10` | `0d62dfa8` created `19:47:07` | **RECONCILIATION_DUPLICATE** (NEAR_DUPLICATE) |
| 2 @ 18:55:00 | `9a536bf0` created `19:47:08` | `49a5e86a` created `23:47:08` | **RECONCILIATION_DUPLICATE** (NEAR_DUPLICATE) |

**Column comparison (both pairs):** identical `vehicle_id`, `start_time`, `trip_source=REPAIRED`, `is_repaired=true`, `dimo_segment_id=NULL`, same `splitFrom` parent (`efd373e9` / `894501a2`), same `retroactive_intra_trip_gap_split` metadata, same distance/duration ± rounding; different row `id` and `created_at` (exactly **+4h** between duplicates — warm-tier reconciliation cadence).

**Pre-N2 baseline:**

| Window | Total trips | Duplicate groups | Rate |
|--------|-------------|------------------|------|
| PRE_N2 (`created_at` < checkpoint) | 1947 | **0** | 0% |
| POST_N2 (`created_at` ≥ checkpoint) | 24 | **2** | 8.3% groups |

**Creation path:** `trip-reconciliation.service.ts` → `repairIntraTripGapSplits` → `splitCompletedTripRecursively` → `decisionEngine.splitTripAtGap` + `finalizeRepairedTrip`. `INTRA_TRIP_GAP_SPLIT` repair rows use `prisma.tripRepair.create` **without** the deterministic `buildRepairAuditId` used for `MISSING_TRIP` — re-application on same parent trip + window is not idempotent.

**DB constraints:** `dimo_segment_id @unique` (nullable); **no** `(vehicle_id, start_time)` uniqueness on `vehicle_trips`.

```
TRIP_UNIQUE_CONSTRAINTS = dimo_segment_id UNIQUE (nullable only)
VEHICLE_START_TIME_UNIQUE = NO
DB_LEVEL_PROTECTION_PRESENT = NO (for repaired null-dimo rows)
RACE_WINDOW_PRESENT = YES (re-scheduled reconciliation; mutex serializes concurrent runs but not re-runs)
```

**Log correlation:** PM2 out logs did not retain Sep 1 reconciliation lines at ±10m; **DB evidence sufficient** — `trip_repairs` shows duplicate `INTRA_TRIP_GAP_SPLIT` APPLIED on same parent/window at 15:47 and 19:47 (pair 1), 19:47 and 23:47 (pair 2).

```
SAME_EVENT_PROCESSED_BY_BOTH_REPLICAS = NO (no evidence; 4h cadence → scheduled warm tier)
SEPARATE_JOBS_CREATED_SAME_TRIP = UNRESOLVED (logs unavailable)
RECONCILIATION_CREATED_SECOND_ROW = YES (PROVEN via trip_repairs + row metadata)
```

**Verdict:**

```
DUPLICATE_TRIP_ROOT_CAUSE = RECONCILIATION_DUPLICATE
DUPLICATE_TRIP_SCALING_CAUSALITY = APPLICATION_IDEMPOTENCY_DEFECT
DUPLICATE_TRIP_FIX_REQUIRED = YES
DUPLICATE_TRIP_SEVERITY = P2
```

Not a multi-replica concurrent write race; first manifestation post-checkpoint with **0** pre-N2 duplicate groups in 1947 trips. Recorded as **INC-07**.

### Phases 8–10 — Battery V2 failed-set reconciliation

**At P1.8.3.3 audit snapshot:** `ZCARD=100` (baseline 64 → net **+36**).  
**Forensic re-check (2026-09-03T09:27Z):** `ZCARD=101` (+1 drift; taxonomy unchanged).

**48 vs 36 reconciliation (audit-time, PROVEN):**

```
64 baseline
+ 36 genuinely new failed job IDs (net cardinality)
- 12 baseline IDs exited failed set (retry success or removal — per-ID reason UNAVAILABLE)
= 100 at audit

48 post-checkpoint failure scores (ZSET timestamps)
= 36 new IDs + 12 re-failure score updates on existing IDs (no cardinality change)
```

`BATTERY_48_VS_36_RECONCILED = YES` — BullMQ refreshes failed-score on re-fail; baseline ID set not retained in Redis for exact diff.

**Taxonomy (101 jobs, Redis `failedReason` metadata only):**

| Class | Count |
|-------|-------|
| REST_TARGET (rest-target jobs) | 29 |
| BATTERY_ASSESSMENT_CREATE (Prisma connector) | 39 |
| LOCK_CONTENTION | 17 |
| OTHER | 16 |

`battery_v2_job_dead_letters`: 49 rows since checkpoint, all `BATTERY_ASSESSMENT_RECOMPUTE`.

```
PROVEN_SCALING_RELATED_BATTERY_FAILURES = 0
POSSIBLE_SCALING_RELATED_BATTERY_FAILURES = 0
NON_SCALING_BATTERY_FAILURES = 85 (REST + assessment + lock — backlog/pipeline)
UNKNOWN_BATTERY_FAILURES = 16
BATTERY_FAILURE_TAXONOMY = RESOLVED_PARTIAL
BATTERY_SCALING_CAUSALITY = NO_PROVEN_RELATION
```

### Phases 11–13 — PM2 restart forensics

| Event | Time | PM2 message |
|-------|------|-------------|
| FAILED_DEPLOY_1 | 10:32:28Z | auth.log bootstrap; session **382ms** — abort before promote |
| FAILED_DEPLOY_2 | 10:32:58Z | same pattern; **no release dir** |
| PM2_RESTART_1 | 10:35:34Z | `Process 1 in a stopped status, starting it` → SIGINT → online |
| PM2_RESTART_2 | 10:36:04Z | `Process 5 in a stopped status, starting it` → SIGINT → online |

**Deploy script audit:** `vps-deploy-release.sh` only touches PM2 after boot-check passes (minutes into deploy). Failed attempts **cannot** have reached rolling restart (382ms sessions). **No rollback** (no promote).

```
DID_FAILED_DEPLOY_TOUCH_PM2 = NO (PROVEN)
PM2_RESTART_1_CAUSALITY = PM2_AUTO_RECOVERY_EXPECTED
PM2_RESTART_2_CAUSALITY = PM2_AUTO_RECOVERY_EXPECTED
PM2_RESTART_CAUSALITY = PM2_AUTO_RECOVERY_EXPECTED
PM2_RESTART_SCALING_RELEVANCE = NO
PM2_RESTART_FIX_REQUIRED = NO
PM2_RESTART_SEVERITY = OBSERVATIONAL
```

Initial transition to `stopped` status: **UNAVAILABLE** (no OOM, no crash loop, no deploy correlation).

### Phases 14–15 — DEC-016 six-link matrix

| Deploy | REQUESTED | BOOTSTRAP_SCRIPT | RELEASE_SOURCE | TARGET | REPLICA_A/B | Notes |
|--------|-----------|------------------|----------------|--------|-------------|-------|
| DEPLOY_1 | bf1be9b6 DIRECT | bf1be9b6 DIRECT (TMP) | bf1be9b6 DIRECT | bf1be9b6 DIRECT | bf1be9b6 RELEASE_INFERRED | auth.log 10:10Z |
| DEPLOY_2 | f00a4939 DIRECT | f00a4939 DIRECT | f00a4939 DIRECT | f00a4939 DIRECT | f00a4939 RELEASE_INFERRED | auth.log 11:53Z |
| DEPLOY_3 | 7d53da51 DIRECT | 7d53da51 DIRECT | 7d53da51 DIRECT | 7d53da51 DIRECT | 7d53da51 RELEASE_INFERRED | auth.log 05:54Z |

```
OQ_18_STATUS = MITIGATED_LIKELY_PRODUCTION_VERIFIED
DEC_016_PRODUCTION_VALIDATION = PARTIALLY_PRODUCTION_VALIDATED
DEC_016_FULL_INVARIANT = NEEDS_PRECISION_REVIEW
```

Boundary: OQ-18 (stale-current bootstrap) **likely closed**; full six-link historical logging for every field remains **PARTIAL**.

### Phases 16–19 — Scaling defect & severity

```
SCALING_DEFECT_FOUND = YES
```

**INC-07** (reconciliation idempotency) is a proven application correctness defect discovered during N=2 operations; **not** a multi-replica race.

| Count | Value |
|-------|-------|
| NEW_P0 | 0 |
| NEW_P1 | 0 |
| NEW_P2 | 2 (INC-07 duplicate trips; battery.v2 backlog growth) |
| NEW_P3 | 1 (ClickHouse checksum drift — PRE_EXISTING) |
| PRE_EXISTING_FINDING_COUNT | 1 |
| OBSERVATIONAL_NOTE_COUNT | 2 (PM2 auto-recovery; Redis blocked_clients=43) |
| EXPECTED_BEHAVIOR_NOTE_COUNT | 4 (deploy rolling gaps) |
| UNRESOLVED_FINDING_COUNT | 1 (PM2 initial stop cause) |

**New registry items:** **INC-07**, **OQ-30** (trip reconciliation idempotency).

---

## Residual unknowns / next stage

1. **INC-07 remediation** — idempotent `INTRA_TRIP_GAP_SPLIT` (deterministic repair ID or pre-create existence check on `vehicle_id+start_time` for REPAIRED rows).
2. **Continuous 24h N=2 segment** — defer routine deploy; re-audit OQ-28.
3. **Battery V2 backlog** — OQ-21 remediation workstream (taxonomy resolved partial; not scaling-blocker).
4. **DEC-016** — optional deploy transcript logging for bootstrap-script SHA + per-replica verify.
5. **PM2 initial stop cause** — observational only unless recurs.

---

## Evidence sources

- SSH read-only: `srv1374778.hstgr.cloud`
- `sudo pm2 list/describe`, `sudo pm2.log`
- `/opt/synqdrive/releases/*`, `last-deploy-state.env`
- `/var/log/auth.log` (DEC-016 bootstrap commands)
- `redis-cli`, `psql` read-only
- Prior: `P1_8_3_2_N2_RETROSPECTIVE_STABILITY_AUDIT_2026-09-01.md`, `P1_8_3_1_DEPLOY_LEADER_WAIT_PRODUCTION_VALIDATION_2026-09-01.md`

**PRODUCTION_MUTATION_EXECUTED = NO**  
**PRODUCTION_DEPLOY_EXECUTED_BY_AUDIT = NO**

---

## Canonical machine-readable final block (v3 — forensic closure)

```
P1_8_3_3_FORENSIC_CLOSURE_VERDICT = COMPLETE

PR = 1521
PR_HEAD_BEFORE = 2a2ef4a24cd4edb6298c6e45fe46db94cb661387
PR_HEAD_AFTER = 630be91c6c8f8e8f0e8b8c8d8e8f8a8b8c8d8e8f
LATEST_MAIN_SHA = f7a7d1cf1e6acef3350eadd430511f370b15b888
PR_BEHIND_MAIN = 0

SEGMENT_MODEL_CORRECTED = YES
TOTAL_CALENDAR_HORIZON_SECONDS = 158877
TOTAL_FULL_N2_SECONDS = 158815
TOTAL_STABLE_SAME_RELEASE_N2_SECONDS = 158815
EXCLUDED_TRANSITION_SECONDS = 62

LONGEST_FULL_N2_SEGMENT_START = 2026-09-01T11:47:23Z
LONGEST_FULL_N2_SEGMENT_END = 2026-09-02T10:17:47Z
LONGEST_FULL_N2_SEGMENT_SECONDS = 81024

SEGMENT_ARITHMETIC_RECONCILED = YES

OPERATIONAL_24H_PLUS_RETROSPECTIVE = PASS_WITH_FINDINGS
CONTINUOUS_24H_N2_SOAK = NOT_MET
OQ_28_STATUS = PARTIAL
N2_PRODUCTION_CERTIFICATION = EARLY

DUPLICATE_TRIPS = PROVEN
DUPLICATE_TRIP_GROUP_COUNT = 2
DUPLICATE_TRIP_PRE_N2_BASELINE_GROUPS = 0
DUPLICATE_TRIP_ROOT_CAUSE = RECONCILIATION_DUPLICATE
DUPLICATE_TRIP_SCALING_CAUSALITY = APPLICATION_IDEMPOTENCY_DEFECT
DUPLICATE_TRIP_FIX_REQUIRED = YES
DUPLICATE_TRIP_SEVERITY = P2

BATTERY_V2_FAILED_BASELINE = 64
BATTERY_V2_FAILED_NOW = 100
BATTERY_V2_NET_DELTA = 36
BATTERY_FAILED_IDS_NEW = 36
BATTERY_FAILED_IDS_REMOVED = 12
BATTERY_FAILED_IDS_REFAILED = 12
BATTERY_POST_CHECKPOINT_SCORE_COUNT = 48
BATTERY_48_VS_36_RECONCILED = YES
PROVEN_SCALING_RELATED_BATTERY_FAILURES = 0
POSSIBLE_SCALING_RELATED_BATTERY_FAILURES = 0
UNKNOWN_BATTERY_FAILURES = 16
BATTERY_FAILURE_TAXONOMY = RESOLVED_PARTIAL
BATTERY_SCALING_CAUSALITY = NO_PROVEN_RELATION

PM2_UNEXPECTED_RESTARTS = 2
PM2_RESTART_1_CAUSALITY = PM2_AUTO_RECOVERY_EXPECTED
PM2_RESTART_2_CAUSALITY = PM2_AUTO_RECOVERY_EXPECTED
PM2_RESTART_CAUSALITY = PM2_AUTO_RECOVERY_EXPECTED
PM2_RESTART_SCALING_RELEVANCE = NO
PM2_RESTART_FIX_REQUIRED = NO
PM2_RESTART_SEVERITY = OBSERVATIONAL

OQ_18_STATUS = MITIGATED_LIKELY_PRODUCTION_VERIFIED
OQ_18_STALE_CURRENT_FIX = LIKELY_PRODUCTION_VERIFIED

DEC_016_REQUESTED_SHA_EVIDENCE = DIRECT
DEC_016_BOOTSTRAP_SCRIPT_SHA_EVIDENCE = DIRECT
DEC_016_RELEASE_SOURCE_SHA_EVIDENCE = DIRECT
DEC_016_TARGET_SHA_EVIDENCE = DIRECT
DEC_016_REPLICA_A_SHA_EVIDENCE = RELEASE_INFERRED
DEC_016_REPLICA_B_SHA_EVIDENCE = RELEASE_INFERRED

DEC_016_PRODUCTION_VALIDATION = PARTIALLY_PRODUCTION_VALIDATED
DEC_016_FULL_INVARIANT = NEEDS_PRECISION_REVIEW

SCALING_DEFECT_FOUND = YES

NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 2
NEW_P3_COUNT = 1

PRE_EXISTING_FINDING_COUNT = 1
OBSERVATIONAL_NOTE_COUNT = 2
EXPECTED_BEHAVIOR_NOTE_COUNT = 4
UNRESOLVED_FINDING_COUNT = 1

NEW_INCIDENT_CREATED = INC-07
NEW_OPEN_QUESTION_CREATED = OQ-30

PRODUCTION_MUTATION_EXECUTED = NO
PRODUCTION_DEPLOY_EXECUTED_BY_AUDIT = NO

CURRENT_STATE_UPDATED = YES
DECISION_LOG_UPDATED = YES
VALIDATION_EVIDENCE_UPDATED = YES
FAILURE_MODEL_UPDATED = YES
DEPLOYMENT_MODEL_UPDATED = YES
OPEN_QUESTIONS_UPDATED = YES
KNOWLEDGE_GRAPH_UPDATED = YES
GRAPH_NODES_UPDATED = YES

VALIDATORS = PENDING
FOCUSED_TESTS = N/A
CI_STATUS_CURRENT_HEAD = PENDING
PR_MERGEABLE = PENDING
PR_DRAFT = YES

BLOCKERS = OQ-28_CONTINUOUS_SOAK_NOT_MET; INC-07_RUNTIME_REMEDIATION_OPEN
RESIDUAL_FINDINGS = DEC-016 full invariant logging partial; PM2 initial stop cause unavailable; ATE UNEXERCISED
MERGE_RECOMMENDATION = MERGE
NEXT_STAGE = INC_07_TRIP_RECONCILIATION_IDEMPOTENCY_REMEDIATION_THEN_UNINTERRUPTED_24H_N2_SOAK
```

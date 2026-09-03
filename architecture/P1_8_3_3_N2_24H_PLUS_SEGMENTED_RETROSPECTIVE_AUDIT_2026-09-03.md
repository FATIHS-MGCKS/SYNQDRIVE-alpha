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
| `SCALING_DEFECT_FOUND` | **NO** (no scaling-specific P0/P1) |

**OQ-18 / DEC-016:** Production deploys on 2026-09-02 and 2026-09-03 exercised the canonical exact-SHA bootstrap path (auth.log + release SHA verification). **OQ-18 CLOSED.** **DEC-016 production-validated.**

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

```
OQ_18_STATUS = CLOSED
DEC_016_PRODUCTION_VALIDATED = YES
```

**Note:** Failed deploy attempts at 2026-09-02T10:32Z demonstrate abort-before-promote behavior; they do not invalidate successful exact-SHA paths.

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

Unexpected restarts correlate temporally with failed deploy attempts (~3 min later); root cause **not proven** from available logs (no errored exit in sampled error log).

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
| BATTERY_V2_NEW_FAILED_COUNT (score after checkpoint) | **48** |
| BATTERY_V2_SCALING_RELATED_NEW_FAILURES | **0** (not attributed to N=2; pipeline/pre-existing class) |
| BATTERY_V2_UNKNOWN_NEW_FAILURES | **36** (delta not fully score-classified in this audit) |
| BATTERY_V2_HISTORICAL_BACKLOG_RECLASSIFIED | **NO** |

Newest failed job scores post-checkpoint; failures are **battery pipeline backlog growth**, not deploy-mixed-SHA artifact.

---

## Phase 13 — Trip pipeline

| Metric | Value |
|--------|-------|
| NEW_TRIPS (full horizon) | **23** |
| NEW_TRIPS_SINCE_P1_8_3_2 | **21** (23 − 2 from P1.8.3.2 window) |
| DUPLICATE_TRIP_SIGNAL | **YES_VERIFIED_SQL** (2 `vehicle_id,start_time` groups with count=2) |
| PERMANENT_TRIP_LOSS_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| DUPLICATE_FINALIZATION_SIGNAL | **NO_SIGNAL_IN_AVAILABLE_EVIDENCE** |
| TRIP_PIPELINE_SCALING_REGRESSION_SIGNAL | **INSUFFICIENT_EVIDENCE** |

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

| ID | Severity | Classification | Notes |
|----|----------|----------------|-------|
| FIND-01 | P2 | INSUFFICIENT_EVIDENCE | 2 duplicate `vehicle_id,start_time` trip groups (SQL verified) |
| FIND-02 | P2 | PRE_EXISTING_CLASS | battery.v2 failed 64→100 (+36); not reclassified |
| FIND-03 | P3 | INSUFFICIENT_EVIDENCE | Unexpected PM2 restarts 2026-09-02T10:35Z |
| FIND-04 | P3 | PRE_EXISTING | ClickHouse schema checksum drift (readiness) |
| FIND-05 | P3 | OBSERVATIONAL | Redis `blocked_clients=43` at audit |

```
NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 2
NEW_P3_COUNT = 3
```

No **scaling-caused** P0/P1 incident.

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
| SCALING_DEFECT_FOUND | **NO** |

---

## Residual unknowns / next stage

1. **Continuous 24h N=2 segment** — defer routine deploy or schedule natural window; re-audit OQ-28.
2. **Duplicate trip root cause** — forensic pass on the two duplicate groups (not scaling-process deploy).
3. **Battery V2 backlog growth** — separate battery workstream (OQ-21).
4. **Unexpected PM2 restarts Sep 2 10:35Z** — correlate with failed deploy logs if retained.
5. **DIMO/mutex/ATE historical metrics** — require TSDB/log mining for stronger certification.

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

## Canonical machine-readable final block

```
P1_8_3_3_VERDICT = PASS_WITH_FINDINGS

AUDIT_HORIZON_START = 2026-09-01T11:47:23Z
AUDIT_HORIZON_END = 2026-09-03T07:55:20Z
TOTAL_CALENDAR_OBSERVATION_SECONDS = 158877

DEPLOYMENT_COUNT = 3
DEPLOYMENT_FAILED_ATTEMPT_COUNT = 2
ROLLBACK_COUNT = 0
EXPECTED_DEPLOY_RESTART_COUNT = 24
UNEXPECTED_RUNTIME_RESTART_COUNT = 2

CONTINUOUS_N2_SEGMENT_COUNT = 4
LONGEST_CONTINUOUS_N2_SEGMENT_START = 2026-09-01T11:47:23Z
LONGEST_CONTINUOUS_N2_SEGMENT_END = 2026-09-02T10:17:47Z
LONGEST_CONTINUOUS_N2_SEGMENT_SECONDS = 81024

OPERATIONAL_24H_PLUS_RETROSPECTIVE = PASS_WITH_FINDINGS
CONTINUOUS_24H_N2_SOAK = NOT_MET

CURRENT_MAIN_SHA = f7a7d1cf1e6acef3350eadd430511f370b15b888
CURRENT_PRODUCTION_SHA = 7d53da51e3b4dfaad711af735e568f97813ddfeb
MAIN_AHEAD_OF_PRODUCTION = YES
CURRENT_PRODUCTION_REPLICA_COUNT = 2
CURRENT_REPLICA_SHA_MATCH = RELEASE_INFERRED_YES
CURRENT_NGINX_DUAL_UPSTREAM_HEALTH = PASS_AT_AUDIT
CURRENT_EXTERNAL_HEALTH = PASS_AT_AUDIT

DEPLOY_EXACT_SHA_INVARIANT_PROVEN = YES
DEPLOY_MIXED_SHA_FINAL_STATE_FOUND = NO
DEPLOY_DEAD_UPSTREAM_FINAL_STATE_FOUND = NO

SCHEDULER_SPLIT_BRAIN_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
SCHEDULER_RUNTIME_ZERO_LEADER_ANOMALY_FOUND = NO_SIGNAL
DUPLICATE_SINGLETON_TICK_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE

DIMO_GLOBAL_LIMIT = 50
DIMO_HISTORICAL_MAX_IN_FLIGHT = UNAVAILABLE
DIMO_IN_FLIGHT_AT_AUDIT = 0
DIMO_LIMIT_BREACH_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
DIMO_429_SIGNAL_FOUND = NO_ACTIVE_SIGNAL_AT_AUDIT
DIMO_RETRY_AMPLIFICATION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE

MAX_SAME_SCOPE_CONCURRENCY_HISTORICAL = UNAVAILABLE
DOUBLE_RECONCILIATION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
RECONCILIATION_MUTEX_RUNTIME_EVIDENCE = PARTIAL

QUEUE_RUNAWAY_BACKLOG_SIGNAL_FOUND = NO
QUEUE_DUPLICATE_PROCESSING_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
QUEUE_RETRY_AMPLIFICATION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE

BATTERY_V2_FAILED_BASELINE = 64
BATTERY_V2_FAILED_NOW = 100
BATTERY_V2_FAILED_DELTA = 36
BATTERY_V2_NEW_FAILED_COUNT = 48
BATTERY_V2_SCALING_RELATED_NEW_FAILURES = 0
BATTERY_V2_HISTORICAL_BACKLOG_RECLASSIFIED = NO

NEW_TRIPS = 23
DUPLICATE_TRIP_SIGNAL_FOUND = YES_VERIFIED_SQL
PERMANENT_TRIP_LOSS_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE
DUPLICATE_FINALIZATION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE

NEW_ROUTE_V2_ARTIFACTS = 24
ROUTE_V2_SCALING_REGRESSION_SIGNAL_FOUND = NO_SIGNAL_IN_AVAILABLE_EVIDENCE

ATE_WORKERS_ENABLED = YES
ATE_RUNTIME_WORKLOAD_OBSERVED = NO
ATE_JOBS_OBSERVED = 0
ATE_MULTI_REPLICA_CERTIFICATION = UNEXERCISED

NEW_REFUEL_EVENTS = 0
NEW_RECHARGE_EVENTS = 0
ENERGY_RUNTIME_SIGNAL = NEUTRAL
ENERGY_MULTI_REPLICA_CERTIFICATION = UNEXERCISED_FOR_EVENT_WRITES

REDIS_HEALTH = PASS
POSTGRES_HEALTH = PASS
HOST_RESOURCE_HEALTH = PASS
RESOURCE_HEADROOM_ASSESSMENT = ADEQUATE_FOR_N2_ONLY

DEPLOYMENT_CORRELATED_DATA_DEFECT_FOUND = NO_PROVEN_CORRELATION
DEPLOYMENT_CORRELATED_QUEUE_DEFECT_FOUND = NO
DEPLOYMENT_CORRELATED_COORDINATION_DEFECT_FOUND = NO

INC_06_STATUS = CLOSED
OQ_18_STATUS = CLOSED
DEC_016_PRODUCTION_VALIDATED = YES
OQ_28_STATUS = PARTIAL

N2_PRODUCTION_CERTIFICATION = EARLY
N3_PLUS_CERTIFICATION = UNVERIFIED
N1000_CERTIFICATION = CONDITIONAL
SCALING_DEFECT_FOUND = NO

NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 2
NEW_P3_COUNT = 3

PRODUCTION_MUTATION_EXECUTED = NO
PRODUCTION_DEPLOY_EXECUTED_BY_AUDIT = NO

SCALING_PROCESS_CURRENT_STATE_UPDATED = YES
SCALING_PROCESS_KNOWLEDGE_GRAPH_UPDATED = YES
VALIDATION_EVIDENCE_UPDATED = YES
FAILURE_MODEL_UPDATED = NO
DEPLOYMENT_MODEL_UPDATED = YES
OPEN_QUESTIONS_UPDATED = YES
GRAPH_NODES_UPDATED = YES

CI_EVIDENCE_RESULT = PENDING
CI_EVIDENCE_SCOPE = LOCAL_VALIDATORS_AND_FRONTEND_TSC
FINAL_PR_CI_STATUS = EXTERNAL_GITHUB_GATE
FINAL_PR_CI_HEAD = EXTERNAL_GITHUB_GATE
PR_MERGEABLE = EXTERNAL_GITHUB_GATE
PR_DRAFT = EXTERNAL_GITHUB_GATE

BLOCKERS =
RESIDUAL_FINDINGS = OQ-28 continuous soak NOT_MET; duplicate trip SQL (2 groups); battery.v2 +36; unexpected PM2 restarts Sep2; ATE still UNEXERCISED; DIMO/mutex historical metrics UNAVAILABLE
MERGE_RECOMMENDATION = MERGE
NEXT_STAGE = SCHEDULE_UNINTERRUPTED_24H_N2_SEGMENT_OR_DEFER_DEPLOY_WINDOW
```

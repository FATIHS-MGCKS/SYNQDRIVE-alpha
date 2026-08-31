# P1.8.2 Pre-Scale Production Deploy — Single Replica Verification

**Date:** 2026-08-31  
**Host:** srv1374778.hstgr.cloud (app.synqdrive.eu)  
**Deploy mechanism:** `cloud-agent-deploy.sh` → `vps-deploy-release.sh`  
**Production replicas:** 1 (unchanged)  
**Scale-to-2 executed:** NO  

---

## Executive summary

Deployed merged `main` at **`bfcf9ddb7`** (#1469 + #1470) to production release **`20260831190223_v4994`** at **replica=1**. Pre-deploy SHA was **`3874360e0`**. All post-deploy health checks PASS. No orphan validation process. No queue mutations performed.

**Gate verdict:** `READY_FOR_CONTROLLED_SCALE_TO_2`

---

## Phase 0 — Pre-deploy baseline

| Check | Value |
|-------|-------|
| `origin/main` (target) | `bfcf9ddb7` (#1469 + #1470) |
| Production SHA (pre) | `3874360e0` |
| Release (pre) | `20260830145314_v4994` |
| PM2 | `synqdrive` fork ×1 (PID 1700071) |
| Port | 3001 only |
| nginx | `proxy_pass http://127.0.0.1:3001` |
| Redis DB | 0 |
| PostgreSQL | `synqdrive` |
| Health / readiness | PASS / LEADER |
| Port 3010 | not listening |
| Orphan validation process | absent |
| `battery.v2` failed (BullMQ) | 67 |

```
PRE_DEPLOY_BASELINE = PASS
PRE_DEPLOY_MAIN_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
PRE_DEPLOY_PROD_SHA = 3874360e0
PRE_DEPLOY_REPLICA_COUNT = 1
PRE_DEPLOY_ORPHAN_PROCESS_PRESENT = NO
PRE_DEPLOY_HEALTH = PASS
PRE_DEPLOY_READINESS = PASS
```

---

## Phase 1 — Merged main verification

| Item | Status |
|------|--------|
| #1469 soak audit | present on main |
| #1470 remediation | present on main |
| validation-process tracked PID cleanup | present |
| Battery V2 forensic docs | present |
| GitHub CI (`bfcf9ddb7`) | 25/25 PASS (both workflows) |
| Local: validation PID test | PASS |
| Local: focused Jest (63 tests) | PASS |
| Backend `tsc --noEmit` | PASS |
| Frontend `tsc -b --noEmit` | PASS |

```
MAIN_VERIFIED = YES
TARGET_MAIN_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
CI_STATUS = PASS
LOCAL_TEST_STATUS = PASS
BLOCKERS = NONE
```

---

## Phase 2 — Deploy

| Field | Value |
|-------|-------|
| Release ID | `20260831190223_v4994` |
| Deployed SHA | `bfcf9ddb7` |
| Timestamp (UTC) | 2026-08-31T19:08:18Z (health OK) |
| PM2 PID | 2025281 |
| PM2 mode | `fork_mode` (not cluster) |
| Port | 3001 |
| PM2 cumulative restarts | 14 (historical); `unstable restarts = 0` |
| DB backup | `db-pre-deploy-*.sql.gz` created |
| Prisma migrate | ran (no abort) |
| Boot check | PASS (`SYNQDRIVE_BOOT_CHECK=1`) |
| External health | `https://app.synqdrive.eu/api/v1/health` PASS |

```
DEPLOY_STATUS = PASS
DEPLOYED_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
DEPLOYED_RELEASE = 20260831190223_v4994
POST_DEPLOY_REPLICA_COUNT = 1
POST_DEPLOY_PORT = 3001
POST_DEPLOY_PM2_PID = 2025281
SCALE_TO_2_EXECUTED = NO
```

---

## Phase 3 — Application health

| Check | Result |
|-------|--------|
| Process stable | PASS (uptime >6m, no restart loop) |
| `/api/v1/health` | PASS |
| `/api/v1/health/readiness` | PASS |
| Prometheus duplicate registration | NO (`synqdrive_dimo_global_budget_cooldown_active` single series) |
| Unexpected PM2 process | NO (only `synqdrive` + `pm2-logrotate`) |
| Port 3010 | not listening |
| nginx upstream | single 3001 |

```
APP_HEALTH = PASS
READINESS = PASS
PROMETHEUS_DUPLICATE_REGISTRATION = NO
UNEXPECTED_PM2_PROCESS = NO
ORPHAN_VALIDATION_PROCESS_PRESENT = NO
RESTART_LOOP = NO
```

---

## Phase 4 — P1.7 Scheduler leader

| Metric | Value |
|--------|-------|
| `synqdrive_scheduler_leader_status` | 1 (LEADER) |
| Acquire success | 1 |
| Acquire contended | 4 (pre-leader, expected at boot) |
| Renew success | 29+ |
| Redis leader key TTL | healthy (~26s observed) |
| Split brain | NO |

```
SCHEDULER_LEADER_STATUS = PASS
SCHEDULER_LEADER_COUNT = 1
SCHEDULER_RENEWAL_HEALTH = PASS
SCHEDULER_DUPLICATE_TICKS = 0
SPLIT_BRAIN_FOUND = NO
```

---

## Phase 5 — P1.4 Reconciliation mutex

Metrics present and healthy post-restart (counters reset at deploy). No stale-lock accumulation observed. No bypass signal.

```
RECONCILIATION_MUTEX_STATUS = PASS
DOUBLE_EXECUTION_FOUND = NO
STALE_LOCKS_FOUND = NO
MUTEX_BYPASS_FOUND = NO
```

---

## Phase 6 — P1.3 DIMO global budget

| Metric | Value |
|--------|-------|
| `synqdrive_dimo_global_limit` | 50 |
| `synqdrive_dimo_global_in_flight` | 0 |
| `synqdrive_dimo_global_budget_cooldown_active` | 0 |
| Limit breaches | 0 |
| 429 storm | NO |

```
DIMO_GLOBAL_BUDGET_STATUS = PASS
DIMO_GLOBAL_LIMIT = 50
DIMO_MAX_IN_FLIGHT_OBSERVED = 0
DIMO_LIMIT_BREACHES = 0
DIMO_429_COUNT = 0
DIMO_STALE_LEASES = 0
DIMO_BUDGET_BYPASS_FOUND = NO
```

---

## Phase 7 — BullMQ + pipeline health

**Inspection:** `vps-inspect-bullmq-redis.sh` + Redis ZCARD.

| Queue | WAIT | ACTIVE | DELAYED | FAILED |
|-------|-----:|-------:|--------:|-------:|
| battery.v2 | 0 | 0 | 0 | **65** |
| dimo.snapshot.poll | 0 | 0 | 0 | 1 |
| dimo.trip-tracking | 0 | 0 | 0 | 2 |
| trip.behavior.enrichment | 0 | 0 | 0 | 0 |
| (others inspected) | 0 | 0 | low | 0 |

- `battery.v2` failed: **65** (was 67 pre-deploy; **2 jobs cleared by runtime** after #1445 REST pending fix — no operator queue mutation)
- `synqdrive_battery_v2_dead_letter_backlog`: 24
- Post-deploy LOCK_CONTENTION retry: 1 (transient, expected)

```
QUEUE_HEALTH = PASS
RUNAWAY_BACKLOG = NO
STALLED_JOB_ANOMALY = NO
RETRY_STORM_FOUND = NO
BATTERY_V2_FAILED_COUNT = 65
BATTERY_V2_QUEUE_MUTATED = NO
```

---

## Phase 8 — Trip / Route V2

- 2 trips `COMPLETED` in last 2 hours (pipeline active)
- No permanent trip-loss signal
- Route V2 metrics healthy; no regression observed post-deploy
- No UI auto-enrichment or infinite-polling regression introduced by deploy

```
TRIP_PIPELINE_HEALTH = PASS
PERMANENT_TRIP_LOSS_SIGNAL = NO
ROUTE_V2_REGRESSION = NO
AUTO_ENRICH_ON_TRIP_SELECTION = NO
INFINITE_POLLING_REGRESSION = NO
```

---

## Phase 9 — Energy / refuel / recharge

No new refuel/recharge events since deploy window — **NEUTRAL** (not FAIL).

```
ENERGY_PIPELINE_HEALTH = PASS
NEW_REFUEL_EVENTS = 0
NEW_RECHARGE_EVENTS = 0
REFUEL_DUPLICATES_FOUND = NO
REFUEL_METADATA_RUNTIME_SUPPORTED = YES
PHYSICAL_REFUEL_DURATION_FABRICATED = NO
RECHARGE_REGRESSION = NO
```

---

## Phase 10 — Final gate

```
P1_8_2_PRE_SCALE_DEPLOY_GATE = READY_FOR_CONTROLLED_SCALE_TO_2
TARGET_MAIN_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
DEPLOYED_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
DEPLOYED_SHA_MATCH = YES
PRODUCTION_REPLICA_COUNT = 1
SCALE_TO_2_EXECUTED = NO

APP_HEALTH = PASS
READINESS = PASS
ORPHAN_VALIDATION_PROCESS_PRESENT = NO
SCHEDULER_LEADER_HEALTH = PASS
RECONCILIATION_MUTEX_HEALTH = PASS
DIMO_GLOBAL_BUDGET_HEALTH = PASS
QUEUE_HEALTH = PASS
TRIP_PIPELINE_HEALTH = PASS
ROUTE_V2_REGRESSION = NO
ENERGY_PIPELINE_HEALTH = PASS

NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 0
ROLLBACK_REQUIRED = NO
BLOCKERS = NONE
NEXT_STAGE = P1.8.2 controlled production scale-to-2 execution
```

### Residual non-blocking notes

1. Historical `battery.v2` failed=65 (down from 67 without operator mutation; #1445 now live)
2. `battery_v2_dead_letter_backlog=24` — monitor during scale event
3. Minor pre-existing DIMO queue failed counts (snapshot.poll=1, trip-tracking=2)

---

## References

- Deploy log: Cloud Agent `/tmp/p182-deploy.log`
- Pre-scale remediation: `architecture/P1_8_1_PRE_SCALE_REMEDIATION_2026-08-31.md`
- Soak audit: `architecture/P1_8_24H_SINGLE_REPLICA_SOAK_RETROSPECTIVE_AUDIT_2026-08-31.md`

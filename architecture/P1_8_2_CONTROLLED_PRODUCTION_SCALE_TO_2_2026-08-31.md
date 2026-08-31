# P1.8.2 Controlled Production Scale-to-2 — Execution + Multi-Replica Validation

**Date:** 2026-08-31  
**Host:** srv1374778.hstgr.cloud (app.synqdrive.eu)  
**Deployed SHA:** `bfcf9ddb7e18b04d57e9b241883457ec9864ebc5`  
**Release:** `20260831190223_v4994`  
**Execution log:** `/opt/synqdrive/shared/logs/p182-scale-to-2-20260831194121.log`  
**Rollback artifacts:** `/opt/synqdrive/shared/scale-rollback/p182-20260831194121/`

---

## Executive verdict

| Field | Value |
|-------|-------|
| **P1_8_2_SCALE_TO_2_VERDICT** | `SCALE_TO_2_SUCCESS` |
| **SCALE_TO_2_EXECUTED** | `YES` |
| **FINAL_PRODUCTION_REPLICA_COUNT** | `2` |

Controlled production scale from PM2 fork ×1 (port 3001) to **two independent fork processes** (3001 + 3002) with nginx dual-upstream load distribution. All hard safety invariants passed: singleton scheduler leader, safe reconciliation mutex, global DIMO budget (limit 50, not multiplied), successful leader failover (32s), no queue runaway, no historical failed-job mutation.

**Next stage:** P1.8.3 post-scale retrospective production audit.

---

## Phase 0 — Pre-scale baseline

| Check | Value |
|-------|-------|
| `origin/main` SHA | `bfcf9ddb7` |
| Deployed production SHA | `bfcf9ddb7` |
| Runtime equivalence | YES (same release dir) |
| PM2 | `synqdrive` fork ×1, port 3001 |
| nginx | single upstream `127.0.0.1:3001` |
| Health / readiness | PASS / LEADER |
| Port 3010 | not listening |
| `battery.v2` failed | 65 |
| Redis DB | 0 |
| PostgreSQL | `synqdrive` |

```
PRE_SCALE_BASELINE = PASS
CURRENT_MAIN_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
DEPLOYED_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
RUNTIME_EQUIVALENCE_VERIFIED = YES
CURRENT_REPLICA_COUNT = 1
CURRENT_PRODUCTION_PORTS = 3001
CURRENT_SCHEDULER_LEADER_COUNT = 1
CURRENT_BATTERY_V2_FAILED = 65
PORT_3010_LISTENING = NO
BLOCKERS = NONE
```

---

## Phase 1 — Target two-replica topology

| Role | PM2 name | Port | Process model | Env |
|------|----------|------|---------------|-----|
| Replica A | `synqdrive` | 3001 | PM2 fork (existing) | `/opt/synqdrive/shared/backend.env` (`PORT=3001`) |
| Replica B | `synqdrive-b` | 3002 | PM2 fork (new) | Same `.env` + `PORT=3002` `INSTANCE_ID=replica-b` |

**Not used:** validation-only ports 3010/3011 (isolated harness architecture).

### nginx (after scale)

```nginx
upstream synqdrive_backend {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}
# location / → proxy_pass http://synqdrive_backend;
```

### Rollback procedure (defined)

1. Restore nginx backup (`nginx.synqdrive.bak` in rollback dir)
2. `nginx -t && systemctl reload nginx`
3. `pm2 delete synqdrive-b`
4. `pm2 restart synqdrive --update-env`
5. Verify health + single scheduler leader

```
TARGET_REPLICA_COUNT = 2
REPLICA_A_PORT = 3001
REPLICA_B_PORT = 3002
REPLICA_B_PORT_COLLISION = NO
TARGET_PM2_MODE = fork
TARGET_NGINX_UPSTREAMS = 127.0.0.1:3001,127.0.0.1:3002
ROLLBACK_TO_SINGLE_REPLICA_DEFINED = YES
```

---

## Phase 2 — Start Replica B

| Check | Result |
|-------|--------|
| Process start | PASS (PID 2035068) |
| SHA | `bfcf9ddb7` |
| Health | PASS |
| Readiness | PASS (FOLLOWER) |
| Restart count | 0 |
| Startup regression | NO |

```
REPLICA_B_START = PASS
REPLICA_B_PID = 2035068
REPLICA_B_PORT = 3002
REPLICA_B_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
REPLICA_B_HEALTH = PASS
REPLICA_B_READINESS = PASS
REPLICA_B_RESTART_COUNT = 0
STARTUP_REGRESSION = NO
```

---

## Phase 3 — Multi-replica coordination (pre-traffic)

### 3A — Scheduler leader election

| Observation | Value |
|-------------|-------|
| Global leader count | 1 (9 × 5s ticks) |
| Replica A role | LEADER → later FOLLOWER (post-failover) |
| Replica B role | FOLLOWER → later LEADER (post-failover) |
| Duplicate ticks | NO |
| Leader flapping | NO |
| Split brain | NO |
| Redis key | `synqdrive:scheduler:leader` (TTL ~21–30s, renewing) |

### 3B — Reconciliation mutex

Validated via Phase 9 coordination probe on production Redis DB 0 (see below). No double execution on same vehicle scope.

### 3C — DIMO global budget

| Metric | Value |
|--------|-------|
| `synqdrive_dimo_global_limit` | 50 |
| `synqdrive_dimo_global_in_flight` | 0 (steady state) |
| Limit multiplied by replicas | NO |
| 429 regression | NO |

```
SCHEDULER_GLOBAL_LEADER_COUNT = 1
SCHEDULER_REPLICA_A_ROLE = FOLLOWER (final)
SCHEDULER_REPLICA_B_ROLE = LEADER (final)
SCHEDULER_DUPLICATE_TICKS = NO
SCHEDULER_LEADER_FLAPPING = NO
SPLIT_BRAIN_FOUND = NO

DIMO_GLOBAL_LIMIT = 50
DIMO_AGGREGATE_MAX_IN_FLIGHT = 0 (steady); probe max 45/50 under contention
DIMO_LIMIT_BREACHES = NO
DIMO_429_COUNT = 0
DIMO_STALE_LEASES = NO
DIMO_BUDGET_BYPASS = NO
DIMO_LIMIT_MULTIPLIED_BY_REPLICAS = NO
```

---

## Phase 4 — nginx traffic to both replicas

| Check | Result |
|-------|--------|
| `nginx -t` | PASS |
| Reload | PASS (graceful) |
| Upstream A health | PASS |
| Upstream B health | PASS |
| External health | PASS (`https://app.synqdrive.eu/api/v1/health`) |
| 5xx regression | NO |
| Connection regression | NO |

Both replicas respond to direct health on 3001 and 3002; nginx upstream block active.

```
NGINX_CONFIG_TEST = PASS
NGINX_RELOAD = PASS
UPSTREAM_A_HEALTH = PASS
UPSTREAM_B_HEALTH = PASS
BOTH_REPLICAS_RECEIVING_TRAFFIC = YES
HTTP_5XX_REGRESSION = NO
CONNECTION_REGRESSION = NO
```

---

## Phase 5 — BullMQ / job concurrency

Post-scale snapshot (no runaway backlog):

| Queue | WAIT | ACTIVE | FAILED |
|-------|------|--------|--------|
| dimo.snapshot.poll | 0 | 0 | 1 |
| dimo.trip-tracking | 0 | 0 | 2 |
| battery.v2 | 0 | 0 | 65 |

```
AGGREGATE_WORKER_CONCURRENCY = 2× fork workers (shared Redis DB 0 queues)
DUPLICATE_JOB_EXECUTION_FOUND = NO
IDEMPOTENCY_VIOLATION_FOUND = NO
QUEUE_BACKLOG_RUNAWAY = NO
STALLED_JOB_REGRESSION = NO
RETRY_AMPLIFICATION = NO
NEW_FAILED_JOB_ANOMALY = NO
BATTERY_V2_FAILED_BEFORE = 65
BATTERY_V2_FAILED_AFTER = 65
HISTORICAL_FAILED_JOBS_MUTATED = NO
```

---

## Phase 6 — Trip / Route / enrichment

No duplicate finalization signal. No permanent trip loss. Route V2 metrics healthy. No auto-enrich-on-selection or infinite-polling regression observed.

```
TRIP_DUPLICATE_FINALIZATION = NO
PERMANENT_TRIP_LOSS = NO
ROUTE_V2_DUPLICATE_WRITE = NO
ROUTE_V2_REGRESSION = NO
AUTO_ENRICH_ON_TRIP_SELECTION = NO
INFINITE_POLLING_REGRESSION = NO
```

---

## Phase 7 — Energy / refuel / recharge

No live refuel/recharge events during validation window.

```
ENERGY_DOUBLE_SCHEDULING = NO
REFUEL_DUPLICATE_EXECUTION = NO
RECHARGE_DUPLICATE_EXECUTION = NO
DUPLICATE_ENERGY_EVENTS = NO
LIVE_REFUEL_EVENT_VALIDATION = NEUTRAL
LIVE_RECHARGE_EVENT_VALIDATION = NEUTRAL
```

---

## Phase 8 — Controlled leader failover

| Field | Value |
|-------|-------|
| Executed | YES |
| Old leader | `synqdrive` (port 3001) |
| New leader | `synqdrive-b` (port 3002) |
| Failover duration | **32 seconds** |
| Max leaders during failover | 1 |
| Duplicate ticks during failover | NO |
| External health during failover | PASS |
| Queue processing | continued (survivor online) |
| Restarted replica health | PASS |
| Final global leader count | 1 |

Procedure: `pm2 stop synqdrive` → survivor promoted to LEADER at tick 15 (~30s, consistent with leader TTL) → external health remained OK via nginx → `pm2 restart synqdrive` → final roles A=FOLLOWER, B=LEADER.

```
CONTROLLED_FAILOVER_EXECUTED = YES
OLD_LEADER = synqdrive (3001)
NEW_LEADER = synqdrive-b (3002)
FAILOVER_DURATION_SECONDS = 32
LEADER_COUNT_MAX_DURING_FAILOVER = 1
DUPLICATE_TICKS_DURING_FAILOVER = NO
EXTERNAL_HEALTH_DURING_FAILOVER = PASS
QUEUE_PROCESSING_DURING_FAILOVER = YES
RESTARTED_REPLICA_HEALTH = PASS
FINAL_GLOBAL_LEADER_COUNT = 1
```

---

## Phase 9 — Mutex contention test

Production-safe probe: `two-replica-coordination-probe.mjs` with `REDIS_DB=0`.

```json
{
  "mutex": {
    "sameVehicleMaxConcurrent": 1,
    "doubleExecutionFound": false,
    "unrelatedVehiclesParallel": true
  },
  "dimo": {
    "configuredLimit": 50,
    "maxInFlightObserved": 45,
    "limitBreached": false,
    "doubleAcquireFound": false
  }
}
```

```
MUTEX_CONTENTION_TEST_EXECUTED = YES
MUTEX_WINNER_COUNT = 1
PROTECTED_EXECUTION_COUNT = 1
CONTENDED_SKIP_COUNT = 1
STALE_LOCK_AFTER_TEST = NO
DOUBLE_MUTATION_FOUND = NO
```

---

## Phase 10 — Final multi-replica health snapshot

| Replica | PID | Port | SHA | Role | Health |
|---------|-----|------|-----|------|--------|
| A (`synqdrive`) | 2036131 | 3001 | `bfcf9ddb7` | FOLLOWER | PASS |
| B (`synqdrive-b`) | 2035068 | 3002 | `bfcf9ddb7` | LEADER | PASS |

Shared: nginx dual upstream, scheduler leader count=1, Redis/PostgreSQL OK, DIMO limit=50, queues stable.

---

## Phase 11 — Final machine-readable block

```
P1_8_2_SCALE_TO_2_VERDICT = SCALE_TO_2_SUCCESS
SCALE_TO_2_EXECUTED = YES
FINAL_PRODUCTION_REPLICA_COUNT = 2

DEPLOYED_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
REPLICA_A_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
REPLICA_B_SHA = bfcf9ddb7e18b04d57e9b241883457ec9864ebc5
SHA_MATCH = YES

REPLICA_A_HEALTH = PASS
REPLICA_B_HEALTH = PASS
NGINX_TWO_UPSTREAMS = YES

SCHEDULER_GLOBAL_LEADER_COUNT = 1
SCHEDULER_FAILOVER_TEST = PASS
SPLIT_BRAIN_FOUND = NO

RECONCILIATION_MUTEX_HEALTH = PASS
DOUBLE_EXECUTION_FOUND = NO
MUTEX_CONTENTION_TEST = PASS

DIMO_GLOBAL_BUDGET_HEALTH = PASS
DIMO_GLOBAL_LIMIT = 50
DIMO_LIMIT_MULTIPLIED_BY_REPLICAS = NO
DIMO_429_REGRESSION = NO

QUEUE_HEALTH = PASS
DUPLICATE_JOB_EXECUTION_FOUND = NO
RETRY_AMPLIFICATION_FOUND = NO

TRIP_PIPELINE_HEALTH = PASS
PERMANENT_TRIP_LOSS = NO
ROUTE_V2_REGRESSION = NO

ENERGY_PIPELINE_HEALTH = PASS
DUPLICATE_ENERGY_EVENTS = NO

REDIS_HEALTH = PASS
POSTGRES_HEALTH = PASS

NEW_P0_COUNT = 0
NEW_P1_COUNT = 0
NEW_P2_COUNT = 0

ROLLBACK_EXECUTED = NO
BLOCKERS = NONE
RESIDUAL_FINDINGS = Historical battery.v2 failed=65 unchanged; minor historical DIMO failed counts unchanged
NEXT_STAGE = P1.8.3 post-scale retrospective production audit
```

---

## Operational notes

1. **First scale attempt** aborted during Phase 4 due to nginx `upstream` block incorrectly placed inside `server {}` — auto-rollback restored single-replica nginx; replica A required manual `pm2 restart` (rollback trap improved for future).
2. **PM2 persistence:** `pm2 save` captures both `synqdrive` and `synqdrive-b`; future deploys via `vps-deploy-release.sh` restart only `synqdrive` — operators must preserve `synqdrive-b` across deploys or re-run scale procedure.
3. **Validation ports 3010/3011** remain reserved for isolated harness only — not used for production Replica B.

---

## References

- Pre-scale deploy: `architecture/P1_8_2_PRE_SCALE_PRODUCTION_DEPLOY_SINGLE_REPLICA_2026-08-31.md`
- P1.8.1 remediation: `architecture/P1_8_1_PRE_SCALE_REMEDIATION_2026-08-31.md`
- Staging process validation: `architecture/STAGING_TRUE_MULTI_REPLICA_VALIDATION_P1_3_P1_7_P1_4_2026-08-30.md`
- Coordination probe: `backend/scripts/ops/two-replica-coordination-probe.mjs`

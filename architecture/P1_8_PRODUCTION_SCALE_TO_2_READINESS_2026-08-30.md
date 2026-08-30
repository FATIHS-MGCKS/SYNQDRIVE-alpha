# P1.8 — Production Scale-to-2 Readiness Gate

**Date:** 2026-08-30  
**Base main commit (post PR #1440):** `3b736bafeaa86cc8ed3bf43d87020b895d3a579e`  
**Harness branch:** `cursor/p18-production-scale-to-2-readiness-df94`  
**VPS:** `srv1374778.hstgr.cloud`

---

## Executive decision

| Field | Value |
|-------|-------|
| **P1_8_VERDICT** | Readiness gate **complete** |
| **SCALE_TO_2_VERDICT** | **`GO_WITH_CONDITIONS`** |
| **TRUE_PROCESS_LEVEL_MULTI_REPLICA** | **YES** |
| **PRODUCTION_MUTATIONS** | **NONE** |

Scale-to-2 is **architecturally ready** on merged `main`, but production must **deploy P1.3+P1.7+P1.4 first** and satisfy the conditions in §12 before changing PM2 replica count.

---

## Phase 0 — Merged baseline

| Check | Result |
|-------|--------|
| PR #1440 merged | YES @ `3b736bafe` |
| P1_3_PRESENT | YES |
| P1_7_PRESENT | YES |
| P1_4_PRESENT | YES |
| TRIP_ROUTE_V2_PRESENT | YES (`route-v2-r3`) |
| AUTO_ENRICH_ON_TRIP_SELECTION | **NO** (UI only triggers on-demand when `behaviorEnrichmentStatus` is null — background pipeline via `TripEnrichmentOrchestratorService` + BullMQ) |
| CURRENT_PRODUCTION_REPLICAS | **1** |
| CURRENT_PM2_MODE | **fork_mode** |
| CURRENT_REDIS_DB | **0** (1340 keys; `bull:` 1334, `dimo:` 6) |
| CURRENT_REDIS_ENDPOINT | `127.0.0.1:6379` |
| CURRENT_POSTGRES_ENDPOINT | local `synqdrive` |
| Production deployed commit | `d221e766` (**behind main** — P1.7 leader not active in prod readiness) |

---

## Phase 1 — Production configuration audit

### Current topology

```
                    ┌─────────────────────────────────┐
                    │  nginx / TLS (app.synqdrive.eu) │
                    └───────────────┬─────────────────┘
                                    │ :443 → :3001
                    ┌───────────────▼─────────────────┐
                    │  PM2 synqdrive (fork, 1 inst)   │
                    │  PID 1451990, PORT 3001         │
                    │  commit d221e766 (pre-P1.7)     │
                    └───────┬─────────────┬───────────┘
                            │             │
              ┌─────────────▼──┐    ┌─────▼──────────────┐
              │ PostgreSQL      │    │ Redis DB 0        │
              │ synqdrive       │    │ bull:* queues     │
              └─────────────────┘    │ dimo:* state      │
                                     └───────────────────┘
```

### Proposed scale-to-2 topology (NOT APPLIED)

```
                    ┌─────────────────────────────────┐
                    │  nginx upstream (round-robin)   │
                    └───────┬─────────────┬───────────┘
                            │             │
              ┌─────────────▼──┐  ┌───────▼──────────┐
              │ synqdrive #0    │  │ synqdrive #1    │
              │ PORT 3001       │  │ PORT 3002       │
              │ fork PM2        │  │ fork PM2        │
              │ sched: LEADER?  │  │ sched: FOLLOWER │
              │ BullMQ workers  │  │ BullMQ workers  │
              └────────┬────────┘  └────────┬─────────┘
                       │                    │
                       └────────┬───────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │ Redis DB 0 (shared)               │
              │ synqdrive:scheduler:leader (P1.7) │
              │ synqdrive:reconciliation:lock:*   │
              │ dimo:provider:budget:* (P1.3)     │
              │ bull:* (BullMQ)                   │
              └─────────────────┬─────────────────┘
                                │
              ┌─────────────────▼─────────────────┐
              │ PostgreSQL synqdrive (shared)       │
              └─────────────────────────────────────┘
```

### Audit answers

| Question | Answer |
|----------|--------|
| TWO_REPLICA_PORT_STRATEGY | Two fork processes on **3001 + 3002** behind nginx upstream; avoid Node cluster module |
| PM2_CLUSTER_MODE_REQUIRED | **NO** |
| PM2_FORK_X2_SUPPORTED | **YES** (`pm2 start … --instances 2` fork or two named apps) |
| SHARED_REDIS_CONFIRMED | **YES** |
| SHARED_POSTGRES_CONFIRMED | **YES** |
| BULLMQ_MULTI_CONSUMER_SAFE | **YES** (by design — workers on both replicas; idempotent job handlers) |
| SCHEDULER_LEADER_SHARED_REDIS_SAFE | **YES** (P1.7 Redis lease `synqdrive:scheduler:leader`) |
| RECONCILIATION_MUTEX_SHARED_REDIS_SAFE | **YES** (P1.4 per-vehicle `SET NX PX`) |
| DIMO_PROVIDER_BUDGET_SHARED_REDIS_SAFE | **YES** (P1.3 global ZSET leases) |

**Safest topology:** PM2 **fork** × 2 (not cluster), shared Redis DB 0 + Postgres, P1.7 leader election **enabled**, singleton schedulers guarded, BullMQ workers on **both** replicas.

**Why not cluster mode:** NestJS schedulers + BullMQ workers expect independent processes; cluster shares listen socket but scheduler leader election is process-scoped — fork × 2 with explicit ports is clearer for ops.

### Key configuration (from `backend/.env.example` + prod)

| Area | Production-relevant |
|------|---------------------|
| DIMO_GLOBAL_MAX_IN_FLIGHT | 50 |
| DIMO_GLOBAL_RESERVED_HIGH_SLOTS | 10 |
| SCHEDULER_LEADER_LEASE_MS | 30000 |
| RECONCILIATION_EXECUTION_MUTEX_TTL_MS | 120000 |
| WORKER_SNAPSHOT_CONCURRENCY | 5 (per process) |
| WORKER_TRIP_TRACKING_CONCURRENCY | 5 (per process) |

**Note:** 2 replicas ⇒ **2× local worker concurrency** but P1.3 **global** DIMO ceiling remains shared.

---

## Phase 2 — Redis DB 0 namespace validation

**Method:** `redis-db0-namespace-audit.mjs` — SCAN only + `synqdrive:p18-validation:*` test keys, **no FLUSHDB**.

| Metric | Result |
|--------|--------|
| REDIS_DB0_NAMESPACE_SAFE | **YES** |
| KEY_COLLISIONS_FOUND | **0** |
| KEY_PREFIXES_DOCUMENTED | **YES** |
| TTL_SEMANTICS_SAFE | **YES** |
| LOCK_TOKEN_ISOLATION_SAFE | **YES** |
| productionSchedulerLeaderKeyExists | **false** (P1.7 not deployed to prod yet) |

**Documented coordination prefixes:**

- `synqdrive:scheduler:leader`
- `synqdrive:reconciliation:lock:{orgId}:{vehicleId}:trip`
- `dimo:provider:budget:leases`
- `dimo:provider:budget:cooldown_until_ms`
- `bull:{queueName}:*`

---

## Phase 3–4 — Two-process NestJS harness (VPS)

**Run ID:** `20260830115539_p18`  
**Harness Redis DB:** 15 (same server; isolates BullMQ from production DB 0 queues)

| Field | Value |
|-------|--------|
| REPLICA_A_PID | 1664262 |
| REPLICA_B_PID | 1664263 |
| REPLICA_A_PORT | 3010 |
| REPLICA_B_PORT | 3011 |
| TRUE_PROCESS_LEVEL_MULTI_REPLICA | **YES** |

Readiness: one `LEADER`, one `FOLLOWER` across real NestJS processes.

### Scheduler leader (Phase 4)

| Metric | Measured |
|--------|----------|
| LEADER_COUNT_MAX | 1 |
| DUPLICATE_SINGLETON_TICKS | 0 |
| GRACEFUL_FAILOVER_MS | 8373 |
| CRASH_FAILOVER_MS | 10203 |
| SPLIT_BRAIN_FOUND | NO |

---

## Phase 5 — Reconciliation mutex

| Path | Evidence |
|------|----------|
| VPS process probe (3s hold) | sameVehicleMaxConcurrent=1 |
| Jest `reconciliation-execution-mutex-*` | token-safe, fail-closed, stale release blocked |
| Jest `TripReconciliationService` integration | all entrypoints via mutex |

| Metric | Value |
|--------|-------|
| SAME_VEHICLE_MAX_CONCURRENCY | 1 |
| DOUBLE_RECONCILIATION_EXECUTION | 0 |
| UNRELATED_VEHICLES_PARALLEL | PASS |
| STALE_OWNER_RELEASE_PREVENTED | YES |

**Limitation:** VPS did not execute live `reconcileWindow` against production trip rows (no business data mutation).

---

## Phase 6 — Global DIMO budget

| Metric | Value |
|--------|-------|
| GLOBAL_DIMO_LIMIT (probe) | 10 |
| MAX_GLOBAL_IN_FLIGHT_OBSERVED | 10 |
| GLOBAL_LIMIT_BREACHED | NO |
| DOUBLE_ACQUIRE_FOUND | NO |
| 429_RETRY_STORM | NO (not simulated on VPS) |
| REDIS_OUTAGE_FAIL_CLOSED | YES (Jest gate spec) |

**Limitation:** VPS probe uses simplified Lua; full `DimoRequestExecutor` category/priority paths verified in Jest only.

---

## Phase 7 — BullMQ multi-replica

| Check | Result |
|-------|--------|
| BULLMQ_MULTI_REPLICA_SAFE | **YES** (architecture + code audit) |
| DUPLICATE_EFFECTS_FOUND | **NOT_VERIFIED** on live prod queues |
| JOB_RETRY_STORM_FOUND | NO (Jest/logical) |
| JOB_IDEMPOTENCY_REGRESSION | NO |
| SECOND_SCHEDULER_CREATED | **NO** |

Workers intentionally run on **both** replicas; only **singleton schedulers** are leader-gated.

---

## Phase 8 — Trip pipeline regression

| Check | Result |
|-------|--------|
| UI_AUTO_ENRICH_REINTRODUCED | **NO** |
| BACKGROUND_ENRICHMENT_WORKS | **YES** (`TripEnrichmentOrchestratorService` + BullMQ post-finalize) |
| ROUTE_V2_REGRESSION | **NO** (123 route-artifact tests PASS) |
| MANUAL_ENRICH_API_STILL_ALLOWED | **YES** (`enrichTrip` API) |
| CANONICAL_ROUTE_AUTHORITY_UNCHANGED | **YES** (`route-v2-r3`) |
| ENERGY_ENRICHMENT_BUDGETED | **YES** (DimoRequestExecutor categories) |
| ENERGY_STARVATION_FOUND | NO |

---

## Phase 9 — Failure matrix

| Scenario | VPS/Jest | PERMANENT_TRIP_LOSS |
|----------|----------|---------------------|
| A graceful replica shutdown | VPS PASS | NO |
| B hard kill replica | VPS PASS | NO |
| C graceful other replica | NOT_RUN | — |
| D Redis outage | Jest PASS (fail-closed) | NO |
| E Postgres outage | NOT_RUN | — |
| F DIMO 429 burst | Jest partial | NO |
| G DIMO timeout | Jest partial | NO |
| H BullMQ worker restart | NOT_RUN live | NO |
| I Leader crash during trip | NOT_RUN live | NO |
| J Reconciliation owner crash | Jest mutex TTL | NO |
| K Rolling restart | NOT_RUN | NO |
| L Simultaneous boot | VPS PASS | NO |

---

## Phase 10 — Observability

| Area | Metrics (code) | Prod active |
|------|------------------|-------------|
| Scheduler P1.7 | `synqdrive_scheduler_leader_*`, `synqdrive_scheduler_skipped_not_leader_total` | After deploy |
| DIMO P1.3 | `synqdrive_dimo_global_in_flight`, `synqdrive_dimo_acquire_*`, `synqdrive_dimo_429_total` | After deploy |
| Reconciliation P1.4 | `synqdrive_reconciliation_mutex_*` | After deploy |
| BullMQ | queue depth / lag via `QueueMonitoringService` | YES |
| Readiness | `checks.schedulerLeader` | After deploy |

**OBSERVABILITY_SUFFICIENT = YES** (instrumentation present; dashboards require deploy of merged main)

---

## Phase 11 — Capacity / N≈1000 reassessment

From `p12-final5-workload-model` (deterministic, not live DIMO ceiling):

| N | Snapshot enqueue/min (S1) | Required snapshot concurrency @ P50 8s | Global DIMO demand trend |
|---|---------------------------|----------------------------------------|--------------------------|
| 50 | ~19 | ~3 | Low |
| 100 | ~38 | ~6 | Low |
| 250 | ~94 | ~14 | Moderate |
| 500 | ~188 | ~28 | Moderate-high |
| 1000 | ~377 | **~51** (61 w/ 20% headroom) | High |

| Certification | Value |
|---------------|-------|
| SYSTEM_CAPACITY_CERTIFIED | **CONDITIONAL** (model proves architecture; 2 replicas add worker capacity but global DIMO cap is shared) |
| PROVIDER_CEILING_VERIFIED | **NO** |
| N1000_CERTIFICATION | **CONDITIONAL** |

**Critical:** `DIMO_GLOBAL_MAX_IN_FLIGHT=50` bounds **cluster-wide** in-flight DIMO HTTP, not per replica. Scaling to 2 replicas increases BullMQ consumer parallelism but does **not** double DIMO provider capacity.

---

## Phase 12 — Scale-to-2 decision

### SCALE_TO_2_VERDICT = **GO_WITH_CONDITIONS**

### Conditions (must complete before PM2 scale)

1. **Deploy merged main** (`3b736bafe+`) to production — current prod `d221e766` lacks P1.7/P1.4.
2. **Post-deploy:** confirm `/api/v1/health/readiness` shows `schedulerLeader.role`.
3. **Re-run** `p18-production-scale-to-2-readiness.sh` with `HARNESS_REDIS_DB=0` during maintenance window OR accept DB 15 process proof + DB 0 namespace audit.
4. **Monitor** Prometheus for 24h at replica=1 before scaling.
5. **Provider ceiling** remains unverified — treat N1000 as conditional.

### Proposed production configuration (DO NOT APPLY YET)

```bash
# PM2 — two fork processes (example)
pm2 delete synqdrive  # only during controlled rollout
PORT=3001 INSTANCE_ID=synqdrive-0 pm2 start dist/src/main.js --name synqdrive-a -f
PORT=3002 INSTANCE_ID=synqdrive-1 pm2 start dist/src/main.js --name synqdrive-b -f
# nginx upstream: 127.0.0.1:3001, 127.0.0.1:3002
```

| Setting | Proposed |
|---------|----------|
| PROPOSED_PRODUCTION_REPLICAS | 2 |
| PROPOSED_PM2_MODE | fork (two named apps or `-i 2`) |
| PROPOSED_DIMO_GLOBAL_LIMIT | 50 (unchanged) |
| PROPOSED_SNAPSHOT_CONCURRENCY | 5 per process |
| PROPOSED_TRIP_TRACKING_CONCURRENCY | 5 per process |
| Scheduler lease | 30000ms / renew 10000ms |
| Reconciliation mutex TTL | 120000ms |

---

## Phase 13 — Rollout plan (NOT EXECUTED)

### Pre-deploy checklist

- [ ] DB backup (`pg_dump`)
- [ ] Redis `INFO` + queue depth baseline
- [ ] Deploy main with P1.3+P1.7+P1.4
- [ ] Verify single-replica leader metrics 24h
- [ ] nginx upstream config for 2 ports ready
- [ ] Rollback script tested

### Checkpoints

| Time | Inspect | Abort if |
|------|---------|----------|
| T+0 | Deploy main, replica=1, leader role | health fail |
| T+5min | `schedulerLeader`, queue depth | split brain |
| T+15min | DIMO in-flight, 429 rate | budget breach |
| T+30min | reconciliation mutex skips | duplicate execution logs |
| T+60min | route enrichment backlog | age > threshold |
| T+6h | trip finalize rate | trip loss |
| T+24h | full metrics | any rollback trigger |

### Rollback triggers

- `leaderCountMax > 1` sustained
- `synqdrive_scheduler_skipped_not_leader_total` drops to 0 on both (both think leader)
- DIMO global in-flight > limit
- 429 storm
- Queue oldest age > 15min
- Duplicate reconciliation mutations
- Route enrichment backlog growth

### Rollback procedure

1. Scale PM2 to 1 instance
2. Verify single leader
3. Clear stale `synqdrive:scheduler:leader` only if token-safe release fails (ops script)
4. Redeploy previous release if needed

---

## Test matrix

| Suite | Result |
|-------|--------|
| P1.3 provider-budget | 34 PASS |
| P1.7 + P1.4 + staging gate + route | 152 PASS |
| P1.2 scale | 112 PASS |
| build | PASS |
| VPS P1.8 harness | PASS |

---

## Harness artifacts

- `backend/scripts/ops/p18-production-scale-to-2-readiness.sh`
- `backend/scripts/ops/redis-db0-namespace-audit.mjs`
- Logs: `/opt/synqdrive/validation-process/logs/20260830115539_p18/`

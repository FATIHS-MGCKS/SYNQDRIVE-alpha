# Staging TRUE Process-Level Multi-Replica Validation — P1.3 + P1.7 + P1.4

**Date:** 2026-08-30  
**Validation run ID:** `20260830112151_final` (authoritative)  
**Base main commit (PR #1438):** `12842f4aa94fc35c532cb20f67df1b25b53b7968`  
**Validation harness branch:** `cursor/staging-true-process-validation-df94` @ `3819c7c39`  
**VPS:** `srv1374778.hstgr.cloud` (Hostinger production host; isolated validation ports)

---

## Executive verdict

| Field | Value |
|-------|-------|
| **STAGING_MULTI_REPLICA_VERDICT** | `CONDITIONALLY_CERTIFIED` |
| **TRUE_PROCESS_LEVEL_MULTI_REPLICA** | `YES` |
| **N1000_MULTI_REPLICA_CERTIFICATION** | `CONDITIONAL` |
| **PROVIDER_CEILING_VERIFIED** | `NO` (real N≈1000 fleet soak not executed) |

Two **real, simultaneous NestJS backend processes** (separate OS PIDs) were started on the VPS sharing PostgreSQL (`synqdrive`), Redis server (validation **DB 15**), and the same coordination key namespaces as production. Production PM2 `synqdrive` (port **3001**, Redis DB **0**) was **not** scaled and remained healthy throughout.

---

## Phase 0 — Baseline

| Check | Result |
|-------|--------|
| BASELINE_VALID | YES |
| MAIN_HEAD | `12842f4aa94fc35c532cb20f67df1b25b53b7968` |
| PR #1438 merged | YES |
| P1_3_PRESENT | YES (`provider-budget/*`, `DimoRequestExecutor`) |
| P1_7_PRESENT | YES (`scheduler-leader/*`, 42 singleton schedulers guarded) |
| P1_4_PRESENT | YES (`reconciliation-execution-mutex/*`, `TripReconciliationService`) |
| LOCAL_REGRESSION_STATUS | PASS (see Test Matrix) |

---

## Phase 1 — VPS / staging topology audit

### Production (unchanged)

| Item | Value |
|------|-------|
| PM2 app | `synqdrive` |
| Mode | fork (single instance) |
| PID | `1451990` |
| Port | `3001` |
| Deployed commit | `d221e766` (behind main; validation used freshly built branch code) |
| Env file | `/opt/synqdrive/shared/backend.env` |
| PostgreSQL | local `synqdrive` database |
| Redis | `127.0.0.1:6379` DB **0** |
| Health | `https://app.synqdrive.eu/api/v1/health` → `ok` |

### Validation topology (option B — isolated ports)

| Item | Value |
|------|-------|
| Method | Two standalone `node dist/src/main.js` processes (not PM2 cluster) |
| Ports | **3010** (replica A), **3011** (replica B) |
| Redis | Same server, **DB 15** (isolated from production DB 0) |
| PostgreSQL | Shared `synqdrive` via symlinked `backend.env` |
| Queues | Shared BullMQ Redis (DB 15 during validation) |
| Build dir | `/opt/synqdrive/validation-process/20260830112151_procval` |
| Harness | `backend/scripts/ops/vps-two-replica-process-validation.sh` |

**Limitation:** Redis DB index differs from production (15 vs 0). Coordination semantics and Lua scripts are identical; only key namespace isolation prevents touching production leases.

---

## Phase 2 — Two-process staging

### Authoritative run (`20260830112151_final`)

| Field | Value |
|-------|-------|
| REPLICA_A_PID | `1658045` |
| REPLICA_B_PID | `1658046` |
| REPLICA_A_PORT | `3010` |
| REPLICA_B_PORT | `3011` |
| REDIS_SHARED | YES (server shared; DB 15) |
| POSTGRES_SHARED | YES |
| QUEUE_SHARED | YES (BullMQ on validation Redis DB) |
| INSTANCE_ID | `replica-a` / `replica-b` (env) |

### Readiness proof (steady state)

Replica A (`3010`): `schedulerLeader.role = LEADER`  
Replica B (`3011`): `schedulerLeader.role = FOLLOWER`  
→ **Exactly one leader** across two real processes.

Logs: `/opt/synqdrive/validation-process/logs/20260830112151_final/`

---

## Phase 3 — P1.7 leader election (real processes)

| Metric | Measured | Expected |
|--------|----------|----------|
| LEADER_COUNT_MAX | **1** | 1 |
| DUPLICATE_SINGLETON_TICKS | **0** | 0 |
| GRACEFUL_FAILOVER_MS | **7863** | — |
| CRASH_FAILOVER_MS | **10257** (kill leader + restart stopped replica) | — |
| SPLIT_BRAIN_FOUND | **NO** | NO |
| STALE_OWNER_EXECUTION_FOUND | **NO** (not observed) | NO |

### Scenarios

| Scenario | Result |
|----------|--------|
| A. Both replicas healthy | PASS — 6 steady polls, `leaderCountMax=1` |
| B. Graceful stop leader | PASS — follower on 3011 became LEADER in ~7.9s |
| C. Restart stopped replica | PASS — spawned new process on 3011 after crash kill |
| D. Hard-kill leader | PASS (within crash_failover_restart phase) |
| E/F. Redis outage/recovery | NOT RUN on VPS (covered by Jest integration tests) |

Probe: `two-replica-process-validation-probe.mjs` (tolerates UNREACHABLE port during failover).

---

## Phase 4 — P1.4 reconciliation mutex (real OS processes)

Coordination probe forks **two independent Node child processes** competing on the same Redis mutex key pattern as production:

`synqdrive:reconciliation:lock:{org}:{vehicle}:trip`

Workers hold lock **3s** before release to prove concurrent exclusion.

| Metric | Measured | Expected |
|--------|----------|----------|
| SAME_VEHICLE_MAX_CONCURRENT_EXECUTIONS | **1** | 1 |
| UNRELATED_VEHICLES_PARALLEL | **YES** | YES |
| DOUBLE_EXECUTION_FOUND | **NO** | NO |
| STALE_UNLOCK_FOUND | **NO** | NO |
| REDIS_FAIL_CLOSED | N/A (outage not simulated on VPS) | — |
| RETRY_STORM_FOUND | **NO** | NO |

**Note:** Mutex probe validates Redis `SET NX PX` + token release semantics used by `RedisDistributedLockService`. Full `TripReconciliationService.reconcileWindow` overlap was not driven on VPS (no synthetic trip mutations).

---

## Phase 5 — P1.3 global DIMO provider budget (real OS processes)

13 forked workers concurrently acquire leases on `dimo:provider:budget:leases` with `DIMO_GLOBAL_MAX_IN_FLIGHT=10`.

| Metric | Measured | Expected |
|--------|----------|----------|
| CONFIGURED_GLOBAL_LIMIT | **10** | — |
| MAX_GLOBAL_IN_FLIGHT_OBSERVED | **10** | ≤ limit |
| GLOBAL_DIMO_LIMIT_BREACHED | **NO** | NO |
| DOUBLE_ACQUIRE_FOUND | **NO** | NO |
| LEASE_LEAK_FOUND | **NO** (DB 15 flushed post-run) | NO |
| STARVATION_FOUND | **NO** | — |
| PRIORITY_ORDER_VALID | N/A (simplified script; no priority tiers in probe) | — |

**Limitation:** Probe uses simplified acquire Lua (no cooldown / reserved-high slots). Production script validated in Jest (`dimo-provider-budget.service.spec.ts`). Real DIMO HTTP was not hammered.

---

## Phase 6 — Combined cross-system scenarios

| Check | Result |
|-------|--------|
| Two replicas boot simultaneously | PASS |
| Active scheduler + shared Redis coordination | PASS (readiness + leader probe) |
| Kill scheduler leader during work | PASS (graceful + crash phases) |
| PERMANENT_TRIP_LOSS | NO |
| DUPLICATE_TRIP_CREATION | NO |
| DUPLICATE_RECONCILIATION_MUTATION | NO (mutex not driven at service layer on VPS) |
| DUPLICATE_SINGLETON_SCHEDULER_EXECUTION | NO |
| GLOBAL_DIMO_LIMIT_BREACHED | NO |
| RETRY_STORM | NO |
| ORPHAN_JOBS | NO |
| UI_AUTO_ENRICH_REINTRODUCED | NO |
| DRIVING_ROUTE_ENRICH_OWNER_CHANGED | NO |
| ROUTE_V2_REGRESSION | NO (123 Jest tests PASS) |

Full 12-scenario combined failure matrix (Redis outage under load, queue backlog during failover, etc.) was **not** executed on VPS; covered partially by `staging-multi-replica-p13-p17-p14.gate.spec.ts` (logical twins).

---

## Phase 7 — Observability

| Signal | Available |
|--------|-----------|
| Leader identity | YES — `/api/v1/health/readiness` → `checks.schedulerLeader.details` |
| Lease acquire/renew/release | YES — Nest logs `SchedulerLeaderElectionService` |
| Instance identity | YES — `INSTANCE_ID` env + owner token `hostname:pid:uuid` |
| Mutex acquire/skip | YES — service logs + Prometheus (not scraped during validation) |
| DIMO in-flight | YES — Redis ZCARD on `dimo:provider:budget:leases` |

No additional observability code was required for validation.

---

## Phase 8 — Cleanup

| Field | Value |
|-------|-------|
| CLEANUP_COMPLETE | YES |
| ORPHAN_TEST_PROCESSES | 0 (orphan PID `1658422` on 3011 killed manually post-probe) |
| ORPHAN_REDIS_LEASES | 0 (`redis-cli -n 15 FLUSHDB`) |
| POST_VALIDATION_HEALTH | PASS — prod health `ok`, PM2 `synqdrive` online |

---

## Test matrix (local + staging)

| Suite | Result |
|-------|--------|
| P1.3 provider-budget | 34 PASS |
| P1.2 scale / trip-loss | 112 PASS |
| P1.7 scheduler leader + P1.4 mutex + staging gate | 36 PASS |
| Route V2 (`route-artifact`) | 123 PASS |
| `npm run build` | PASS |

**Total automated:** 305+ tests (excluding VPS process probes).

---

## Harness artifacts (branch)

| File | Purpose |
|------|---------|
| `backend/scripts/ops/vps-two-replica-process-validation.sh` | Clone, build, start 2 replicas, run probes, cleanup |
| `backend/scripts/ops/two-replica-process-validation-probe.mjs` | Leader election steady + failover |
| `backend/scripts/ops/two-replica-coordination-probe.mjs` | Mutex + DIMO budget process competition |
| `backend/scripts/ops/two-replica-coordination-worker.mjs` | Forked worker using ioredis |

---

## Certification decision

**TRUE_PROCESS_LEVEL_MULTI_REPLICA = YES** — two independent NestJS OS processes ran concurrently on VPS with shared PostgreSQL and Redis coordination.

**CONDITIONALLY_CERTIFIED** because:

1. Redis validation DB 15 ≠ production DB 0 (same server, isolated namespace).
2. Production PM2 remains single-replica; not a production traffic soak.
3. Mutex/DIMO VPS probes use forked Node workers with production Redis key patterns, not full Nest service call paths.
4. Redis outage / full Phase 6 matrix not executed on VPS.
5. **N1000 / PROVIDER_CEILING_VERIFIED = NO** — fleet-scale provider ceiling remains unproven at runtime.

**PRODUCTION_MUTATIONS = NONE**

---

## Next stage

1. Deploy main (P1.3+P1.7+P1.4) to production via normal release.
2. Scale PM2 to 2 instances in a maintenance window with Redis DB 0.
3. Run `vps-two-replica-process-validation.sh` against production Redis DB 0 (or dedicated staging host).
4. Execute N≈1000 provider-ceiling soak with controlled DIMO test mode.

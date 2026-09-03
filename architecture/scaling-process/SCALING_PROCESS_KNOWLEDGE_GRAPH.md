# SCALING PROCESS — Knowledge Graph

**TYPE:** NAVIGATION_AUTHORITY  
**STATUS:** Bootstrap 2026-09-01

---

## Graph overview

```
Scaling Process
├── Production Topology
│   ├── PM2 (fork, not cluster)
│   │   ├── synqdrive :3001  [Replica A]
│   │   └── synqdrive-b :3002 [Replica B — ONLINE P1.8.3]
│   ├── nginx
│   │   └── upstream synqdrive_backend → 3001 + 3002
│   ├── Redis DB 0 (leases, BullMQ, mutex, DIMO budget)
│   └── PostgreSQL synqdrive (shared SoT)
│
├── Coordination
│   ├── Scheduler Leader Election (P1.7)
│   ├── Reconciliation Execution Mutex (P1.4)
│   └── DIMO Global Provider Budget (P1.3)
│
├── Processing
│   ├── BullMQ (all replicas consume)
│   ├── Snapshot Polling (P1.2 producer path)
│   ├── Trip Tracking / Reconciliation
│   ├── Route V2
│   ├── Battery V2
│   └── Energy / Refuel / Recharge
│
├── Deployment
│   ├── vps-deploy-release.sh
│   ├── Rolling Deploy (P1.8.2.1 — #1472 MERGED)
│   ├── SHA Coherency
│   ├── Health / Readiness Verification
│   ├── Scheduler Convergence Gate (P1.8.3.1 — leader-wait)
│   └── Rollback (vps-rollback-production-release.sh — #1472)
│
├── Failure Domains
│   ├── Redis outage → fail-closed (leader, mutex, budget)
│   ├── Leader crash → TTL failover ~35s
│   ├── Deploy single-replica restart → SUPERSEDED by #1472
│   ├── Deploy leader-timing false-abort → INC-06 (P1.8.3) — **CLOSED** P1.8.3.1 prod validation
│   ├── Deploy bootstrap stale-current → OQ-18 — LIKELY_PRODUCTION_VERIFIED; DEC-016 precision review pending
│   ├── N=2 continuous 24h soak → OQ-28 — PARTIAL (P1.8.3.3 longest FULL_N2 segment 81024s)
│   ├── Trip reconciliation duplicate rows → INC-07 (P1.8.3.3 forensic) — OPEN
│   └── nginx dual-upstream with dead backend
│
├── Scaling Envelopes
│   ├── N=1 PROVEN (soak)
│   ├── N=2 EARLY_PRODUCTION_VALIDATION (P1.8.3.3: calendar >24h; continuous FULL_N2 soak NOT_MET; INC-07 open)
│   └── N≈1000 CONDITIONAL
│
└── Evidence / Decisions / Open Work
    ├── VALIDATION_EVIDENCE.md
    ├── DECISION_LOG.md
    └── OPEN_QUESTIONS_AND_FUTURE_WORK.md
```

---

## Dependency edges

### Scheduler Leader Election

```
TYPE: INVARIANT
DEPENDS_ON → Redis (SET NX PX + Lua renew/release)
PROTECTS → singleton scheduler producers (42 SINGLETON_GLOBAL schedulers)
DOES_NOT_CONTROL → BullMQ consumers / workers
COMPLEMENTS → Reconciliation Mutex (leader gates ticks; mutex gates mutations)
EVIDENCE → P1.7 #1430, staging #1438/#1440, P1.8.2 failover test
```

### Reconciliation Execution Mutex

```
TYPE: INVARIANT
DEPENDS_ON → RedisDistributedLockService
PROTECTS → per-vehicle reconciliation mutations
SCOPE → synqdrive:reconciliation:lock:{orgId}:{vehicleId}:trip
COMPLEMENTS → Scheduler Leader Election
DOES_NOT_REPLACE → job idempotency / DIMO budget
EVIDENCE → P1.4 #1435, coordination probe DB 0 (P1.8.2)
```

### DIMO Global Provider Budget

```
TYPE: INVARIANT
DEPENDS_ON → Redis ZSET lease registry + Lua
LIMITS → provider HTTP in-flight across ALL replicas
IS_DISTINCT_FROM → BullMQ worker concurrency (local CPU protection)
APPLIES_TO → DimoRequestExecutor (canonical HTTP wrapper)
FAIL_CLOSED → Redis outage → DimoProviderBudgetError
EVIDENCE → P1.3 #1417, P1.8 soak, P1.8.2 coordination probe
```

### BullMQ Workers

```
TYPE: FACT
ALL_REPLICAS_CONSUME → YES
LEADER_GUARDED → NO (by design)
SAFE_BECAUSE → idempotent jobs + mutex + global budget where needed
EVIDENCE → P1.7 final response, staging validation
```

### Deployment Lifecycle

```
TYPE: DECISION (P1.8.2.1 — merged #1472; P1.8.3.1 convergence gate)
MUST_PRESERVE → replica SHA equality after deploy
MUST_PRESERVE → exactly one scheduler leader
MUST_PRESERVE → both replicas registered when REPLICA_COUNT=2
MUST_PRESERVE → nginx upstream matches live processes
CONVERGENCE_GATE → leaderCount=0 transient retry; >1 immediate FAIL_SPLIT_BRAIN; 2 stable obs of 1
PROVENANCE → SYNQDRIVE_REQUESTED_DEPLOY_SHA end-to-end (DEC-016)
BOOTSTRAP → source libs from RELEASE_DIR (DEC-015); cloud-agent exact-SHA bootstrap (OQ-18 **LIKELY_PRODUCTION_VERIFIED**; DEC-016 precision review)
SUPERSEDES → single `pm2 restart synqdrive` only model
SUPERSEDES → immediate single-snapshot leader check (INC-06)
EVIDENCE → P1.8.3.1 production validation attempt 3; DEC-015; DEC-016 unit tests
```

### Snapshot Polling (P1.2)

```
TYPE: DECISION
PROTECTS → trip boundary integrity, trip-loss prevention
UPSTREAM_OF → trip tracking, reconciliation, Route V2
EVIDENCE → SNAPSHOT_POLLING_P1_2_* gates, soak trip pipeline PASS
```

---

## Cross-cutting invariants (do not break)

| ID | Invariant | Category |
|----|-----------|----------|
| INV-01 | Exactly one scheduler leader globally | INVARIANT |
| INV-02 | DIMO global limit is shared, not per-replica | INVARIANT |
| INV-03 | Same-vehicle reconciliation mutex max concurrency = 1 | INVARIANT |
| INV-04 | BullMQ consumers active on all replicas | INVARIANT |
| INV-05 | Production Redis DB 0 for coordination + queues | INVARIANT |
| INV-06 | Validation harness ports 3010/3011 ≠ production ports | INVARIANT |
| INV-07 | Deploy must not leave mixed application SHA across replicas | INVARIANT (#1472) |
| INV-08 | Fail-closed on Redis outage for leader/mutex/budget | INVARIANT |

---

## PR dependency chain (scaling-relevant)

```
#1417 P1.3 DIMO budget
  → #1430 P1.7 scheduler leader (depends on budget for safe multi-replica DIMO)
  → #1435 P1.4 reconciliation mutex
  → #1438 staging logical multi-replica gate
  → #1440 true process-level VPS validation (Redis DB 15)
  → P1.3-S6 single-replica prod deploy
  → #1469 P1.8 soak audit
  → #1470 P1.8.1 remediation
  → #1471 P1.8.2 scale-to-2 (docs + runtime)
  → #1472 P1.8.2.1 deploy hardening (MERGED)
  → P1.8.3.1 leader-wait convergence gate (INC-06 remediation)
```

---

## Navigation by question

| Question | Read |
|----------|------|
| What is running now? | [CURRENT_STATE.md](./CURRENT_STATE.md) |
| Why one scheduler leader? | [SCHEDULER_LEADER_ELECTION.md](./SCHEDULER_LEADER_ELECTION.md) |
| Why global DIMO budget? | [DIMO_GLOBAL_PROVIDER_BUDGET.md](./DIMO_GLOBAL_PROVIDER_BUDGET.md) |
| Why reconciliation mutex? | [RECONCILIATION_EXECUTION_MUTEX.md](./RECONCILIATION_EXECUTION_MUTEX.md) |
| Why workers on all replicas? | [BULLMQ_AND_WORKER_MODEL.md](./BULLMQ_AND_WORKER_MODEL.md) |
| How to deploy safely? | [MULTI_REPLICA_DEPLOYMENT.md](./MULTI_REPLICA_DEPLOYMENT.md) |
| Why does deploy wait on 0 leaders? | [P1_8_3_1_DEPLOY_LEADER_WAIT_HARDENING_2026-09-01.md](../P1_8_3_1_DEPLOY_LEADER_WAIT_HARDENING_2026-09-01.md) |
| What failed historically? | [FAILURE_AND_RECOVERY_MODEL.md](./FAILURE_AND_RECOVERY_MODEL.md) |
| What is certified at N=2? | [SCALING_ENVELOPES.md](./SCALING_ENVELOPES.md) |

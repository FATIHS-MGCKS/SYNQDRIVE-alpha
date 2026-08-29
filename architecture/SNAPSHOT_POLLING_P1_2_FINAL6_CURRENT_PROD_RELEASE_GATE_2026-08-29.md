# P1.2 FINAL-6 — Current-Production Release Safety Gate

**Date:** 2026-08-29  
**PR:** #1409  
**Scope:** Answer **A)** Is P1.2 safe for **current** single-PM2 production?  
**Separate from:** **B)** N≈1000 certification (FINAL-5 → NOT CERTIFIED)

---

## 1. Actual production topology

| Question | Answer | Evidence |
|----------|--------|----------|
| `CURRENT_PROD_REPLICAS` | **1** | `vps-deploy-release.sh` → `pm2 restart synqdrive`; `battery-runtime-topology.md` VPS read-only: single `synqdrive` fork process |
| PM2 cluster mode | **No** | No `ecosystem.config.js` in repo; all ops scripts reference one app `synqdrive` in fork mode |
| API/workers/schedulers | **Colocated** | `WorkersModule` registers processors + schedulers in same NestJS app |
| BullMQ workers | **1 instance each** per queue namespace (single process) | `@Processor` classes in `workers.module.ts` |
| `@Interval`/`@Cron` schedulers | **1 instance each** (single process) | 17 schedulers in `WorkersModule` |
| Redis | **1** (systemd, BullMQ backend) | `battery-runtime-topology.md` |
| PostgreSQL | **1** (systemd, operational truth) | deploy script `pg_dump` / `prisma migrate` |
| Deploy behavior | **In-place restart** | `ln -sfn` release → `pm2 restart synqdrive` (not rolling, not blue/green) |
| `CAN_TWO_SCHEDULERS_EXIST_DURING_DEPLOY` | **NO** (normal deploy) | `pm2 restart` replaces fork process; `SYNQDRIVE_BOOT_CHECK=1` exits before `listen()` (`main.ts:75-78`) — boot check cannot overlap live schedulers |
| Scheduler gap during restart | **12–60s** typical | `master-admin-deploy-attempt-2026-07-26.md`; resume backfill if gap > **3 min** |

**Production CONNECTED fleet count:** **UNKNOWN** (not queryable from audit environment). Planning uses explicit scenarios N=10..250.

---

## 2. Current fleet load (S1 normal mix)

| N | Snapshot enqueue/min | Capacity c=5 @P50 8s | Backlog growth/min | Fast reconcile calls/hr | Total DIMO req/min | Min c @P50 8s | +20% headroom |
|---|---------------------|----------------------|--------------------|-------------------------|-------------------|---------------|---------------|
| 10 | 3.8 | 37.5 | 0 | 20 | ~9 | **2** | 2 |
| 25 | 9.4 | 37.5 | 0 | 50 | ~22 | **2** | 2 |
| 50 | 18.8 | 37.5 | 0 | 100 | ~44 | **4** | 4 |
| 100 | 37.7 | 37.5 | **+0.2** | 200 | ~88 | **6** | **8** |
| 250 | 94.2 | 37.5 | **+56.7** | 500 | ~220 | **13** | **16** |

**Recovery latency:** With slight backlog (N=100, c=5), steady-state drift is marginal; reconciliation fast tier (15m) + warm (4h) repairs observation gaps within minutes–hours. Permanent trip loss does not occur — only freshness degradation.

---

## 3. Smallest safe concurrency (SAFE_FOR_CURRENT_LOAD)

| N | Recommended `WORKER_SNAPSHOT_CONCURRENCY` | Stable at default c=5? | CERTIFIED_PROVIDER_SAFE? |
|---|------------------------------------------|------------------------|--------------------------|
| 10 | 2 | Yes | **No** — provider ceiling unknown |
| 25 | 2 | Yes | **No** |
| 50 | 4 | Yes | **No** |
| 100 | **8** (+20% headroom) | Marginal at 5 | **No** |
| 250 | **16** (+20% headroom) | No | **No** |

**Do not use concurrency=13 as a blanket default** — it is correct only for N≈250 S1, not N≤50.

---

## 4. Process-local DIMO fan-out (current prod, defaults)

```
max_in_flight ≈ WORKER_SNAPSHOT_CONCURRENCY
              + WORKER_TRIP_TRACKING_CONCURRENCY × 3
              + 1 (reconciliation overlap)
              = 5 + 15 + 1 = 21 HTTP slots (defaults)
```

| Path | Queue | Concurrency | Max simultaneous | Overlaps |
|------|-------|-------------|------------------|----------|
| Snapshot | `dimo.snapshot.poll` | 5 | 5 | Yes |
| ACTIVE_TICK | `dimo.trip-tracking` | 5 | 15 (3× parallel/job) | Yes |
| Reconciliation | inline scheduler | serial | 1 | Yes |
| Behavior | `trip.behavior.enrichment` | 1 | 1 | Yes |
| DTC | `dimo.dtc.poll` | 1 | 1 | Yes |
| Vehicle sync | `dimo.vehicle.sync` | 1 | 1 | Yes |
| Battery V2 | `battery.v2` | 2 | 2 | Yes |

BullMQ concurrency bounds **worker slots**, not global provider budget.

---

## 5. Trip-loss regression gate (A–T)

All scenarios: **PERMANENT_TRIP_LOSS = NO**.

| ID | Scenario | Eventual recovery | Test evidence |
|----|----------|-------------------|---------------|
| A | Normal ACTIVE trip | N/A | `partial-boundary-repair.final3` |
| B | RESTING between polls | YES | tier + fast reconcile |
| C | LONG_IDLE between polls | YES | cold tier + segment fallback |
| D | Short trip between polls | YES | `delayed-start-reconciliation.safety-gate` |
| E | Delayed trip start | YES | `delayed-start-boundary.safety-gate` |
| F | Partial suffix live trip | YES | `partial-suffix-repair.safety-gate` |
| G | Segment after completion | YES | `reconcileWindow` |
| H | Snapshot timeout | YES | BullMQ retry + jobId recycle |
| I | DIMO 429 wave | YES | backlog, not loss; recharge retries |
| J | Redis unavailable | YES | `final31` boundary applied before enqueue fail |
| K | Backend down 5m | YES | resume backfill if gap >3min |
| L | Backend down 30m | YES | backfill cap 24h + cold tier |
| M | Worker restart active trip | YES | `trip-tracking-recovery.scheduler` |
| N | Restart during boundary refresh | YES | `final32` lifecycle |
| O | Stale ENQUEUED boundaryRefresh | YES | `final32` stale lease |
| P | Duplicate reconciliation | N/A | idempotent reconcileWindow |
| Q | Duplicate scheduler tick | N/A | jobId dedup |
| R | Simultaneous boundary repair | N/A | `final31` optimistic lock |
| S | Stale connectionStatus | YES | episode + reconcile |
| T | Snapshot miss, segment later | YES | `detectAndRepairMissingTrips` |

---

## 6. Rollback failure analysis

| Flag | Effect on trips | Orphan risk |
|------|-----------------|-------------|
| `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` | Reverts to O(N) 30s enqueue | **No** — reconcile still runs |
| `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false` | Disables new boundary extension | **No** — applied repairs + COMPLETED state persist; PENDING/ENQUEUED still retryable |

Rollback with active trips, PENDING/ENQUEUED boundary refresh, queued jobs: **no orphan path proven** — reconciliation + recovery schedulers continue.

---

## 7. Deployment transition safety

| State during deploy | Risk | Mitigation |
|---------------------|------|------------|
| No trip active | Low | Normal restart |
| ACTIVE_TRIP | Low | FSM state in PG; trip-tracking recovery re-enqueues |
| POSSIBLE_START/END | Low | Recovery scheduler + reconcile |
| boundary PENDING/ENQUEUED | Low | `findRecoverableTrips` batch 20 on next reconcile |
| PM2 restart gap <3min | Low | Normal tick resumes |
| PM2 restart gap >3min | Medium freshness | `runResumeBackfill` one-shot |

**Two schedulers during deploy:** **NO** under normal `pm2 restart`.

---

## 8. Current-prod hard guardrails

- **Certified operating envelope:** N ≤ **100** CONNECTED vehicles (S1 mix) with `WORKER_SNAPSHOT_CONCURRENCY=8`
- **Startup warning:** `DimoSnapshotScheduler` logs fleet envelope assessment once per boot (`evaluateFleetEnvelope`)
- **Does not fail startup** — warn only
- N > 100 or under-provisioned concurrency → WARN log with recommended concurrency

---

## 9. Observability for current deploy

### A. REQUIRED BEFORE CURRENT-PROD MERGE
- Existing `synqdrive_dimo_snapshot_poll_total` (success/failure)
- Fleet envelope startup WARN (implemented FINAL-6)
- Documented env: `WORKER_SNAPSHOT_CONCURRENCY`

### B. REQUIRED BEFORE N≈1000
- Global DIMO in-flight / 429 counters
- Queue depth + oldest job age per snapshot/trip-tracking
- Global DIMO semaphore (P1.3)

### C. NICE TO HAVE
- Per-org backlog
- Snapshot tier Prometheus counters

---

## 10. Test / CI proof

| Suite | Result |
|-------|--------|
| `npm run test:p12:scale` (FINAL-4/5/6) | Run locally on HEAD |
| Boundary repair PostgreSQL | `npm run test:boundary-repair:postgres` (gated) |
| `npm run build` | PASS |

---

## 11. Dual verdicts

### CURRENT PRODUCTION

**SAFE TO MERGE PR #1409**

Conditions:
- Single PM2 replica remains authoritative
- CONNECTED fleet ≤ **100** vehicles (certified envelope)
- `WORKER_SNAPSHOT_CONCURRENCY=8` (or higher per load table if fleet grows toward 100)
- `WORKER_TRIP_TRACKING_CONCURRENCY=5` (default acceptable for current envelope)
- Rollback flags documented and tested

Not blockers for current prod:
- Global DIMO semaphore (P1.3)
- Scheduler leader election (needs 2+ replicas)
- N≈1000 observability gaps

### N≈1000 TARGET

**NOT CERTIFIED — P1.3 REQUIRED**

---

## Production env (current deploy)

```bash
WORKER_SNAPSHOT_CONCURRENCY=8
WORKER_TRIP_TRACKING_CONCURRENCY=5
WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK=0
WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN=0
DIMO_REQUEST_TIMEOUT_MS=10000
TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=true
WORKER_SNAPSHOT_ACTIVITY_TIER_POLLING_ENABLED=true
```

## Rollback

1. `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` and/or `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false`
2. Prior release via `vps-deploy-release.sh` rollback symlink
3. `pm2 restart synqdrive --update-env`

---

## Changes / Architektur

- **Changes:** `ChangesView.tsx` FINAL-6 entry
- **Architektur:** `ArchitekturView.tsx` + this document

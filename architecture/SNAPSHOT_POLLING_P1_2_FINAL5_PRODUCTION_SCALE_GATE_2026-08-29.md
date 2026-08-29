# P1.2 FINAL-5 — Production Scale Gate for PR #1409

**Date:** 2026-08-29  
**PR:** #1409 (`cursor/p12-activity-tier-snapshot-polling-f21f`)  
**HEAD:** `b017e004754d266a13abfe23aa45d0e61c53e80f` (post FINAL-4 + FINAL-5 audit)  
**Builds on:** FINAL-3.2 boundary completion, FINAL-4 scale closeout  
**Verdict:** **DO NOT MERGE PR #1409**

---

## Part A — Production topology authority

### A. Runtime authority (from repo)

| Source | Finding |
|--------|---------|
| `backend/scripts/ops/vps-deploy-release.sh` | Single PM2 app `synqdrive`; `pm2 restart synqdrive --update-env` |
| `docs/audits/trip-enrichment-driver-score-energy-events-audit-2026-08.md` | **CONFIRMED FROM CODE + PRODUCTION:** one PM2 process runs API + BullMQ processors + `@Interval`/`@Cron` schedulers |
| `backend/src/app.module.ts` | `WorkersModule` always registered; Redis health gates `RuntimeStatusRegistry.setWorkersEnabled` only |
| No `ecosystem.config.js` in repo | PM2 config lives on VPS; deploy script references one app name |

### A. Topology table

| Component | Runtime process | Replica count (prod) | Scheduler? | Worker? | DIMO calls? | Concurrency source | Distributed guard? |
|-----------|-----------------|----------------------|------------|---------|-------------|-------------------|-------------------|
| NestJS API | `synqdrive` PM2 | **1** | — | — | On-demand (admin/sync) | API throttler 200/min/IP | — |
| `DimoSnapshotScheduler` | same | 1× (dup per replica) | **Yes** `@Interval(30s)` | — | Enqueue only | Serial loop + optional `WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK` | BullMQ `jobId=snapshot-{vehicleId}` |
| `DimoSnapshotProcessor` | same | 1× workers | — | **Yes** | 1 GQL/job | `WORKER_SNAPSHOT_CONCURRENCY` (default 5, max 200) | jobId dedup |
| `TripTrackingProcessor` | same | 1× | — | **Yes** | 1–3 GQL/job | `WORKER_TRIP_TRACKING_CONCURRENCY` (default 5) | jobId per FSM phase |
| `TripReconciliationScheduler` | same | 1× | **Yes** fast/warm/cold | Inline (no queue) | 3–5 GQL/vehicle/run | Serial per vehicle | Idempotent reconcileWindow |
| `DimoDtcScheduler` + processor | same | 1× | Yes (3h) | Yes | 1 GQL/vehicle | Default 1 | jobId bucket dedup |
| `DimoVehicleSyncScheduler` | same | 1× | Yes (24h) | Yes | P identity + 2×V telemetry | Default 1 | Scheduler upsert |
| Behavior/driving-impact | same | 1× | — | Yes | 1–6+ GQL/trip | Default 1 each | jobId dedup |
| Battery V2 | same | 1× | Reconcile interval | Yes | 1–3 GQL/job | concurrency 2 | Idempotency keys |
| Energy events | inline in reconcile | 1× | Via reconciliation | — | 2 mechanisms/vehicle | Serial | DB upsert |

### A1. Current production replica count

**1 PM2 instance (`synqdrive`)** — authoritative from deploy script + prior production audit.

### A2. Backend scales 1 → 2 → 4 replicas

| Scale | Effect |
|-------|--------|
| 1 → 2 | Every `@Interval`/`@Cron` scheduler runs **twice**; duplicate DB queries; duplicate enqueue attempts |
| Snapshot queue | `jobId` dedup → at most one active `snapshot-{vehicleId}` per Redis namespace; completed/failed removed before re-add |
| Reconciliation | **No dedup** — fast/warm/cold runs duplicate per replica → 2× or 4× DIMO segment/energy calls |
| Trip tracking | jobId dedup per phase — duplicate enqueue mostly no-op if job active |
| Provider HTTP | Cross-queue sum **per replica** — global ceiling = replicas × process-local max |

### A3. Schedulers that duplicate automatically

All `@Interval`/`@Cron` in `WorkersModule` + feature modules: snapshot (30s), trip reconciliation (15m/4h/daily), DTC, vehicle sync, trip-tracking recovery, driving-analysis recovery, battery reconciliation, HM health, retention sweeps, etc.

### A4. BullMQ workers that scale horizontally safely

Workers with deterministic `jobId` dedup scale **safely for correctness** (no duplicate active jobs per key): snapshot, trip-tracking phases, behavior enrichment, driving-impact. Throughput scales with replica count **only if** Redis single-writer job semantics hold and provider budget allows multiplied concurrency.

### A5. jobId dedup vs unprotected work

| Protected (jobId) | Not protected |
|-------------------|---------------|
| `snapshot-{vehicleId}` | Fast/warm/cold reconciliation (inline scheduler) |
| `trip-{phase}-{vehicleId}[-{tripId}]` | Resume backfill (`runResumeBackfill`) |
| `hf-enrich-{tripId}` | Scheduler DB cohort queries |
| `driving-impact-{tripId}` | Warm/cold full-fleet serial loops |
| `dtc-poll-{vehicleId}-{bucket}` | Multi-replica scheduler duplication |

---

## Part B — DIMO call inventory summary

**Transport:** `DimoTelemetryService.queryGraphQL` → `POST https://telemetry-api.dimo.zone/query`, **15s** timeout per call (snapshot path). Auth: `DimoAuthService.getVehicleJwt` (cached, 10s timeout).

**PROVIDER LIMIT UNKNOWN** — no authoritative DIMO rate/concurrency quota in repo, `.env.example`, or `dimo.config.ts`.

| Path | Queue/trigger | Cadence | Calls/invocation | Pagination | HTTP retries | BullMQ retries | Overlap |
|------|---------------|---------|------------------|------------|--------------|----------------|---------|
| Snapshot poll | `dimo.snapshot.poll` | Tier 30s–30min | **1** GQL | No | **None** | 3× exp 5s | Yes — other queues |
| ACTIVE_TICK | `dimo.trip-tracking` | ~30s/trip | **3** parallel GQL | No | None | 3× | Yes |
| POSSIBLE_START confirm | trip-tracking | Event | 1–3 + route/temp | No | None | 3× | Yes |
| END_VALIDATION | trip-tracking | Event | 1 GQL | No | None | 3× | Yes |
| Fast reconcile | scheduler 15m | 4/hr | 3–5/vehicle | Segment: no; recharge: 31d windows | Recharge only: 3× | N/A | Yes |
| Warm reconcile | scheduler 4h | 0.25/hr | 3–5/vehicle | Same | Recharge 3× | N/A | Yes |
| Cold reconcile | cron 03:00 | 1/day | 3–5/vehicle | Same | Recharge 3× | N/A | Yes |
| Behavior SMART5 | `trip.behavior.enrichment` | Post-finalize | 2 GQL | No | None | 3× exp 10s | Yes |
| Behavior LTE_R1 | same | Post-finalize | 2+ paginated | 6h chunks | 3×/chunk | 3× | Yes |
| DTC | `dimo.dtc.poll` | 3h | 1/vehicle | No | None | 3× | Yes |
| Vehicle sync | `dimo.vehicle.sync` | 24h | P + 2V | Identity cursor | None | 3× | Yes |
| Battery HV | `battery.v2` | Various | 1–3 | Recharge windows | Recharge 429-aware | 3× | Yes |

**429 handling:** Only `dimo-recharge-segments` client (`isRetryableDimoAxiosError` → 429/5xx/timeout). All other paths: axios error → BullMQ retry or empty-array swallow.

**Worst-case retry amplification:** BullMQ 3× × recharge client 3× = **9×** per recharge window on 429 waves.

---

## Part C — Workload / concurrency matrices

Model: `p12-final5-workload-model.ts` + `p12-final5-production-scale-gate.spec.ts`.

Formula: `required_concurrency = ceil((jobs/min ÷ 60) × service_seconds × headroom)`

### S1 normal (5/15/60/20) — snapshot enqueue & required concurrency

| N | enqueue/min | total DIMO req/min | c@P50 2s | c@P50 4s | c@P50 8s | c@P95 15s | c@30s slow | +20% @8s | +50% @8s |
|---|-------------|-------------------|----------|----------|----------|-----------|------------|----------|----------|
| 100 | 37.7 | ~88 | 2 | 3 | **6** | 10 | 19 | 8 | 9 |
| 250 | 94.2 | ~220 | 4 | 7 | **13** | 24 | 48 | 16 | 20 |
| 500 | 188.3 | ~440 | 7 | 13 | **26** | 48 | 95 | 32 | 39 |
| 1000 | 376.7 | ~877 | 13 | 26 | **51** | 95 | 189 | 61 | 76 |

*total DIMO req/min includes snapshot + ACTIVE_TICK (3× per active-driving vehicle per 30s) + amortized reconciliation.*

### S2 busy (20/30/40/10)

| N | enqueue/min | total DIMO req/min | c@P50 8s |
|---|-------------|-------------------|----------|
| 1000 | 753.3 | ~1653 | **101** |

### S3 extreme (50/30/20)

| N | enqueue/min | total DIMO req/min | c@P50 8s |
|---|-------------|-------------------|----------|
| 1000 | 1253.3 | ~4253 | **168** |

### Backlog growth at default `WORKER_SNAPSHOT_CONCURRENCY=5`, P50 8s

| N (S1) | capacity/min | backlog growth/min |
|--------|--------------|-------------------|
| 100 | 37.5 | ~0.2 (marginal) |
| 1000 | 37.5 | **~339** |

---

## Part D — Snapshot worker capacity audit

| Item | Value |
|------|-------|
| Default | 5 (`worker.config.ts` + `@Processor`) |
| Env parsing | `parseBoundedConcurrency`, invalid → fallback 5 |
| Upper bound | 200 |
| DIMO requests per slot | **1** primary GQL (+ JWT cache hit) |
| DB writes per slot | VLS upsert + poll log + trip eval side effects |
| lockDuration | 60s (prevents stall → permanent jobId block) |
| Retry | BullMQ 3× exp 5s; failed jobs removed before re-enqueue |
| Increasing concurrency | Increases parallel DB writes + DIMO HTTP |

**N=1000 S1 minimum snapshot concurrency:** 51 (P50 8s), 95 (P95 15s), 189 (30s provider-slow).  
**Practical safe limit without provider quota:** **cannot certify** — PROVIDER LIMIT UNKNOWN.

---

## Part E — Provider budget / global semaphore

### Finding: **PROVIDER LIMIT UNKNOWN**

Searched: `dimo.config.ts`, `.env.example`, architecture docs, DIMO MCP references, recharge client tests. No documented DIMO telemetry API rate limit, concurrency cap, or 429 policy beyond recharge-segments local retry.

### Global maximum concurrent DIMO HTTP (single PM2, defaults)

```
max ≈ WORKER_SNAPSHOT_CONCURRENCY
    + WORKER_TRIP_TRACKING_CONCURRENCY × 3
    + 1 (reconciliation overlap)
    = 5 + 15 + 1 = 21
```

At max env (200+200): **801** concurrent theoretical slots — not globally coordinated.

### Verdict

| Question | Answer |
|----------|--------|
| Mandatory before merge for **current 1-replica prod**? | **No** — bounded per-process fan-out exists |
| Mandatory before **N≈1000** or **horizontal scaling**? | **Yes** — hard prerequisite |
| Severity without semaphore at N=1000 | **HIGH** — cross-queue multiplication + unknown provider ceiling |

### Smallest production-safe limiter (design only — not implemented)

Redis-backed token bucket / semaphore: key `dimo:telemetry:inflight`, max permits from env, lease TTL = `DIMO_REQUEST_TIMEOUT_MS + buffer`, blocking acquire with jittered backoff, observability counters, respects `Retry-After` when present. Deferred to P1.3+.

---

## Part F — Scheduler leader election

| Question | Answer |
|----------|--------|
| F1. Duplication correctness risk? | **Low** for trips — idempotent reconcile + jobId dedup. **Medium** for wasted work and provider load. |
| F2. Unbounded provider fan-out? | **No** per replica (serial reconciliation + worker caps). **Yes** across replicas (N× duplication). |
| F3. Bounded wasted work only? | **Yes** at 1 replica. At 2+ replicas: reconciliation DIMO calls scale linearly with replica count. |
| F4. Required before merge (current 1-replica prod)? | **No** |
| F5. Required before horizontal scaling? | **Yes** |

---

## Part G — Failure / backpressure model

| Scenario | Queue growth | Recovery | Trip loss? | Notes |
|----------|--------------|----------|------------|-------|
| G1. DIMO 30s latency | Snapshot backlog ↑ | Bounded by tier + reconcile | **No** — reconcile repairs | Freshness ↓ |
| G2. 429 wave | Failures + retries | Recharge: 9× amp possible | **No** | No global 429 backoff |
| G3. 5xx wave | BullMQ retries | 3× per job | **No** | |
| G4. Timeout wave | Same as G1 | jobId unblock on remove | **No** | lockDuration 60s |
| G5. Redis down 5min | Workers disabled flag | Reconnect | **No** | Boot-time check only |
| G6. Backend down 5min | Missed polls | Resume backfill + reconcile | **No** | `SUSPEND_THRESHOLD_MS` 3min |
| G7. Backend down 30min | Larger gap | Backfill capped 24h + cold tier | **No** | |
| G8. Worker restart + backlog | Depth persists | Consumer drains | **No** | |
| G9. 1000 vehicles reconnect | Enqueue spike | Tier gating + optional cap | **No** | |
| G10. 500 trips pending enrichment | Behavior queue depth | Serial c=1 default | **No** | Latency ↑ |
| G11. 50% fleet driving (S3) | Snapshot + ACTIVE_TICK saturate | Needs c≈168 @8s | **No** | Throughput crisis |
| G12. 2 replica schedulers | 2× reconcile DIMO | Duplicate work | **No** | Provider load ↑ |

**Primary invariant:** backlog and latency may grow; **no proven silent trip-loss path** post FINAL-3.

---

## Part H — Trip-loss invariants (FINAL-3.1 / 3.2 + scale)

| # | Invariant | Status |
|---|-----------|--------|
| 1 | One physical drive → one canonical trip | **PASS** — `repairTripBoundariesWithAudit` |
| 2 | Delayed detection may reduce freshness, not permanent prefix/suffix loss | **PASS** — reconciliation + boundary extend |
| 3 | Reconciliation repairs missed live detection | **PASS** |
| 4 | Boundary repair preserves tripId | **PASS** — PG integration |
| 5 | Boundary repair triggers full downstream recompute | **PASS** |
| 6 | boundaryRefresh cannot complete before mandatory stages | **PASS** — lifecycle service |
| 7 | Stale ENQUEUED recovers safely | **PASS** — lease/stale 15min |
| 8 | Completed generations never re-run | **PASS** — generation gate |
| 9 | Duplicate scheduler/worker idempotent | **PASS** |
| 10 | Provider slowdown → backlog, not silent loss | **PASS** — modeled + tested |

Scale/backpressure tests: `p12-final5-production-scale-gate.spec.ts` (recovery batch, COMPLETED no-op, backlog ≠ loss).

---

## Part I — PostgreSQL / Redis proof

| Proof | Status |
|-------|--------|
| Boundary repair PG integration | **EXECUTED** — CI job `Backend boundary repair PostgreSQL tests` 5/5 |
| Concurrent boundary repair | **EXECUTED** — rollback + completion tests in CI |
| Queue lifecycle persistence | **UNIT** — boundary-repair.state.util.spec |
| Recovery query ordering | **UNIT** — findRecoverableTrips batch 20 |
| Redis jobId dedup | **NOT EXECUTED** — no Redis integration harness for BullMQ |
| Global semaphore | N/A — not implemented |

---

## Part J — Observability gap matrix

| Metric | Status |
|--------|--------|
| `synqdrive_dimo_snapshot_poll_total` | **AVAILABLE** |
| Queue lag (observeQueueLag) | **PARTIAL** — per-job, not dashboarded by default |
| DIMO requests/min (global) | **MISSING** |
| DIMO concurrent in-flight | **MISSING** |
| 429/min, timeout/min, 5xx/min | **MISSING** (except recharge errors in logs) |
| DIMO latency histogram | **MISSING** |
| Queue depth by queue | **MISSING** (BullMQ not exported) |
| Oldest job age | **MISSING** |
| Snapshot tier counts | **PARTIAL** — debug logs only |
| Reconciliation cohort size | **PARTIAL** — debug log post FINAL-4 |
| boundaryRefresh pending/enqueued/completed | **PARTIAL** — DB JSON, no Prometheus |
| Per-org backlog | **MISSING** |

**Mandatory for N≈1000 merge:** global DIMO req/min, in-flight gauge, 429 counter, queue depth + oldest age per `dimo.snapshot.poll` and `dimo.trip-tracking`.

---

## Part K — Merge decision matrix

| Item | Current state | Required current prod | Required N=1000 | Blocker? |
|------|---------------|----------------------|-----------------|----------|
| P1.2 trip correctness | FINAL-3 complete | Yes | Yes | **No** |
| Activity tiers | Implemented | Yes | Yes | **No** |
| Snapshot throughput | Default c=5 | OK for N≤~100 | c≈51–189 | **Yes** for N=1000 |
| WORKER_SNAPSHOT_CONCURRENCY | Env wired | Tune per fleet | Must set + prove | **Yes** without provider proof |
| Global DIMO semaphore | Missing | No (1 replica) | **Yes** | **Yes** for N=1000 |
| Scheduler leader election | Missing | No (1 replica) | Before 2+ replicas | **No** now / **Yes** scale-out |
| Fast cohort | FINAL-4 fixed | Yes | Yes | **No** |
| Recovery bounds | batch 20 | Yes | Yes | **No** |
| PostgreSQL proof | CI green | Yes | Yes | **No** |
| Redis proof | Not executed | Nice | Nice | **No** |
| Observability | Gaps | Partial OK | **Mandatory** | **Yes** for N=1000 |
| Rollback | Documented | Yes | Yes | **No** |

---

## Part L — Decision rule evaluation

| Criterion | Met? |
|-----------|------|
| No proven trip-loss path | ✅ |
| No fragmentation path | ✅ |
| boundaryRefresh lifecycle correct | ✅ |
| Recovery bounded + starvation-safe | ✅ |
| Current topology safe with explicit config | ✅ for N≲100; ❌ for N=1000 at defaults |
| No uncontrolled provider fan-out | ❌ at N=1000 target (unknown provider ceiling) |
| Required env documented | ✅ (this doc + `.env.example`) |
| CI fully green | ✅ 25/25 |
| Rollback documented | ✅ |

**Verdict: DO NOT MERGE PR #1409**

Rationale: Production scale target N≈1000 cannot be certified. Default configuration is throughput-negative by ~339 jobs/min backlog growth. Required snapshot concurrency (~51–189) exceeds certifiable provider budget (**PROVIDER LIMIT UNKNOWN**). Global DIMO semaphore and scale observability are hard prerequisites for N=1000, not optional polish.

**Current 1-replica production** at smaller fleet (N≲100 with tuned env) could merge after explicit ops sign-off — but PR gate scope includes N=1000 certification.

---

## Part M — Changes in FINAL-5

| File | Change |
|------|--------|
| `p12-final5-workload-model.ts` | Deterministic workload/concurrency matrix |
| `p12-final5-production-scale-gate.spec.ts` | Scale gate tests |
| This document | Authoritative audit record |

No production code semantics changed. No default concurrency changed.

---

## Production env recommendations

### Current 1-replica prod (N≲250)

```bash
WORKER_SNAPSHOT_CONCURRENCY=13        # S1 N=250 P50 8s (round up)
WORKER_TRIP_TRACKING_CONCURRENCY=10   # headroom for ACTIVE_TICK
WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK=0  # unlimited; set 200 if tick duration spikes
WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN=0
DIMO_REQUEST_TIMEOUT_MS=10000
```

### N=1000 target (do not deploy without P1.3)

```bash
WORKER_SNAPSHOT_CONCURRENCY=61        # S1 +20% headroom @ P50 8s — REQUIRES provider quota proof
WORKER_TRIP_TRACKING_CONCURRENCY=25
WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK=500
WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN=300
# PLUS: global DIMO semaphore (P1.3), observability counters, leader election before 2nd replica
```

---

## Rollback procedure

1. Deploy previous release via `vps-deploy-release.sh` (prior `main` SHA).
2. Or set `WORKER_SNAPSHOT_LEGACY_FIXED_CADENCE=true` + `TRIP_PARTIAL_BOUNDARY_REPAIR_ENABLED=false` without code revert.
3. PM2: `pm2 restart synqdrive --update-env`.
4. Verify `/api/v1/health` and snapshot poll metrics.

---

## Remaining risks

1. **PROVIDER LIMIT UNKNOWN** — cannot certify 51–189 concurrent telemetry calls.
2. Snapshot backlog at default c=5 degrades live freshness before reconcile catches up.
3. Multi-replica deploy without leader election duplicates reconciliation provider load.
4. Energy events recharge path may still 422 in production (separate regression, pre-existing).
5. Observability blind spots prevent ops detection of provider saturation.

---

## Changes / Architektur

- **Changes:** FINAL-5 entry in `ChangesView.tsx`
- **Architektur:** FINAL-5 section in `ArchitekturView.tsx` + this document

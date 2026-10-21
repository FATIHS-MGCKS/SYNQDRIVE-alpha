# P1.2 FINAL-4 — Scale / Concurrency Production Closeout

**Date:** 2026-08-29  
**PR:** #1409  
**Builds on:** FINAL-3.2 boundary refresh completion (`416700e2d`)  
**Verdict:** **DO NOT MERGE** — operational scale prerequisites + P1.3 global DIMO semaphore / scheduler leader election remain before production N≈1000

---

## 1. Production execution graph

```
DimoSnapshotScheduler (@Interval 30s)
  → tier-gated vehicle selection (CONNECTED + tokenId)
  → interleaveByOrganization (fairness)
  → BullMQ dimo.snapshot.poll [jobId=snapshot-{vehicleId}]
        ↓
DimoSnapshotProcessor (concurrency=WORKER_SNAPSHOT_CONCURRENCY, default 5)
  → DimoTelemetryService GraphQL (axios timeout DIMO_REQUEST_TIMEOUT_MS)
  → VehicleLatestState upsert
  → TripDetectionOrchestrationService (active tick / possible start)
        ↓
TripReconciliationScheduler (fast 15m / warm 4h / cold daily)
  → TripReconciliationService.reconcileWindow (inline, serial per vehicle)
    1. repairStaleOngoingTrips
    2. retryPendingBoundaryRefreshes → findRecoverableTrips (batch 20)
    3. detectAndRepairMissingTrips (DIMO segments when fallback)
    4. repairMissingEnds
    5. repairIntraTripGapSplits (max 6 splits/trip)
    6. energyEventsService.detectEnergyEvents
    7. tripAssociation.reconcileUnresolvedWindow
        ↓
Boundary repair (FINAL-3.1/3.2)
  → repairTripBoundariesWithAudit (PG transaction + optimistic lock)
  → finalizeBoundaryRepairRefresh → refreshEnrichmentAfterBoundaryRepair
        ↓
TripEnrichmentOrchestrator
  → route/safety enrichment (sync)
  → BullMQ trip.behavior.enrichment [jobId=hf-enrich-{tripId}]
  → BullMQ trip.driving-impact.compute [jobId=driving-impact-{tripId}]
        ↓
TripAnalysisCoordinator.markStage
  → BoundaryRefreshLifecycleService.tryMarkCompleted
  → boundaryRefresh=COMPLETED (generation-gated)
```

**Concurrency boundaries:** BullMQ worker concurrency, serial scheduler loops, `jobId` dedup, optimistic DB `updateMany`, boundary refresh lease/stale, recovery batch cap.

**Not in graph:** global DIMO semaphore, scheduler leader election, per-vehicle reconciliation Redis mutex.

---

## 2. Snapshot concurrency model

| Control | Value | Source |
|---------|-------|--------|
| Scheduler tick | 30s | Hardcoded `@Interval(30000)` |
| Worker concurrency | **ENV** `WORKER_SNAPSHOT_CONCURRENCY` (default 5, max 200) | `@Processor` — **wired FINAL-4** |
| Per-tick enqueue cap | **ENV** `WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK` (0=unlimited) | Scheduler — **wired FINAL-4** |
| jobId dedup | `snapshot-{vehicleId}` | Redis/BullMQ |
| Tier gating | Activity tiers | `deriveSnapshotPollingTier` |
| Org fairness | Round-robin | `interleaveByOrganization` |

**N=1000 steady-state (mixed 5/15/60/20):** ~376.7 enqueues/min (simulation).  
**Consumer at c=5, 8s avg:** ~37.5 jobs/min → **throughput-negative at default concurrency**.

**Required concurrency (P50 8s):** ~51 — must be set via env for N≈1000.

---

## 3. DIMO semaphore proof

**Finding:** No global/distributed DIMO semaphore exists (P1.3+ scope per parent architecture).

**What bounds provider HTTP today (process-local):**

| Path | Bound |
|------|-------|
| `dimo.snapshot.poll` | `WORKER_SNAPSHOT_CONCURRENCY` per worker process |
| `dimo.trip-tracking` | `WORKER_TRIP_TRACKING_CONCURRENCY` per process — **wired FINAL-4** |
| `dtc.poll`, `dimo.vehicle.sync` | Default BullMQ concurrency 1 |
| Reconciliation DIMO segments | Serial per vehicle inside scheduler loop |
| Axios | `DIMO_REQUEST_TIMEOUT_MS` (default 10s) per request |

**Consequence:** Multiple queues + multiple PM2 instances can multiply provider concurrency beyond any single worker setting. Permits are implicit (BullMQ active jobs), released on success/failure/timeout via job completion.

**No bypass** of snapshot worker for reconciliation segment fetches — separate code path, serial per vehicle.

---

## 4. Fast-cohort fairness proof

### Before FINAL-4

Fast repair used `lastSeenAt OR providerFetchedAt` within 1h. LONG_IDLE polls every 30min → **~100% of CONNECTED fleet** eligible every 15min (~4000 reconcile calls/hr at N=1000).

### After FINAL-4

`buildFastReconciliationWhere()`:

- `lastSeenAt >= threshold`
- OR `tripDetectionState.lastActivityAt >= threshold`
- OR active FSM states (`POSSIBLE_START`, `ACTIVE_TRIP`, `IDLE_WITHIN_TRIP`, `POSSIBLE_END`)
- **`providerFetchedAt` excluded**

Optional cap: `WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN` (0=unlimited).

**Modeled N=1000 fast cohort:** ~200 vehicles (~20%), ~800 reconcile calls/hr (vs 4000).

**Fairness invariants:**

1. Snapshot enqueue: org round-robin prevents tenant monopolization
2. Fast reconciliation: activity-based, not poll-timestamp-based
3. Warm/cold tiers cover full token cohort on slower cadence
4. LONG_IDLE vehicles do not consume 15min fast-pass capacity

---

## 5. Fan-out bounds

| Source | Max batch | Max concurrency | Retry | Idempotency |
|--------|-----------|-----------------|-------|-------------|
| Snapshot enqueue/tick | Optional cap env | Serial loop | jobId skip if active | `snapshot-{vehicleId}` |
| Snapshot worker | 1 job/worker slot | ENV concurrency | BullMQ 3× exp 5s | jobId |
| Fast reconciliation | Optional vehicle cap | Serial | N/A | reconcileWindow idempotent |
| Warm/cold reconciliation | All tokens | Serial | N/A | tier windows |
| `findRecoverableTrips` | 20/trip state query | 2 parallel Prisma queries | lease/stale/backoff | generation |
| Behavior enrichment | 1 trip/job | Default 1 | 3× exp 10s | `hf-enrich-{tripId}` |
| Driving impact | 1 trip/job | Default 1 | global default | `driving-impact-{tripId}` |
| Resume backfill | All CONNECTED | Serial | guarded `backfillInProgress` | reconcile per vehicle |

**No** `Promise.all(allVehicles)` or `Promise.all(allTrips)` in P1.2 hot paths.

---

## 6. Recovery-query scale analysis

`findRecoverableTrips(vehicleId)`:

- Two JSON-path queries: `boundaryRefresh.state IN (PENDING, ENQUEUED)`, `take: 20` each
- Filter: `isBoundaryRefreshRetryable()` (lease, stale, backoff)
- Sort: `requestedAt`, merge dedupe, `slice(0, 20)`
- **Not O(history)** — does not scan arbitrary completed trips

**COMPLETED** excluded by query + retry filter. **Stale ENQUEUED** recoverable after 15min. **Generation mismatch** blocks completion callbacks.

JSON-path on `rawDetectionMeta` acceptable at current scale; dedicated index deferred until evidence of slow queries.

---

## 7. Redis / multi-instance safety

| Mechanism | Scope | Purpose |
|-----------|-------|---------|
| BullMQ `jobId` | Distributed (Redis) | Snapshot/trip job dedup |
| `RedisDistributedLockService` | Distributed | Used elsewhere; **not** trip reconciliation |
| Optimistic `updateMany` | Database | Boundary repair correctness authority |
| Boundary refresh lease | Durable JSON | Per-trip duplicate refresh guard |

**Multi-instance:** Every PM2 replica runs `@Interval` schedulers → duplicate snapshot enqueue attempts (mostly deduped by jobId) and duplicate reconciliation (serial duplicate work, not unbounded fan-out).

**Redis is not required for boundary correctness** — optimistic DB guard + generation gating are authoritative.

---

## 8. BullMQ backpressure

Global defaults (`app.module.ts`): `attempts: 3`, exponential backoff 5s, `removeOnComplete`/`removeOnFail` retention.

Snapshot jobs: `removeOnComplete: true`, `removeOnFail: { count: 50, age: 3600 }`.

Enrichment: per-job `attempts: 3`, backoff 10s, deterministic `jobId`.

**Backpressure signal:** queue depth grows when consumer throughput < enqueue rate (observable via existing `observeQueueLag` / Prometheus).

---

## 9. Failure / chaos tests (FINAL-4)

`p12-final4-scale-closeout.spec.ts` — concurrency env clamping, N=100/1000 load bounds, fast cohort bounds, recovery batch, COMPLETED no-op ×10, org interleave.

Existing: `fast-reconciliation-cohort.spec.ts`, `snapshot-throughput-capacity.spec.ts`, FINAL-3.1/3.2 boundary suites.

---

## 10. Scale fixes implemented (FINAL-4)

| Fix | Rationale |
|-----|-----------|
| Wire `WORKER_SNAPSHOT_CONCURRENCY` | Env documented but unwired — proven config gap |
| Wire `WORKER_TRIP_TRACKING_CONCURRENCY` | Same |
| Fast cohort activity-based query | Proven ~100% fleet fan-out bug |
| Optional `WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK` | Safety valve for tick duration |
| Optional `WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN` | Per-run fan-out cap |
| Recovery observability log | `recoverable=N` debug line |
| CI PostgreSQL boundary suite | Authoritative DB proof |

**Not implemented (deferred):** global DIMO semaphore, scheduler leader election, per-vehicle Redis mutex, dedicated recovery worker.

---

## 11. Configuration classification

| Setting | Class |
|---------|-------|
| `WORKER_SNAPSHOT_CONCURRENCY` | ENV (default 5, max 200) |
| `WORKER_SNAPSHOT_MAX_ENQUEUE_PER_TICK` | ENV (default 0) |
| `WORKER_TRIP_TRACKING_CONCURRENCY` | ENV (default 5, max 200) |
| `WORKER_FAST_RECONCILIATION_RECENCY_MS` | ENV (default 1h) |
| `WORKER_FAST_RECONCILIATION_MAX_VEHICLES_PER_RUN` | ENV (default 0) |
| Snapshot scheduler interval | HARDCODED 30s |
| Recovery batch size | HARDCODED 20 |
| Lease/stale/backoff | HARDCODED (FINAL-3.2) |
| Tier intervals | ENV via tier config |

Invalid env values fall back to safe defaults (no NaN/0 concurrency).

---

## 12. Observability

Existing: `TripMetricsService` (repair actions, queue lag, snapshot health), scheduler debug logs (tier counts, enqueue cap deferred), boundary recovery debug log.

---

## 13. Scale test results (deterministic)

| Fleet | Modeled enqueue/min | Fast cohort (post-FINAL-4) | Default consumer cap (c=5, 8s) |
|-------|---------------------|------------------------------|--------------------------------|
| 100 | ~37.7 | ~20 | ~37.5 (marginal) |
| 1000 | ~376.7 | ~200 | ~37.5 (throughput-negative) |

**Methodology:** `simulate-snapshot-polling-load.ts` steady-state tier model + `estimateFastReconciliationCohortSize()`.

---

## 14. FINAL-3.1 / 3.2 regression

All boundary suites pass (65+ in P1.2 scale pattern). Atomicity, COMPLETED lifecycle, generation safety, stale recovery, starvation fix — intact.

---

## 15. PostgreSQL suite

**CI:** `Backend boundary repair PostgreSQL tests` job in Vehicle Detail workflow.  
**Local:** `npm run test:boundary-repair:postgres` with `DATABASE_URL`.

---

## Migrations / rollback

**None.** Rollback: revert deploy; fast cohort reverts to broader eligibility; concurrency falls back to defaults.

---

## Changes / Architektur

- **Changes:** This document + PR #1409 FINAL-4 commit
- **Architektur:** Parent `SNAPSHOT_ACTIVITY_TIER_POLLING_P1_2_2026-08-29.md` updated

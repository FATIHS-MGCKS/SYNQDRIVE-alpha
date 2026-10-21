# P1.2 FINAL-3.2 — Boundary Refresh Completion + Durable Recovery Closeout

**Date:** 2026-08-29  
**PR:** #1409  
**Builds on:** FINAL-3.1 boundary atomicity  
**Verdict:** **DO NOT MERGE** — awaiting human review and **P1.2 FINAL-4 scale closeout**

---

## A. Problem (before FINAL-3.2)

`rawDetectionMeta.boundaryRefresh` reached `ENQUEUED` but never `COMPLETED`.

`isBoundaryRefreshPending()` treated **PENDING OR ENQUEUED** as retryable, so reconciliation could re-run full downstream refresh (route, behavior, driving impact, analysis) on every tick for already-successful repairs.

Recovery used `vehicleTrip.findMany({ take: 50 })` on completed trips and filtered in memory — starvation risk at scale.

---

## B. State machine (after FINAL-3.2)

```
PENDING
  → (enqueue succeeds) → ENQUEUED [leaseUntil set]
  → (enqueue fails)    → PENDING [retryAfter backoff]

ENQUEUED
  → (mandatory stages terminal + generation match) → COMPLETED
  → (lease active)                                   → no duplicate enqueue
  → (lease expired + stale)                          → safe re-enqueue

COMPLETED
  → never retry for same generation
```

| State | Meaning |
|-------|---------|
| `PENDING` | Boundary committed; refresh not yet accepted by queue/worker |
| `ENQUEUED` | Refresh accepted; mandatory downstream stages not yet terminal |
| `COMPLETED` | Route + behavior + driving impact reached canonical post-repair state |

---

## C. COMPLETED contract (mandatory stages)

Completion requires **all** of:

1. **Route** — `VehicleTripWaypoint` refresh via `TripsService.enrichTrip` / `runRouteSafetyEnrichment`
2. **Behavior** — `TripBehaviorEvent` replace-by-trip via behavior enrichment
3. **Driving impact** — `TripDrivingImpact` upsert via `DrivingImpactService.computeForTrip`

**Non-blocking (documented):**

- Misuse aggregation (`analysisStages.misuse`) — async enrichment
- Post-finalize analysis (`postFinalizeAnalysisProducer`) — optional when wired
- Energy/fuel derived state — post-finalize pipeline; not boundary-gating

**Failure semantics:** If route, behavior, or driving impact stage is `failed`, `COMPLETED` is **not** set. Recovery remains on `ENQUEUED`/`PENDING` per lease/backoff.

**Completion trigger:** `TripAnalysisCoordinator.markStage()` → `BoundaryRefreshLifecycleService.onAnalysisStageUpdated()` → `tryMarkCompleted()` when stages are terminal and `generation` matches active `boundaryRepair`.

**No early completion:** `COMPLETED` is never set at enqueue time. Worker crash mid-refresh leaves `ENQUEUED` recoverable after stale threshold.

---

## D. Repair generation / version safety

Deterministic fingerprint:

```
generation = auditId | providerSegmentId | newStartISO | newEndISO
```

Stored on:

- `rawDetectionMeta.boundaryRefresh.generation`
- `rawDetectionMeta.boundaryRepair` (auditId + boundaries)
- `TripRepair.detectorEvidence.boundaryRepairGeneration`

`boundaryRefreshGenerationMatchesRepair()` gates stage progress and `COMPLETED`. Stale worker callbacks for an older generation cannot complete a newer repair.

---

## E. ENQUEUED lease + stale retry policy

| Field | Purpose |
|-------|---------|
| `leaseUntil` | 5 min — block duplicate enqueue while worker may run |
| `lastProgressAt` / `enqueuedAt` | Stale detection anchor |
| `retryAfter` | PENDING exponential backoff (30s base, 30m max) |
| `attempts`, `lastError`, `lastAttemptAt` | Observability + poison-trip bounds |

**ENQUEUED stale:** 15 min without progress → `isBoundaryRefreshRetryable()` true → recovery may re-enqueue.

**PENDING:** retry when `retryAfter` elapsed (exponential backoff on failed enqueue).

---

## F. Starvation-safe recovery query

`BoundaryRefreshLifecycleService.findRecoverableTrips(vehicleId)`:

- Two indexed JSON-path queries: `boundaryRefresh.state = PENDING` and `= ENQUEUED`
- Filter with `isBoundaryRefreshRetryable()` (lease/stale/backoff)
- Sort by `requestedAt`, batch `BOUNDARY_REFRESH_RECOVERY_BATCH_SIZE` (20)
- No arbitrary `take: 50` scan of all completed trips

Reconciliation step 2 calls this before missing-trip detection — targeted recovery only.

**Scale note:** Dedicated recovery scheduler deferred to FINAL-4; this slice removes O(history) full scan.

---

## G. TripRepair status semantics

| Status | Meaning |
|--------|---------|
| `BOUNDARY_APPLIED` | Boundary mutation committed; downstream may be pending |
| `APPLIED` | **Queue accepted** — not full lifecycle complete |
| Full lifecycle complete | `boundaryRefresh.state = COMPLETED` |

`detectorEvidence.boundaryRefreshState` mirrors sub-state for audit.

---

## H. Files changed

| File | Role |
|------|------|
| `boundary-repair.state.util.ts` | Generation, lease, stale, backoff, stage contract |
| `boundary-refresh-lifecycle.service.ts` | Persist, recover, complete, audit sync |
| `trip-reconciliation.service.ts` | Recovery query, finalize enqueue, no 50-trip scan |
| `trip-analysis-coordinator.service.ts` | Stage → boundary completion hooks |
| `trip-enrichment-orchestrator.service.ts` | Lifecycle reset on refresh |
| `trip-decision.engine.ts` | Generation on initial PENDING |
| `reconciliation.types.ts` | APPLIED semantics documented |
| `vehicle-intelligence.module.ts` | Provider registration |
| Tests: `final31`, `final32`, `state.util`, `postgres.integration` | |

**Migrations:** None — state remains in `rawDetectionMeta` JSON.

**Rollback:** Revert deploy; `COMPLETED` records are forward-compatible; older code may re-enqueue until generation/lease logic restored.

---

## I. Tests

| Suite | Count | Notes |
|-------|-------|-------|
| `boundary-repair.state.util.spec.ts` | unit | lease, stale, backoff, generation |
| `partial-boundary-repair.final31.spec.ts` | integration (Map) | atomicity + retry with backoff |
| `partial-boundary-repair.final32.spec.ts` | lifecycle | no early COMPLETED, generation mismatch, 10× no-op, crash recovery |
| `boundary-repair.postgres.integration.spec.ts` | PG (gated) | atomic commit, rollback, concurrency, persist, completion |

**PostgreSQL:** Run with `BOUNDARY_REPAIR_POSTGRES_INTEGRATION=1` and `DATABASE_URL`. Cloud Agent / default CI: **skipped** (no DATABASE_URL) — not claimed as DB-backed proof in CI.

---

## J. Remaining limitations (FINAL-4 scope)

- Global DIMO semaphore, snapshot concurrency, fast cohort, polling cadence, scheduler leader election, Redis mutex — **unchanged**
- Per-vehicle recovery still invoked from reconciliation entry (bounded query, not full scan)
- Optional analysis/energy not gated on COMPLETED
- No dedicated background recovery worker yet

---

## Changes / Architektur

- **Changes:** This document + PR #1409 FINAL-3.2 commit
- **Architektur:** Boundary refresh lifecycle, completion contract, recovery query — documented here; parent `SNAPSHOT_ACTIVITY_TIER_POLLING_P1_2_2026-08-29.md` references FINAL-3.2

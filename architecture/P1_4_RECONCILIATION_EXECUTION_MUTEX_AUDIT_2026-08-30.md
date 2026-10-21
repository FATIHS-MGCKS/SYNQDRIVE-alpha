# P1.4 — Reconciliation Execution Mutex — Phase 0 Audit

**Date:** 2026-08-30  
**Baseline:** `origin/main` after P1.7 (#1430) merge  
**Scope:** Trip/snapshot reconciliation execution safety under multi-replica operation

---

## Executive summary

P1.7 prevents duplicate **scheduler producer** ticks across replicas. P1.4 closes the remaining gap: **concurrent reconciliation execution** for the same vehicle when multiple triggers overlap (scheduled tiers, manual API, snapshot resume backfill, stuck-trip recovery, anomaly events).

The canonical mutation owner is **`TripReconciliationService`**. All tiered/manual/event paths converge on `reconcileWindow()` except `onStuckTrip()` which previously called `repairMissingEnds()` directly — now mutex-gated under the same per-vehicle key.

---

## Call graph (trip reconciliation)

```
TRIGGER
  ├─ TripReconciliationScheduler (fast/warm/cold) — P1.7 leader-gated
  ├─ TripTrackingRecoveryScheduler (onStuckTrip / onAnomalyDetected)
  ├─ DimoSnapshotScheduler.runResumeBackfill → triggerManualReconciliation
  ├─ POST /vehicles/:id/trips/reconcile (manual API)
  └─ scripts/ops/repair-vehicle-trips-from-dimo.ts (ops)

→ TripReconciliationService.reconcileWindow / onStuckTrip
→ ReconciliationExecutionMutexService.execute (P1.4)
→ executeReconcileWindow / repairMissingEnds
  ├─ TripDecisionEngine (all trip mutations)
  ├─ BoundaryRefreshLifecycleService
  ├─ EnergyEventsService.detectEnergyEvents
  ├─ EventTripAssociationService.reconcileUnresolvedWindow
  └─ downstream: TripPostFinalizeAnalysisProducer, TripEnrichmentOrchestrator
```

---

## Inventory

### RECONCILIATION_ENTRYPOINTS

| Path | Type | Mutex required |
|------|------|----------------|
| `trip-reconciliation.scheduler.ts` fast/warm/cold | Scheduled (leader-gated) | YES |
| `trip-tracking-recovery.scheduler.ts` onStuckTrip | Event | YES |
| `trip-tracking-recovery.scheduler.ts` onAnomalyDetected | Event | YES |
| `dimo-snapshot.scheduler.ts` resume backfill | Bootstrap | YES |
| `vehicle-intelligence.controller.ts` POST reconcile | Manual API | YES |
| `repair-vehicle-trips-from-dimo.ts` | Ops script | YES |

### DIRECT_EXECUTION_PATHS

Trip reconciliation executes **inline** in the API/worker process — no dedicated `trip-reconciliation` BullMQ queue. `onStuckTrip` previously bypassed `reconcileWindow`; fixed in P1.4.

### QUEUED_EXECUTION_PATHS

Downstream only (post-repair): `TripPostFinalizeAnalysisProducer`, `TripEnrichmentOrchestrator`, `TRIP_TRACKING` recovery re-enqueue. Mutex wraps mutation boundary before enqueue.

### RETRY_PATHS

Scheduled tiers retry on next tick. Mutex contention returns `skipped: true` / `skipReason: LOCKED` — no BullMQ retry storm.

### MANUAL_ADMIN_PATHS

`POST …/trips/reconcile` → `triggerManualReconciliation` → `reconcileWindow`.

### CURRENT_LOCKING (pre-P1.4)

| Mechanism | Scope | Gap |
|-----------|-------|-----|
| P1.7 scheduler leader | Singleton schedulers | Does not serialize manual/API/event overlap |
| Optimistic DB `updateMany` in TripDecisionEngine | Per-trip row | Race before write, duplicate downstream enqueue |
| Deterministic `trip_repairs` audit PK | Per repair proposal | Does not prevent concurrent execution |
| Battery V2 vehicle lock | Battery jobs only | N/A to trip reconcile |

### CURRENT_IDEMPOTENCY

- `buildRepairAuditId()` deterministic SHA256 → `trip_repairs` PK
- Boundary refresh generation matching
- BullMQ `jobId: trip-recovery-${vehicleId}` for tracking recovery
- Post-finalize producer deterministic job IDs (preserved)

### CURRENT_OVERLAP_RISK (pre-P1.4)

**HIGH** for same vehicle: fast tier + manual API + onStuckTrip + snapshot resume could run concurrently on different replicas after P1.7 leader election (leader schedules, but API/events/workers on any replica).

---

## Out-of-scope reconciliation domains

Billing, payment connect, driving analysis, battery V2, device connection episode, IAM drift — separate subsystems with existing locks/idempotency. P1.4 targets **trip boundary reconciliation** identified as the P1.2/P1.3 scale blocker.

---

## Mutex design decision

### MUTEX_SCOPE

Per **organization + vehicle + reconciliation type (`trip`)**.

Time window is **not** part of the key — overlapping windows mutate the same canonical trip rows.

### MUTEX_KEY

`synqdrive:reconciliation:lock:{organizationId}:{vehicleId}:trip`

### WHY_THIS_SCOPE

Minimum isolation preventing conflicting trip mutations while preserving parallelism across unrelated vehicles.

### SAFE_PARALLELISM_ALLOWED

Different vehicles (even same org) reconcile concurrently.

---

## P1.7 boundary (unchanged)

| P1.7 | P1.4 |
|------|------|
| One active scheduler producer | One active reconciliation execution per vehicle |
| Leader election Redis lease | Per-vehicle execution mutex |
| BullMQ workers multi-replica | BullMQ workers remain multi-replica |

---

## Changes / Architektur

Updated in implementation PR.

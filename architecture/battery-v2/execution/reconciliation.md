# Battery V2 — Reconciliation

**Epistemic status:** CONFIRMED (Stage 1 paths verified in code)

## Service

`BatteryV2ReconciliationService.reconcileAll()` — scheduler-driven cadence (not faster-than-reconciliation polling for orphan checks).

## Categories (seeded)

| Method | Purpose |
|--------|---------|
| `reconcileMissingLvRestSessions` | Scan COMPLETED trips without canonical session → direct arming → recovery enqueue fallback |
| `reconcileLvRestWindowTargets` | Schedule/rescue REST_60M/6H targets for LV sessions |
| `reconcileLegacyRestTargets` | Bridge `battery_features` when canonical session exists |
| `reconcileMissingObservations` | Stale observation classify |
| `reconcileTripStarts` | Start proxy |
| `reconcilePendingAssessments` | Assessment recompute |
| capability refresh | periodic / signal loss |

## REST target rescue paths

1. `PENDING_EVALUATION` → reschedule (`isLvRestTargetAwaitingReconciliationReschedule`)
2. `ENQUEUED` + DLQ → clear DLQ → `PENDING_EVALUATION` → reschedule
3. `ENQUEUED` + no live Bull job + no DLQ → `PENDING_EVALUATION` → reschedule (`resolveEnqueuedRestTargetForReconciliation`)

## Explicitly removed

- Bulk `clearReplayableDeadLetters()` before reconcile (#1445)
- Historical `repairLvRestWindowTripBindings()` scan (#1445)

## Graph nodes

- `BAT-V2-LIVE-SESSION-RECON-001`
- `BAT-V2-LIVE-ORPHAN-ENQ-001`
- `BAT-V2-LIVE-PEND-EVAL-001`

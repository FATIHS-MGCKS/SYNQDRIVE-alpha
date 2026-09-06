# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

## R2 — Lifecycle Commit & Orphan Recovery Invariants

| Field | Value |
|-------|-------|
| Baseline application SHA | `8ddf73e562cc5fbe2e88056836bfd0b7ca493411` (main with R1 merged) |
| R1 final closure SHA | `782f7c2b9340cfcb2a6159bd04c9711536f588dd` |
| Branch | `trip-fsm/r2-lifecycle-invariants` |
| Deploy | **NOT PERFORMED** |
| Production mutations | **NONE** |

## Summary

R2 closes the lifecycle/FSM divergence class identified in P4-F06, P4-F10, P3-F06, and P5-F05 by introducing a pure lifecycle invariant planner, idempotent recovery execution, and scheduler/orchestration preflight hooks — without changing detection thresholds, R1 clock semantics, polling, CUSUM, or mid-gap split policy.

## Changed files

| File | Role |
|------|------|
| `trip-lifecycle-invariant.ts` | Pure invariant matrix + planner |
| `trip-lifecycle-invariant.spec.ts` | Matrix unit tests |
| `trip-lifecycle-recovery.service.ts` | Read/plan/execute recovery (FSM via orchestration) |
| `trip-lifecycle-recovery.spec.ts` | Crash-injection + negative tests |
| `trip-detection-orchestration.service.ts` | Preflight hooks + `executeLifecycleRecoveryAction` |
| `trip-tracking-recovery.scheduler.ts` | Inline recovery before stale re-enqueue |
| `trip-metrics.service.ts` | Minimal R2 divergence/recovery counters |
| `vehicle-intelligence.module.ts` | Service registration |

## Lifecycle commit windows (post-R1 audit)

| Path | First durable commit | Second durable commit | Crash window | Orphan state | Pre-R2 recovery | Post-R2 recovery |
|------|---------------------|----------------------|--------------|--------------|-----------------|------------------|
| A — Start | `createTrip()` ONGOING | `transitionState(ACTIVE_TRIP)` | between 1→2 | ONGOING + POSSIBLE_START | re-enqueue PS → duplicate create risk | adopt proven ONGOING before create |
| B — Merge | `reopenTripForMerge()` ONGOING | `transitionState(ACTIVE_TRIP)` | between 1→2 | ONGOING + POSSIBLE_START | same as A | adopt merge target trip |
| C — Finalize | `finalizeTrip()` COMPLETED | `transitionState(RESTING)` | between 1→2 | COMPLETED + active FSM | re-enqueue end path | RESET_TO_RESTING without re-finalize |
| D — Discard | `discardTrip()` CANCELLED | `transitionState(RESTING)` | between 1→2 | CANCELLED + active FSM | same as C | RESET_TO_RESTING with discard reason |
| E — Mid-gap split | `splitTripAtGap()` tx | `transitionState(ACTIVE_TRIP, trip2)` | between 1→2 | trip1 COMPLETED + trip2 ONGOING + FSM→trip1 | reconciliation only | REPOINT_ACTIVE_TRIP when `splitFrom` proven |

Replay idempotency: recovery actions are FSM-only and keyed on durable trip fingerprints; repeated evaluation on healthy state is a no-op.

## Invariant matrix

| Class | Condition | Action |
|-------|-----------|--------|
| HEALTHY-1 | RESTING + 0 ONGOING | none |
| HEALTHY-2 | POSSIBLE_START + 0 ONGOING | none |
| HEALTHY-3 | ACTIVE/IDLE/PE + 1 ONGOING + matching pointer | none |
| RECOVERABLE-START-ORPHAN | POSSIBLE_START + 1 provably matching ONGOING | ADOPT_ONGOING |
| RECOVERABLE-MERGE-ORPHAN | POSSIBLE_START + merge target ONGOING | ADOPT_ONGOING |
| RECOVERABLE-END-ORPHAN | active FSM + referenced trip terminal | RESET_TO_RESTING |
| RECOVERABLE-MISSING-POINTER | ACTIVE/IDLE/PE + null pointer + 1 provable ONGOING | ADOPT_ONGOING |
| RECOVERABLE-SPLIT-REPOINT | FSM→completed trip1 + ONGOING trip2 with `splitFrom=trip1` | REPOINT_ACTIVE_TRIP |
| CONFLICT-MULTIPLE-ONGOING | >1 ONGOING | fail closed |
| CONFLICT-MISMATCH | unrelated ONGOING vs candidate | fail closed |
| CONFLICT-AMBIGUOUS | cannot prove relationship | fail closed |

Total invariant classes: **11**

Automatic recovery classes: **5** — `ADOPT_ONGOING`, `RESET_TO_RESTING`, `REPOINT_ACTIVE_TRIP` (+ start/merge/missing-pointer/split variants)

Fail-closed conflict classes: **3** — `CONFLICT_MULTIPLE_ONGOING`, `CONFLICT_MISMATCH`, `CONFLICT_AMBIGUOUS`

## Authority preservation

| Layer | Owner | R2 behavior |
|-------|-------|-------------|
| Canonical trip lifecycle | `TripDecisionEngine` | unchanged — recovery never re-finalizes or creates trips |
| FSM state | `TripDetectionOrchestrationService` | recovery executes via `executeLifecycleRecoveryAction` |
| Reconciliation | `TripReconciliationService` | unchanged — not a second lifecycle truth engine |
| Planner | `evaluateTripLifecycleInvariant()` | read-only |

## Concurrency model

- Per-vehicle worker lock retained for orchestration paths
- Recovery preflight runs under existing lock in orchestration handlers
- Scheduler recovery runs only when worker lock expired (same as stale recovery)
- No new distributed locking framework
- Start create idempotency: durable proof via `dimoSegmentId` (`v2-{vehicleId}-{startMs}`) and exact `startTime` match; global `@unique` on `dimoSegmentId` already prevents duplicate row with same synthetic id

## ONGOING uniqueness decision

**Decision: DEFERRED (APP_ENFORCED recovery + existing dimoSegmentId uniqueness)**

Preflight query against production was **not available** in this environment (read-only prod DB access unavailable). A partial unique index `UNIQUE(vehicle_id) WHERE trip_status='ONGOING'` was **not** added without verified zero-duplicate production state.

Application-layer invariant recovery + deterministic start fingerprints provide race mitigation; full P4-F10 closure requires future verified DB constraint deployment.

## Production duplicate preflight

**Status: UNKNOWN** — no production/VPS read-only query executed.

## Crash-injection tests

Covered in `trip-lifecycle-recovery.spec.ts` and `trip-lifecycle-invariant.spec.ts`:

1. Start orphan adopt
2. Double recovery idempotency
3. Merge orphan adopt
4. Finalize→RESTING orphan
5. Discard→RESTING orphan
6. Healthy active state no-op
7. Missing pointer adopt (invariant spec)
8. Terminal trip RESTING recovery
9. Multiple ONGOING conflict
10. Mismatched pointer conflict
11. Negative: unrelated ONGOING not adopted (R2.15)
12. Scheduler integration hook added (inline recovery before enqueue)
13. R1 clock contract tests remain green (144 targeted tests)
14. Profile lifecycle regressions preserved via existing `trip-detection.spec.ts`

## Findings status

| ID | Status | Notes |
|----|--------|-------|
| P4-F06 | RESOLVED_BY_R2 | Start orphan adopt before duplicate create |
| P4-F10 | PARTIALLY_RESOLVED | App recovery + dimoSegmentId uniqueness; DB partial unique index deferred pending prod preflight |
| P3-F06 | RESOLVED_BY_R2 | FSM/trip divergence detectable + recoverable |
| P5-F05 | RESOLVED_BY_R2 | COMPLETED/CANCELLED→RESTING recovery without re-finalize |
| P5-F04 | UNCHANGED | Mid-gap post-split fallthrough not redesigned (R6 scope); split repoint only when provably linked |

## Known remaining risks

- Concurrent duplicate ONGOING rows remain theoretically possible without verified DB partial unique index
- Ambiguous/conflict states require manual reconciliation — recovery fails closed by design
- Production duplicate ONGOING inventory not verified in this run

## Validation

- Targeted tests: **144 passed**
- Backend build/typecheck: **PASS**
- Prisma validate: **PASS** (no schema change)
- `git diff --check`: **PASS**
- Deploy: **NOT PERFORMED**

---

## R2A — Closure Corrections

| Field | Value |
|-------|-------|
| R2 base commit | `67a8f53dc2989c309a960957553ff258133a0e0d` |
| Scope | lifecycle recovery durability + scheduler safety |
| Deploy | **NOT PERFORMED** |

### Durable start episode identity

`VehicleTrip.rawDetectionMeta.lifecycleRecovery.startEpisode` persisted atomically in `createTrip()`:

- `candidateStartAt` — FSM POSSIBLE_START episode anchor (may differ from canonical boundary)
- `effectiveStartAt` — canonical `trip.startTime` after boundary refinement
- `episodeId` — `${vehicleId}:${candidateStartAtMs}`
- `dimoSegmentId` — optional secondary fingerprint

Recovery proof matches on **candidate episode identity**, not broad time tolerance.

### Merge replay identity

`reopenTripForMerge()` persists `lifecycleRecovery.mergeReopen` with `candidateStartAt` (+ optional `effectiveStartAt`, `reopenedAt`). Merge orphan recovery no longer requires in-memory `mergeTargetTripId`.

### Worker-lock model

Scheduler **only enqueues** tracking jobs. Lifecycle FSM recovery executes inside orchestration handlers **after** `acquireWorkerLock()`. No scheduler-side FSM mutation.

### Scheduler residual-state filtering

- Fail-closed classifications (`CONFLICT_*`) skip enqueue **and** event reconciliation for that vehicle
- Recoverable orphans enqueue normal triggers (POSSIBLE_START / ACTIVE_TICK / PEC)
- Logging reports actual enqueued vs blocked counts

### Start clock preservation

`executeLifecycleRecoveryAction(ADOPT_ONGOING)` sets:

- `possibleStartAt` = canonical recovered `trip.startTime` (or preserved FSM anchor for missing-pointer)
- `possibleStartEnteredAt` = null
- does **not** call `clearPossibleStartClockFields()`

### Split recovery decision

**Option A — EXACT_STATE_RECOVERY:** shared `buildMidGapSplitActiveFsmExtras()` used by live mid-gap split and `REPOINT_ACTIVE_TRIP` recovery.

### Final finding status (post-R2A)

| ID | Status |
|----|--------|
| P4-F06 | RESOLVED_BY_R2 |
| P4-F10 | PARTIALLY_RESOLVED |
| P3-F06 | RESOLVED_BY_R2 |
| P5-F05 | RESOLVED_BY_R2 |
| P5-F04 | UNCHANGED |

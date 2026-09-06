# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

## R6 — Mid-Gap Split Safety & Control Flow

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Branch | `trip-fsm/r6-mid-gap-split-safety` |
| Baseline main | `4cd02d7f8b2814c1c5dc773d206f295f94169cf4` |
| R5 prerequisite | PR #1543 merged (R5/R5A/R5B end validation semantics) |
| Scope | P5-F04, P5-F09 |
| Deploy | NOT PERFORMED |
| Production mutations | NONE |

---

## R6.1 — Current live mid-gap graph (pre-change)

```
ACTIVE_TICK
  → findMidTripGap(corePoints, det)
  → gap >= 180s + stopped/moving semantics + trip age >= 60s
  → computeMidGapPositionDrift()  [OLD: null drift allowed split]
  → optional seg1 waypoint persistence
  → splitTripAtGap()  [TRANSACTION: trip1 COMPLETED, trip2 ONGOING, reparent]
  → transitionState(ACTIVE_TRIP, trip2)
  → postFinalize trip1 + enrichment (non-transactional)
  → scheduleActiveTick
  → return

catch (any throw in split block)
  → log "split failed"
  → fall through to remaining ACTIVE_TICK using local tripId (= trip1)  [BUG P5-F04]
```

**Transactional vs non-transactional**

| Step | Transactional |
|------|---------------|
| seg1 waypoint createMany (pre-split) | No |
| splitTripAtGap | Yes (internal `$transaction` or caller `tx`) |
| FSM transitionState | No |
| postFinalize / enrichment | No |
| scheduleActiveTick | No |

---

## R6.1 — Reconciliation mid-gap graph (unchanged)

```
TripReconciliationService.repairIntraTripGapSplits
  → findWaypointGapForSplit (persisted waypoints only)
  → drift computed from adjacent waypoints (always numeric when candidate exists)
  → deterministic repair id + PG advisory lock
  → applyIntraTripGapSplitRepairAtomically(tx):
       splitTripAtGap(..., tx)
       finalizeRepairedTrip(trip2, ..., tx)
       TripRepair APPLIED
  → commit
```

Reconciliation already requires actual waypoint positions; unknown drift cannot produce a candidate.

---

## R6.2–R6.4 — Drift evidence contract

Module: `trip-mid-gap-split.util.ts`

| State | Meaning | Live split |
|-------|---------|------------|
| `WITHIN_THRESHOLD` | pre+post positions known, drift ≤ 200m | may proceed |
| `EXCEEDS_THRESHOLD` | positions known, drift > 200m | reject |
| `UNKNOWN` | missing pre/post, non-finite drift | reject (fail-closed) |

Removed semantic: `drift == null → allow split`.

Numeric contract unchanged:

- `TRIP_MID_GAP_SPLIT_MS` = 180_000
- `TRIP_MID_GAP_MAX_STATIONARY_DRIFT_M` = 200
- `TRIP_MID_GAP_MIN_PRE_DURATION_MS` = 60_000
- >5 km/h post-gap motion checks unchanged

Live drift resolution: persisted waypoints first; current route batch fallback only when timestamp-bounded pre/post coordinates are unambiguous.

---

## R6.5–R6.7 — Pre-commit vs post-commit boundary

Typed phase: `MidGapSplitCommitPhase = 'PRE_COMMIT' | 'POST_COMMIT'`

| Phase | On failure |
|-------|------------|
| `PRE_COMMIT` (before/at splitTripAtGap throw) | safe fallthrough on original tripId |
| `POST_COMMIT` (after splitTripAtGap resolves) | abort tick immediately; schedule ACTIVE_TICK; **never** old-trip fallthrough |

Post-commit failures (FSM repoint, scheduleActiveTick, downstream throws) terminate the tick without `vehicleTrip.update` on trip1.

---

## R6.8–R6.9 — R2 RECOVERABLE_SPLIT_REPOINT integration

When split commits but FSM repoint fails:

- DB state: trip1 COMPLETED, trip2 ONGOING, `trip2.rawDetectionMeta.splitFrom = trip1.id`
- FSM may still point at trip1
- Next ACTIVE_TICK runs `maybeRecoverLifecycleInvariant()` first
- R2 invariant: `RECOVERABLE_SPLIT_REPOINT` → `REPOINT_ACTIVE_TRIP` to trip2

No parallel recovery mechanism added.

---

## R6.11 — Success path (preserved)

trip1: COMPLETED, `MID_TRIP_GAP_SPLIT`, MEDIUM, `splitDriftM` in rawDetectionMeta when known

trip2: ONGOING, `splitFrom = trip1`, FSM repointed, end-cycle fields cleared, one successor ACTIVE_TICK

---

## R6.16 — Split forensics

Rejected candidates logged via `buildMidGapRejectedForensics()` in ACTIVE_TICK resultSummary:

- `decision: REJECTED`, `reason: unknown_drift | excessive_drift`
- `driftState`, `driftM`, `maxAllowedDriftM`, gap timestamps

Applied splits logged via `buildMidGapAppliedForensics()` with `firstTripId`, `secondTripId`, `triggeredBy: LIVE_FSM`.

---

## Files changed

| File | Role |
|------|------|
| `trip-mid-gap-split.util.ts` | Drift contract + forensics helpers |
| `trip-mid-gap-split.util.spec.ts` | Drift matrix unit tests |
| `trip-mid-gap-split-r6.spec.ts` | Live control-flow + R2 repoint tests |
| `trip-detection-orchestration.service.ts` | Live split gate + commit boundary |
| `decision.types.ts` / `trip-decision.engine.ts` | Optional `splitDriftM` persistence |

---

## Crash / failure matrix

| # | Scenario | Result |
|---|----------|--------|
| 1 | splitTripAtGap throws pre-commit | safe fallthrough on trip1 |
| 2 | split commits, transitionState throws | no old-trip writes; schedule ACTIVE_TICK |
| 3 | scenario 2 + next tick | R2 RECOVERABLE_SPLIT_REPOINT |
| 4–6 | post-commit ancillary failures | no old-trip writes |
| 7 | normal success | trip1 COMPLETED + trip2 ONGOING + FSM trip2 |
| 10–11 | UNKNOWN / excessive drift | no lifecycle mutation |
| 12 | reconciliation | preserved (waypoint scanner unchanged) |

Quality gate: **240 passed** (14 suites in R6 gate run), build PASS, Prisma validate PASS.

---

## Finding status

| ID | Status |
|----|--------|
| P5-F04 | RESOLVED_BY_R6 — post-commit failures cannot fall through to old tripId processing |
| P5-F09 | RESOLVED_BY_R6 — UNKNOWN live drift fail-closed; null drift no longer allows split |
| P5-F10 | PARTIALLY_RESOLVED_BY_R5 (unchanged) |

---

## Behavior deltas

| Area | Before | After |
|------|--------|-------|
| Missing GPS drift | null → allow split | UNKNOWN → reject live split |
| Post-commit catch | fall through with trip1 | abort tick + schedule recovery |
| Drift contract | boolean/null | WITHIN / EXCEEDS / UNKNOWN |
| Applied split meta | no driftM on live trip1 | splitDriftM when known |

---

## R6A — Live Split Commit-Ambiguity Closure

| Field | Value |
|-------|-------|
| Scope | P5-F04 closure — promise rejection ≠ rollback proof |
| Module | `trip-mid-gap-split-commit.util.ts` |

### Promise outcome vs durable commit outcome

`splitTripAtGap()` sequence:

1. `prisma.$transaction(runSplit)` — durable lifecycle mutation
2. post-transaction diagnostic logging
3. return result

The caller previously set `splitCommitPhase = POST_COMMIT` only after the full promise resolved. A rejected promise with local `PRE_COMMIT` did **not** prove the transaction rolled back — post-commit logger failures (or client ambiguity after server commit) could leave trip1 COMPLETED + trip2 ONGOING while the catch block fell through to old-trip ACTIVE_TICK writes.

### Durable classifier: NOT_COMMITTED / COMMITTED_LINKED / AMBIGUOUS

On `splitTripAtGap()` error while local phase is `PRE_COMMIT`, orchestration calls `readDurableLiveSplitOutcome()` before deciding fallthrough safety.

| Outcome | Durable proof | Behavior |
|---------|---------------|----------|
| `NOT_COMMITTED` | trip1 `ONGOING`, trip1 is the sole vehicle `ONGOING` row, no linked continuation | safe pre-commit fallthrough on trip1 |
| `COMMITTED_LINKED` | trip1 `COMPLETED` + matching `endTime`, exactly one vehicle `ONGOING` trip, `splitFrom === trip1.id`, `startTime === expectedSecondStartAt`, optional `LIVE_FSM` trigger meta | same as POST_COMMIT failure: no old-trip writes, schedule ACTIVE_TICK, return |
| `AMBIGUOUS` | any other combination, DB read failure, multiple/unrelated `ONGOING` rows, originalTrip missing from ongoing set, splitFrom/startTime mismatch | fail closed: no fallthrough, schedule recovery wake, return |

Reuses R2 invariant model (`RECOVERABLE_SPLIT_REPOINT` proof: terminal trip1 + exactly one ONGOING trip2 with `splitFrom`) extended with expected `secondStartAt` for live episode binding.

### Fail-closed ambiguity rule

Only positive `NOT_COMMITTED` proof may preserve original-trip fallthrough. All other rejected-promise paths abort the tick without `vehicleTrip.update`, waypoint continuation on trip1, or continuity processing on trip1.

### DecisionEngine post-commit diagnostic containment

`TripDecisionEngine.splitTripAtGap()` wraps post-transaction `logger.log` in try/catch so diagnostic failure cannot reject a successfully committed split. Transaction failures still propagate.

### Regression tests (R6A)

- Committed-but-rejected promise + durable `COMMITTED_LINKED` → no fallthrough
- True rollback `NOT_COMMITTED` → safe fallthrough preserved
- Ambiguity matrix A–F → fail closed
- Logger throws after successful `$transaction` → split still resolves
- Next tick R2 `RECOVERABLE_SPLIT_REPOINT` → trip2, no duplicate split call when recovery short-circuits tick

### Finding status (post-R6A)

| ID | Status |
|----|--------|
| P5-F04 | **RESOLVED_BY_R6** — post-commit failures, committed-but-rejected promises, and ambiguous durable outcomes cannot fall through; only proven `NOT_COMMITTED` allows old-trip continuation |
| P5-F09 | **RESOLVED_BY_R6** (unchanged) |
| P5-F10 | PARTIALLY_RESOLVED_BY_R5 (unchanged) |

### Files added/changed (R6A)

| File | Role |
|------|------|
| `trip-mid-gap-split-commit.util.ts` | Durable outcome classifier + read helper |
| `trip-mid-gap-split-commit.util.spec.ts` | Classifier matrix unit tests |
| `trip-mid-gap-split-r6a.spec.ts` | Orchestration commit-ambiguity tests |
| `trip-detection-orchestration.service.ts` | PRE_COMMIT catch durable reread |
| `trip-decision.engine.ts` | Non-poisoning post-commit logger |
| `trip-decision.engine.split-r6a.spec.ts` | Logger failure regression |

---

## R6B — Strict NOT_COMMITTED Proof Closure

| Field | Value |
|-------|-------|
| Scope | P5-F04 — positive rollback proof only when trip1 is sole ONGOING row |
| Module | `trip-mid-gap-split-commit.util.ts` |

### Defect closed

R6A `NOT_COMMITTED` previously required only `trip1 ONGOING` + absence of `splitFrom` link. That incorrectly allowed old-trip fallthrough when another unrelated `ONGOING` trip existed for the same vehicle.

### Strict NOT_COMMITTED proof (all required)

1. `originalTrip` exists
2. `originalTrip.tripStatus === ONGOING`
3. no linked continuation (`splitFrom === originalTripId`)
4. exactly one `ONGOING` trip for the vehicle
5. that sole `ONGOING` trip id === `originalTripId`

### AMBIGUOUS includes

- multiple `ONGOING` trips (including unrelated second row)
- `originalTrip` says `ONGOING` but missing from `ongoingTrips` set (empty or unrelated-only)
- linked continuation present while trip1 still `ONGOING`
- any durable read inconsistency

### R2 invariant alignment

Vehicle lifecycle target is ≤1 canonical `ONGOING` trip per vehicle. `NOT_COMMITTED` is positive proof only when the original trip is that sole row. Duplicate/unrelated `ONGOING` rows are conflicts — fail closed here; R2/recovery owns reconciliation.

`COMMITTED_LINKED`, DecisionEngine logger containment, drift thresholds, reconciliation, and R1–R5 semantics unchanged.

### Finding status (post-R6B)

| ID | Status |
|----|--------|
| P5-F04 | **RESOLVED_BY_R6** — unrelated duplicate ONGOING rows cannot grant NOT_COMMITTED fallthrough |
| P5-F09 | **RESOLVED_BY_R6** (unchanged) |

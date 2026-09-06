# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

## R7 — Terminal Lifecycle → RESTING Recovery Hardening

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Branch | `trip-fsm/r7-terminal-resting-recovery` |
| Baseline main | `de402f7c9b2cccd4706ae30af70bd6347a8730a0` |
| R6 prerequisite | PR #1546 merged (R6/R6A/R6B mid-gap split safety) |
| Scope | P5-F05, INV-08 |
| Deploy | NOT PERFORMED |
| Production mutations | NONE |

---

## R7.1 — Current FINALIZE graph (pre-R7)

```
FINALIZE job
  → acquire worker lock
  → get detection state
  → maybeRecoverLifecycleInvariant()
  → read active trip
  → compute end boundary / quality
  → either:
       A. discardTrip() → trip CANCELLED
       B. finalizeTrip() → trip COMPLETED
  → metrics / forensic logging
  → postFinalize analysis (awaited on COMPLETED path)
  → enrichment enqueue (fire-and-forget)
  → transitionState(RESTING)
  → Battery LV rest enqueue (failure-contained)
  → tracking log
  → release lock

catch(err)
  → log FINALIZE error
  → (pre-R7) no immediate deterministic terminal-orphan recovery enqueue
```

**Asynchronous safety net (unchanged):**

`TripTrackingRecoveryScheduler` every 120s → `classifyDetectionState()` → `RECOVERABLE_END_ORPHAN` → `enqueue_only` → worker executes `RESET_TO_RESTING`.

R7 does **not** replace R2 or the 120s scheduler. R7 adds the immediate first-line recovery wake.

---

## R7.2–R7.3 — Terminal lifecycle commit boundary

Local state inside `processFinalize` (no schema):

| Field | Values |
|-------|--------|
| `terminalLifecycleCommit` | `NONE` \| `COMPLETED` \| `CANCELLED` |
| `terminalTripId` | trip id after successful terminal mutation |
| `restingTransitionSucceeded` | `true` after `transitionState(RESTING)` resolves |

Set `terminalLifecycleCommit` only **after** `finalizeTrip()` or `discardTrip()` successfully resolves.

**Critical rule:** terminal lifecycle committed + RESTING transition not completed + FINALIZE exits via error → deterministic recovery wake **must** be attempted.

---

## R7.4–R7.6 — Immediate recovery wake

On qualifying failure, orchestration calls existing `scheduleFinalize()` → stable FINALIZE queue (`trip-fin-{vehicleId}-{activeTripId}`) with R3 successor-slot semantics via `enqueueStableTripTrackingJob`.

Applies to **any** error after terminal commit and before `restingTransitionSucceeded`, not only `transitionState` throws:

- metrics / timeline
- postFinalize analysis producer
- unexpected exceptions

---

## R7.7 — Post-RESTING failures

Once `transitionState(RESTING)` succeeds, `restingTransitionSucceeded = true`. Later ancillary failures (Battery LV enqueue, tracking log) do **not** schedule terminal-orphan recovery.

---

## R7.8 — Recovery enqueue failure

Enqueue failure is logged clearly. Terminal trip is not reverted/reopened. Periodic `TripTrackingRecoveryScheduler` remains second-line safety net.

---

## R7.9–R7.10 — R2 integration (not duplicated)

Recovery FINALIZE job starts with `maybeRecoverLifecycleInvariant()`:

- FSM active + `activeTripId` → terminal trip COMPLETED/CANCELLED + `ongoingCount === 0`
- → `RECOVERABLE_END_ORPHAN` → `RESET_TO_RESTING` via existing `executeLifecycleRecoveryAction()`
- **No second** `finalizeTrip` / `discardTrip`

Unrelated ONGOING conflict → `NO_SAFE_REPAIR` fail-closed (preserved).

---

## R7.11–R7.12 — REST anchor and CANCELLED symmetry

`RESET_TO_RESTING` preserves R2 rest anchor: `COMPLETED.endTime` for `lastActivityAt` (R1 event-time). CANCELLED uses existing `discard` resting reason.

Terminal commit recovery covers both `COMPLETED` and `CANCELLED` when RESTING transition fails.

---

## R7.16 — Crash injection matrix

| # | Scenario | Expected |
|---|----------|----------|
| 1 | `finalizeTrip` throws pre-commit | no recovery FINALIZE |
| 2 | COMPLETED + RESTING throws | immediate `scheduleFinalize` |
| 3 | COMPLETED + post-terminal/pre-RESTING throws | recovery scheduled |
| 4 | RESTING succeeds + later log throws | no recovery |
| 5 | CANCELLED + RESTING throws | recovery scheduled |
| 6 | recovery enqueue throws | terminal preserved; periodic fallback |
| 7 | recovery FINALIZE on orphan | RESET_TO_RESTING; no re-finalize |
| 8 | healthy post-RESTING FINALIZE | no duplicate mutation |
| 9 | unrelated ONGOING conflict | fail closed |
| 10 | 120s scheduler | preserved (R2B tests) |

---

## Finding status

| ID | Status |
|----|--------|
| P5-F05 | **RESOLVED_BY_R2_R7** — R2 provides `RECOVERABLE_END_ORPHAN` classifier/action; R7 adds deterministic immediate FINALIZE recovery wake after terminal commit without RESTING |
| INV-08 | **CLOSED** — immediate recovery + periodic scheduler fallback both proven |

Historical: before R2 P5-F05 was OPEN; after R2 recovery path present at scheduler level only.

---

## Files changed

| File | Role |
|------|------|
| `trip-detection.types.ts` | `TerminalLifecycleCommit` type |
| `trip-detection-orchestration.service.ts` | Terminal commit tracking + recovery wake |
| `trip-terminal-resting-recovery-r7.spec.ts` | Crash matrix + R2 contract tests |

Future canonical target: `architecture/trip-fsm/` (not created in R7).

# IMPLEMENTATION ARTIFACT — PRE-CANONICAL

## R5 — End Anchor, Metadata Reset & Attempt Accounting

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Branch | `trip-fsm/r5-end-validation-semantics` |
| Baseline main | `eb51d8f807347514e7499dec5986b745ec1dc134` |
| R4 prerequisite | PR #1542 merged (`fix(trip-fsm): align start detection phase contracts (R4)`) |
| Scope | P5-F03, P5-F11, P5-F13, partial P5-F10 |
| Deploy | NOT PERFORMED |
| Production mutations | NONE |

---

## R5.1 — Pre-change PEC/EV lifecycle (documented)

### Flow

```
ACTIVE / IDLE_WITHIN_TRIP
  → continuity / empty-core / CH assist
  → POSSIBLE_END

POSSIBLE_END_CHECK (PEC):
  Step 1 — resume check (recent core fetch + EndContinuityDetector)
  Step 2 — hard 30min FSM dwell timeout → finalize
  Step 3 — stability gate (90s dwell + 120s physical inactivity, or 30s CH assist)
  Step 4 — schedule END_VALIDATION
  Step 5 — max attempts → fallback finalize

END_VALIDATION (EV):
  CH skip-CUSUM path OR
  fetchEndValidationWindow → ChangePointEndDetector →
    ongoing / confirmed / inconclusive / throw
```

### Old attempt semantics (incorrect)

`endValidationAttempts` was incremented in **PEC Step 4 when scheduling** END_VALIDATION:

```
PEC: attempts=0 → write attempts=1 → schedule EV
EV fetch throws → attempts remains 1 (counts as "used" without completed cycle)
```

This made the counter a **scheduled validation jobs** counter, not **completed CUSUM cycles**.

### Old empty-core vs fetch-throw distinction

| Condition | Old behavior |
|-----------|--------------|
| Successful `corePoints.length === 0` | Could enter POSSIBLE_END from 120s inactivity anchor alone |
| Provider fetch THROW | ACTIVE_TICK catch → reschedule (safe) |

These were separate paths but empty-core was semantically overstated as inactivity proof.

---

## R5.2 — Shared POSSIBLE_END → ACTIVE reset contract

New module: `trip-end-cycle-reset.ts`

`buildPossibleEndToActiveReset()` used from:

- PEC activity-resumed path
- EV CUSUM-ongoing reopen path
- `cancelPossibleEndForResumedActivity()` (CH resume)

Clears:

- `possibleEndAt`, `possibleEndEnteredAt`
- `endDetectionMode`, `endConfidence`
- `endValidationAttempts` → 0
- all CUSUM fields
- strips transient end-cycle keys from `lastEvidenceSummary`

Preserves start/lifecycle evidence keys.

---

## R5.3 — CUSUM movement EVENT_TIME validation

`validateCusumMovementEventTime()` uses existing `isValidProviderEventTimestamp()`.

Invalid Date or beyond R1 future skew → not written to `lastMeaningfulMovementAt`.

---

## R5.4–R5.5 — Completed CUSUM cycle semantics

| Event | Counter change |
|-------|----------------|
| PEC schedules EV | unchanged |
| EV begins (startedAt forensic) | unchanged |
| Successful CUSUM evaluation (confirmed / inconclusive / ongoing) | `completedAttempt = persisted + 1` |
| CUSUM ongoing reopen | logged completedAttempt; persisted reset to 0 |
| Fetch error | unchanged |
| Detector/runtime error | unchanged |
| CH skip-CUSUM | unchanged |

Forensic timestamps:

- PEC: `endValidationScheduledAt`
- EV start: `endValidationStartedAt`
- EV completion: `endValidationCompletedAt`, `completedEndValidationAttempt`

---

## R5.7–R5.9 — Max-attempt fallback

Max fallback only when `endValidationAttempts >= 3` (**completed** cycles).

Fallback forensics:

- `endDetectionMode = COMPOSITE_INACTIVITY`
- `endConfidence = LOW`
- `maxAttemptFallbackReason = max_completed_cusum_attempts`
- never `CUSUM_VALIDATED`

Hard 30min timeout remains separate (`hard_timeout_fallback`).

---

## R5.8 — Resume fetch error at max attempts

Resume check outcomes: `RESUMED | NO_RESUME_EVIDENCE | FETCH_ERROR`

`FETCH_ERROR`:

- does not proceed to max-attempt fallback
- reschedules PEC
- hard timeout still applies separately

---

## R5.10–R5.13 — Successful empty-core gate

Module: `trip-empty-core-end-gate.ts`

Requires ALL:

1. operational inactivity ≥ 120s (existing threshold)
2. VLS explicitly inactive via `isCurrentTelemetryInactive()`
3. no performance activity via `evaluatePerformanceActivity()`
4. no route motion above profile `speedMotionKmh`

Missing/ambiguous VLS → KEEP_OPEN (fail-safe).

Fetch throw path unchanged — never coerced to empty core.

---

## R5.14 — CH end assist

Unchanged thresholds and semantics. CH skip-CUSUM does not increment completed-cycle counter.

---

## Files changed

| File | Role |
|------|------|
| `trip-end-cycle-reset.ts` | Shared reopen/reset + movement validation + forensic builders |
| `trip-empty-core-end-gate.ts` | Empty-core corroboration contract |
| `trip-detection-orchestration.service.ts` | PEC/EV/ACTIVE_TICK semantics |
| `trip-end-cycle-reset.spec.ts` | Helper unit tests |
| `trip-empty-core-end-gate.spec.ts` | Gate unit tests |
| `trip-end-validation-r5.spec.ts` | Orchestration regressions |

---

## Test matrix (mandatory coverage)

| # | Scenario | Status |
|---|----------|--------|
| 1–3 | Shared reopen reset parity | covered |
| 4–6 | Movement EVENT_TIME validation | covered |
| 7 | PEC schedule without increment | covered |
| 8–10 | Completed cycle increment / ongoing reset | covered |
| 11–13 | Fetch/detector/CH skip do not consume attempt | covered |
| 14–17 | Max-attempt fallback forensics | covered |
| 16 | Resume fetch error blocks max fallback | covered |
| 18–22 | Empty-core gate | covered (unit + gate) |
| 23 | Fetch throw ≠ empty core | covered |
| 24–25 | CH paths preserved | covered |
| 26 | Hard timeout unchanged | preserved by code review |
| 27–31 | R1/R2/R3/R4 regression suites | green in quality gate run |

Quality gate: **282 passed** (24 suites), build/typecheck PASS, Prisma validate PASS.

---

## Finding status

| ID | Status |
|----|--------|
| P5-F03 | RESOLVED_BY_R5 |
| P5-F11 | RESOLVED_BY_R5 |
| P5-F13 | RESOLVED_BY_R5 |
| P5-F10 | PARTIALLY_RESOLVED_BY_R5 — max-attempt fallback still finalizes without positive CUSUM confirmation; counter and forensics now truthful |

---

## Behavior deltas summary

| Area | Before | After |
|------|--------|-------|
| Attempt counter | incremented on schedule | incremented on completed CUSUM cycle |
| CUSUM ongoing reopen | stale endDetectionMode/confidence | full shared reset |
| Max fallback | ambiguous CUSUM-like finalize | LOW + explicit fallback reason |
| Empty core | inactivity anchor alone | multi-signal corroboration required |
| Resume fetch error at max | could fall through to finalize | reschedule PEC |

---

## R5A — Detector Failure, VLS Evidence & Forensic Persistence Closure

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Parent commit | `7ffb63c20b55964b7d70a22cd35103ba986dc710` |
| Scope | R5A.1–R5A.15 closure gaps |

### R5A.1–R5A.2 — Production detector failure semantics

Production `DetectorRegistry.runAll()` catches detector exceptions/timeouts and returns:

```json
{
  "detectorName": "ChangePointEndDetector",
  "verdict": "INCONCLUSIVE",
  "confidence": "LOW",
  "evidence": { "error": "<message>" }
}
```

New module: `trip-end-validation-classifier.ts`

| Outcome | Condition | Attempt counter |
|---------|-----------|-----------------|
| `VALID_DECISION` | TRIGGERED / NOT_TRIGGERED / analytical INCONCLUSIVE without `evidence.error` | may increment on completed cycle |
| `DETECTOR_EXECUTION_FAILURE` | non-empty `finding.evidence.error` | unchanged |
| `DETECTOR_MISSING` | no ChangePointEndDetector finding | unchanged |

On failure/missing: reschedule PEC, no `completedAt`, explicit failure forensics.

### R5A.3 — Completed CUSUM cycle definition (corrected)

`endValidationAttempts` = **completed CUSUM validation cycles** only.

Legitimate analytical INCONCLUSIVE (e.g. `reason: insufficient_points`, `threshold_not_crossed`) still counts as one completed cycle when bounded input was fetched and detector returned a valid analytical result.

### R5A.4–R5A.7 — Explicit VLS inactivity tri-state (empty-core gate only)

Module: `trip-empty-core-end-gate.ts` — `classifyEmptyCoreVlsInactivity()`

| State | Meaning |
|-------|---------|
| `ACTIVE` | measured speed > `speedMotionKmh`, or contradictory active evidence (e.g. meaningful engine load) |
| `INACTIVE` | measured speed ≤ `speedMotionKmh`, fresh provider observation, no contradictory active evidence |
| `UNKNOWN` | missing row, missing speed, missing/invalid/stale `sourceTimestamp`, all-null telemetry |

**Provider EVENT_TIME authority:** uses `VehicleLatestState.sourceTimestamp` validated via R1 `isValidProviderEventTimestamp()`. Does **not** use DB `updatedAt`.

**Freshness bound:** `TRIP_END_MIN_INACTIVITY_BEFORE_CUSUM_MS` (120s) — reuses existing end-detection safety window.

`isCurrentTelemetryInactive()` unchanged globally (CH end assist preserved).

Successful empty core → POSSIBLE_END only when ALL true:

1. operational inactivity ≥ 120s
2. VLS evidence = INACTIVE
3. VLS provider EVENT_TIME valid/current
4. performance activity = false
5. route motion above profile = false
6. CH end assist did not already handle

Any UNKNOWN VLS → KEEP_OPEN + schedule ACTIVE_TICK.

### R5A.9 — Truthful validation clocks

| Field | When written |
|-------|--------------|
| `endValidationStartedAt` | WORKER_TIME immediately before bounded CUSUM fetch/detector work |
| `endValidationCompletedAt` | fresh WORKER_TIME only after valid analytical decision |

Fetch failure or detector execution failure: `startedAt` may exist, `completedAt` MUST NOT.

Valid INCONCLUSIVE/confirmed: `completedAt >= startedAt`.

### R5A.10 — Same-episode provenance preservation

`stripEndCycleTransientEvidence()` now only runs on POSSIBLE_END → ACTIVE reopen (`END_CYCLE_REOPEN_STRIP_KEYS`).

Within same end episode, preserve: `endCandidateClockSource`, `noCoreEmptyCoreForensics`, `emptyCoreDecision`, `emptyCoreReason` while updating attempt timestamps.

### R5A.11 — Durable finalized trip forensics

`TripDecisionEngine.finalizeTrip` persists bounded R5 evidence into `VehicleTrip.rawDetectionMeta` before RESTING clears FSM `lastEvidenceSummary`:

```typescript
endValidation: {
  endCandidateClockSource, scheduledAt, startedAt, completedAt,
  completedAttempt, completedAttemptCount, maxAttemptFallbackReason, resumeCheckOutcome
}
emptyCoreEndGate: {
  decision, reason, operationalInactiveMs, vlsEvidenceState,
  vlsProviderObservedAt, vlsObservationAgeMs, performanceActivity, routeMotion
}
```

### R5A.12 — Max-attempt fallback (unchanged semantics)

`endValidationAttempts >= 3` completed cycles → fallback may finalize with `endDetectionMode: COMPOSITE_INACTIVITY`, `endConfidence: LOW`, `reason: max_completed_cusum_attempts`. Never `CUSUM_VALIDATED`.

### R5A.13 — CH / hard timeout non-regression

CH HIGH/MEDIUM gates, 30min hard timeout, CUSUM thresholds, retry intervals unchanged.

### R5A files added/changed

| File | Role |
|------|------|
| `trip-end-validation-classifier.ts` | END_VALIDATION outcome classification |
| `trip-end-validation-classifier.spec.ts` | Classifier unit tests |
| `detector.registry.end-validation.spec.ts` | Real registry throw → INCONCLUSIVE + error |
| `trip-empty-core-end-gate.ts` | VLS tri-state + provider freshness |
| `trip-end-cycle-reset.ts` | Clock/provenance/persistence helpers |
| `trip-end-validation-r5a.spec.ts` | R5A orchestration closure tests |
| `trip-detection-orchestration.service.ts` | Classifier wiring + finalize persistence |

### R5A test matrix

Quality gate: **305 passed** (24 suites), build PASS, Prisma validate PASS (schema).

All 31 mandatory R5A scenarios covered across classifier, registry, gate, reset, and orchestration specs.

### R5A finding status

| ID | Status |
|----|--------|
| P5-F03 | RESOLVED_BY_R5 |
| P5-F11 | RESOLVED_BY_R5 — production registry error sentinels no longer consume attempts |
| P5-F13 | RESOLVED_BY_R5 — empty-core requires explicit provider-event-time-valid VLS inactivity |
| P5-F10 | PARTIALLY_RESOLVED_BY_R5 — max-attempt fallback still exists without positive CUSUM confirmation |

---

## R5B — Validation Attempt Forensic Isolation Closure

| Field | Value |
|-------|-------|
| Date | 2026-09-06 |
| Parent commit | `80f222ec26b9eb5f84cae6e169ee1aa273c1db07` |
| Scope | R5B.1–R5B.14 attempt-local forensic isolation |

### Same end episode vs validation attempt

**End-episode provenance** (survives retries within POSSIBLE_END):

- `endCandidateClockSource`, `noCoreEmptyCoreForensics`, `emptyCoreDecision`, `emptyCoreReason`
- start/lifecycle evidence unrelated to end validation

**Attempt-local fields** (cleared between validation attempts):

- `endValidationScheduledAt`, `endValidationStartedAt`, `endValidationCompletedAt`
- `endValidationFailureReason`, `endValidationFailureOutcome`, `endValidationFetchFailureReason`
- `completedEndValidationAttempt`

Helper: `clearEndValidationAttemptLocalEvidence()` — dedicated to attempt isolation; NOT used for ACTIVE reopen (broader `stripEndCycleEvidenceForActiveReopen()` unchanged).

### Scheduling / start / failure / success contracts

| Phase | Behavior |
|-------|----------|
| PEC schedules EV | clear attempt-local → write new `endValidationScheduledAt`; `endValidationAttempts` unchanged |
| EV starts | clear stale attempt-local (preserve current scheduledAt) → write fresh `endValidationStartedAt`; no completedAt/failure/completedAttempt |
| Detector/fetch failure | clear stale attempt-local → write failure fields; no completedAt/completedAttempt |
| Valid analytical decision | clear stale failure fields → write started/completed/completedAttempt consistently |

### Authoritative completed-cycle count

`VehicleTripDetectionState.endValidationAttempts` is authoritative for total completed CUSUM cycles.

`extractR5EndForensicsForPersistence(summary, completedAttemptCount)` persists:

- `completedAttemptCount` from detection state (not stale JSON)
- latest attempt fields (scheduled/started/completed/failure) from summary only when present

Example: 2 completed cycles + latest detector failure → `completedAttemptCount: 2`, `failureOutcome` present, `completedAt` absent.

### Temporal regression (Attempt1 success → Attempt2 failure)

Attempt 1 INCONCLUSIVE writes startedAt1 + completedAt1 + `completedEndValidationAttempt: 1`.

Attempt 2 PEC schedule clears attempt 1 runtime timestamps; EV2 failure writes startedAt2 without completedAt.

Invariant: failed attempt never inherits prior `completedAt`.

### R5B finding status

| ID | Status |
|----|--------|
| P5-F03 | RESOLVED_BY_R5 |
| P5-F11 | RESOLVED_BY_R5 |
| P5-F13 | RESOLVED_BY_R5 |
| P5-F10 | PARTIALLY_RESOLVED_BY_R5 |

Quality gate: **316 passed** (25 suites), build PASS, Prisma validate PASS.

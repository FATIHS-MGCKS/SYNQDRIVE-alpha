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

# WOB L 7503 — POST-#1617 physical drive acceptance audit (2026-09-12)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-WOB7503-POST-1617-001 |
| **Source type** | PRODUCTION_OBSERVATION (read-only) |
| **Audited production SHA** | `a8320f2cabccf7dbeb38cab5afdfc6ee00abdea0` (release `20260912194023_v4994`) |
| **PR #1617 merge** | `b8663ba8a0dc7ff2701857514ac897dcc0bd150f` — confirmed ancestor of deployed SHA (repository verification) |
| **Deploy capturedAt (UTC)** | `2026-09-12T19:40:23Z` (release id `20260912194023_v4994`) |
| **Audit observedAt (UTC)** | `2026-09-12T20:30:03Z` (acceptance snapshot); root-cause addendum @ `2026-09-12T20:40:03Z` |
| **Vehicle** | WOB L 7503 — VW Tiguan; `vehicleId` `19fedd4b-c4e8-4de8-a125-dab293326e7e`; DIMO `tokenId` **192922** |
| **Canonical tripId** | `4083e24c-fc8f-4f56-8d95-a27d517169dc` |
| **Spurious split tripId** | `802a54ba-139a-4740-87db-6ef619659d5c` |
| **Classification** | **FAIL** — natural terminal lifecycle not reached; persistent CUSUM still-ongoing loop after physical stop |

## Operator ground truth (Europe/Berlin CEST = UTC+02:00)

| Label | Local | UTC |
|-------|-------|-----|
| Driver start | ~21:15–21:17 | ~19:15–19:17 |
| Driver stop / parked | 21:52:50 | 19:52:50 |
| Audit target | ~22:20 | ~20:20 |

Forensic window: **`2026-09-12T19:00:00Z` → `2026-09-12T20:30:03Z`**

## Phase 0 — deployment eligibility

| Field | Value |
|-------|-------|
| CURRENT_MAIN_SHA (origin/main @ audit) | `7cb184ffc5926521429f75524a1dcb65579769f6` |
| PRODUCTION_SHA_REPLICA_A | `a8320f2cabccf7dbeb38cab5afdfc6ee00abdea0` |
| PRODUCTION_SHA_REPLICA_B | `a8320f2cabccf7dbeb38cab5afdfc6ee00abdea0` |
| SAME_SHA_ALL_REPLICAS | YES (shared `current` symlink + PM2 cwd `/opt/synqdrive/current/backend`) |
| PR_1617_PRESENT_IN_PRODUCTION_TREE | YES (`b8663ba8…` ancestor of `a8320f2ca…`; shallow clone on VPS cannot run `merge-base` locally) |
| DEPLOYED_BEFORE_DRIVE | YES (~37 min before canonical trip start; ~12 min before first spurious segment start) |

## Phase 1 — canonical trip identification

| Field | Value |
|-------|-------|
| OVERLAPPING_TRIP_COUNT | 2 |
| FALSE_SPLIT_OBSERVED | **YES** — `live_mid_trip_gap_split` @ ~19:21 UTC closed spurious segment and opened canonical segment |
| DUPLICATE_TRIP_OBSERVED | NO (sequential split pair with explicit `splitFrom` / `splitReason` metadata; not independent duplicates) |
| CANONICAL_TRIP_ID | `4083e24c-fc8f-4f56-8d95-a27d517169dc` |
| SPURIOUS_TRIP_ID | `802a54ba-139a-4740-87db-6ef619659d5c` |
| TRIP_START_AT (canonical) | `2026-09-12T19:21:10.412Z` |
| TRIP_STATUS (audit) | ONGOING |
| TRIP_END_AT (column) | `2026-09-12T19:54:02.811Z` (non-terminal lifecycle write) |
| TRIP_COMPLETED_AT | NULL |

**Canonical selection rationale:** Trip `4083e24c…` is the segment continuing the physical drive after the LIVE FSM gap split (`splitFrom=802a54ba…`, `splitReason=live_mid_trip_gap_split`, `splitGapMs=203563`). It spans the operator stop window and remains `activeTripId`. Trip `802a54ba…` is a ~46 s spurious COMPLETED prefix.

**Spurious segment completion path:** No POSSIBLE_END / END_VALIDATION / FINALIZE on `802a54ba…`. Five ACTIVE_TRACKING runs only; COMPLETED status came from LIVE FSM mid-trip gap split (`splitFirstEndAt=2026-09-12T19:17:46.849Z`), not natural end cycle.

## Phase 2 — start acceptance

| Field | Value |
|-------|-------|
| DRIVER_START_WINDOW_UTC | 19:15–19:17 |
| CANONICAL_START_AT | `2026-09-12T19:21:10.412Z` |
| START_ERROR_FROM_WINDOW_SECONDS | **250** (vs window end 19:17:00) |
| START_ACCEPTABLE | **NO** (canonical drive start delayed by gap split; spurious 19:17:00 segment does not represent the main drive) |
| Start authority (evidence) | DIMO trigger wake 19:17:30; `confirmedStartAt=19:17:00`; `startSource=DIMO_SEGMENT`; `startEvidencePath=DIMO_PLUS_CLICKHOUSE` on detection state |

## Phase 3 — end evidence timeline (canonical trip)

| UTC timestamp | Event | Notes |
|---------------|-------|-------|
| 19:34:06 | IDLE_WITHIN_TRIP pause | `lastPauseBoundaryAt`; mid-drive pause only |
| 19:36:26 | Boundary retired (movement) | `stopBoundaryRetiredAt` — pre-stop pause resume |
| 19:53:02 | `lastMeaningfulMovementAt` | Last movement anchor before stop |
| 19:53:32 | Trusted stop boundary | `provider_stationary_vls`, `PROVIDER_EVENT_TIME`, `stopBoundaryTrust=true` |
| 19:55:32 | First POSSIBLE_END | ACTIVE_TRACKING → POSSIBLE_END (`boundary_backed_provider_silence`) |
| 19:57:32 | PEC → EV #1 | `triggering_cusum_validation` → `cusum_still_ongoing` → ACTIVE reopen |
| 19:58:03 | POSSIBLE_END re-entry | ACTIVE_TRACKING → POSSIBLE_END; boundary preserved |
| 20:00:04 – 20:29:32 | EV #2–#13 | Same pattern: PEC stability → CUSUM → `cusum_still_ongoing` → ACTIVE → POSSIBLE_END |
| 20:30:03 (audit) | FSM POSSIBLE_END | `possibleEndAt=19:53:32`; `end_validation_attempts=0` (reset after each CUSUM reopen) |
| — | FINALIZE / COMPLETED / RESTING | **Never observed** |

PM2 `TRIP_END_TIMELINE` on replica A confirms repeating `possible_end_entered` / `end_validation_scheduled` with stable `possibleEndAt=2026-09-12T19:53:32.000Z` and `lastMeaningfulMovementAt=2026-09-12T19:53:02.420Z`. No `canonicalEndAt` / `endRecognizedAt` log lines.

## Phase 4 — stop boundary quality

| Field | Value |
|-------|-------|
| PHYSICAL_STOP_GROUND_TRUTH | `2026-09-12T19:52:50Z` |
| FIRST_TRUSTED_STOP_BOUNDARY_AT | `2026-09-12T19:53:32.000Z` |
| FIRST_TRUSTED_STOP_BOUNDARY_SOURCE | `provider_stationary_vls` |
| FIRST_TRUSTED_STOP_BOUNDARY_AUTHORITY | `PROVIDER_EVENT_TIME` |
| FIRST_TRUSTED_STOP_BOUNDARY_TRUST | true |
| STOP_BOUNDARY_ERROR_SECONDS | **42** (boundary vs physical stop) |
| Provider/event-time based | YES |
| Trusted before END_VALIDATION | YES (present on ACTIVE_TRACKING @ 19:54:03 before first EV @ 19:57:32) |
| WORKER_TIME_FALSE_BOUNDARY_OBSERVED | NO |

## Phase 5 — #1603 regression check

| Field | Value |
|-------|-------|
| END_VALIDATION_PROCESSOR_ENTRY_COUNT | **13** (inferred from persisted tracking runs = successful processor execution) |
| END_VALIDATION_TRACKING_RUN_COUNT | **13** |
| END_VALIDATION_LOCK_MISS_COUNT | **0** |
| EV_LOCK_MISS_MOVED_TO_DELAYED_COUNT | **0** |
| SILENT_END_AUTHORITY_LOSS_OBSERVED | **NO** |
| PEC_SCHEDULE_WHILE_WORKER_LOCK_HELD | **NO** (EV tracking runs persist; PM2 shows deferred `end_validation_scheduled` after PEC; zero lock-miss grep hits) |

**Contrast with pre-#1603 POST-#1600 drive:** 15/15 EV processor entries, **0** tracking runs — **not reproduced**.

## Phase 6 — #1617 physical validation

| Field | Value |
|-------|-------|
| CUSUM_STILL_ONGOING_OCCURRED | **YES** |
| CUSUM_STILL_ONGOING_COUNT | **13** |
| BOUNDARY_PRESERVED_ACROSS_CUSUM_REOPEN | **YES** (all 13 post-EV ACTIVE_TRACKING runs retain `stopBoundaryAt=2026-09-12T19:53:32.000Z`, `stopBoundarySource=provider_stationary_vls`, `stopBoundaryTrust=true`) |
| POSSIBLE_END_REENTERED | **YES** (after every CUSUM reopen) |
| NEXT_END_VALIDATION_REACHED | **YES** (13 sequential EV cycles) |
| NEXT_END_VALIDATION_AT (last) | `2026-09-12T20:29:32.889Z` |
| CREDIBLE_POST_BOUNDARY_MOVEMENT_OCCURRED | **NO** (`lastMeaningfulMovementAt` frozen at 19:53:02; post-stop `speed=16` / ignition ON in evidence carries `vlsObservationAgeMs` > 30 min — stale provider read, not boundary retirement) |
| BOUNDARY_RETIREMENT_IF_MOVEMENT | NOT_APPLICABLE |
| PR_1617_PHYSICAL_PATH_VALIDATED | **YES** (preserve + re-entry mechanics exercised); **terminal acceptance still FAIL** (CUSUM never confirms change point; no FINALIZE) |

## Phase 7 — attempt / retry contract

All 13 END_VALIDATION runs: `completedAttempt=1`, `reason=cusum_still_ongoing`, FSM `POSSIBLE_END → ACTIVE_TRIP`. Counter resets on each CUSUM reopen (`end_validation_attempts=0` at audit).

| Field | Value |
|-------|-------|
| END_VALIDATION_ATTEMPTS_TOTAL | 13 |
| CUSUM_STILL_ONGOING_COUNT | 13 |
| LATER_ATTEMPT_AFTER_CUSUM_REOPEN | YES |
| cusum_change_point_confirmed | 0 |
| FINALIZATION_CHECK runs | 0 |

## Phase 8 — terminal lifecycle

| Field | Value |
|-------|-------|
| FINALIZE_REACHED | NO |
| FINALIZE_COMPLETED | NO |
| TRIP_COMPLETED_NATURALLY | NO |
| TRIP_COMPLETED_AT | NULL |
| FINAL_TRIP_END_AT | NULL (non-terminal column write only) |
| RESTING_REACHED | NO |
| RESTING_REACHED_AT | NULL |
| ACTIVE_TRIP_ID_CLEARED | NO (`4083e24c…`) |
| FINAL_FSM_STATE (audit) | POSSIBLE_END |
| PHYSICAL_STOP_TO_COMPLETED_SECONDS | N/A (not COMPLETED) |
| PHYSICAL_STOP_TO_RESTING_SECONDS | N/A (not RESTING) |

At audit +37 min after physical stop, expected FINALIZE window long exceeded → **FAIL**, not PENDING.

## Phase 9 — repair exclusion (canonical trip)

| Field | Value |
|-------|-------|
| MANUAL_REPAIR_USED | NO |
| STALE_ONGOING_REPAIR_USED | NO (vehicle repairs today targeted other tripIds only) |
| RECONCILIATION_REPAIR_USED | NO |
| FORCED_COMPLETION_USED | NO (canonical trip) |
| NORMAL_END_CYCLE_ONLY | **NO** |

Note: spurious segment `802a54ba…` was COMPLETED via LIVE FSM gap split (not reconciliation repair). `trip_repairs` has no rows for either POST-#1617 trip.

## Phase 10 — cross-vehicle / cross-trip authority

| Field | Value |
|-------|-------|
| CROSS_VEHICLE_JOB_LEAK | NO (111 tracking runs, 1 vehicle_id) |
| CROSS_TRIP_BOUNDARY_LEAK | NO |
| STALE_END_CYCLE_TOKEN_ACCEPTED | NO (no foreign vehicle runs on canonical tripId) |

## Phase 11 — acceptance classification

```
PHYSICAL_ACCEPTANCE_VERDICT=FAIL
CONFIDENCE=HIGH
PR_1603_REGRESSION_STATUS=NOT_REPRODUCED
PR_1617_PHYSICAL_PATH_VALIDATED=YES (mechanics only; terminal chain not completed)
PRODUCTION_MUTATED=NO
TRIP_REPAIRED=NO
```

**Primary failure:** After physical stop, canonical trip entered a **stable CUSUM still-ongoing ↔ POSSIBLE_END loop** (13 cycles in ~32 min) without ever reaching `cusum_change_point_confirmed`, FINALIZE, COMPLETED, or RESTING.

**Secondary findings:**

1. **FALSE_SPLIT** at drive start (`live_mid_trip_gap_split`) delayed canonical start vs operator window.
2. **#1617 fix behavior** for boundary preservation across CUSUM reopen appears **working on Production** — distinct from KS MS 661 POST-#1603 strip defect.
3. **Root-cause proven (addendum below):** orchestration **retry-budget reset** on every `cusum_still_ongoing` reopen makes `TRIP_END_VALIDATION_MAX_ATTEMPTS` fallback unreachable; CUSUM re-evaluates the same immutable 27-point window each cycle.

---

## Root-cause addendum (read-only, @ `2026-09-12T20:40:03Z`)

**PR:** #1625 · **Production SHA:** `a8320f2cabccf7dbeb38cab5afdfc6ee00abdea0`

### Phase A — frozen authority

| Field | Value |
|-------|-------|
| CURRENT_MAIN_SHA | `7cb184ffc5926521429f75524a1dcb65579769f6` |
| PRODUCTION_SHA_A / B | `a8320f2cabccf7dbeb38cab5afdfc6ee00abdea0` |
| SAME_SHA_ALL_REPLICAS | YES |
| PR_1603_PRESENT | YES (`9e3a5a19c` ancestor) |
| PR_1617_PRESENT | YES (`b8663ba8…` ancestor) |

Code traces below reference **`a8320f2cabccf7dbeb38cab5afdfc6ee00abdea0`** (tree-equivalent to deployed bundle).

### Phase B — all END_VALIDATION cycles (Production tracking runs)

Acceptance snapshot captured **13** cycles by `20:30:03Z`. Root-cause read @ `20:40:03Z` captured **17** cycles (loop still running). Every row is **identical in detector inputs/outcomes** except timestamps.

| Cycle | END_VALIDATION_AT (UTC) | FSM_BEFORE | FSM_AFTER | POSSIBLE_END_AT | STOP_BOUNDARY_AT | STOP_BOUNDARY_SOURCE | STOP_BOUNDARY_TRUST | EV_ATTEMPTS_BEFORE | COMPLETED_ATTEMPT | PERSISTED_AFTER_REOPEN | CORE_POINTS | END_DECISION_REASON | DETECTOR_APPEARS_ONGOING | STOP_BOUNDARY_AFTER_REOPEN |
|-------|-------------------------|------------|-----------|-----------------|------------------|----------------------|---------------------|--------------------|-------------------|------------------------|-------------|---------------------|--------------------------|----------------------------|
| 1 | 19:57:32.951 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | CUSUM indicates trip is still active | true (inferred) | 19:53:32 / true |
| 2 | 20:00:04.498 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 3 | 20:02:33.591 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 4 | 20:05:33.312 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 5 | 20:08:03.176 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 6 | 20:10:33.712 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 7 | 20:13:32.906 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 8 | 20:16:03.234 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 9 | 20:18:33.503 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 10 | 20:21:32.920 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 11 | 20:24:03.442 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 12 | 20:26:34.303 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 13 | 20:29:32.889 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 14 | 20:32:03.367 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 15 | 20:34:33.613 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 16 | 20:37:32.891 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |
| 17 | 20:40:03.699 | POSSIBLE_END | ACTIVE_TRIP | 19:53:32 | 19:53:32 | provider_stationary_vls | true | 0 | 1 | 0 | 27 | same | same | same |

**Not persisted in tracking runs (NULL in DB):** `requested_from`, `requested_to`, `endCycleToken`, per-cycle `cusumSegmentStart/End`, raw CUSUM `reason` string. **Inferred from code + frozen anchors:** `POSSIBLE_END_ENTERED_AT` advances each re-entry; `CORE_WINDOW` ≈ `[centre−900s, centre+300s]` around `19:53:32Z` → ~`19:38:32–19:58:32Z`; `CUSUM_LAST_MOVEMENT_AT` frozen at `19:53:02.420Z` on detection state throughout.

```
EVERY_CYCLE_COMPLETED_ATTEMPT_EQUALS_1=YES
ATTEMPT_COUNTER_ACCUMULATES_ACROSS_REOPEN=NO
ATTEMPT_COUNTER_RESET_OBSERVED=YES (persistedAttemptsAfterReset=0 every cycle; DB end_validation_attempts=0 at each PEC gate)
```

### Phase C — attempt-counter semantics (@ deployed SHA)

**Writers resetting `endValidationAttempts → 0`:**

| Location | Trigger |
|----------|---------|
| `trip-end-cycle-reset.ts:313` | `buildPossibleEndToActiveReset()` always sets `endValidationAttempts: 0` |
| `trip-detection-orchestration.service.ts:3379–3385` | `processEndValidation()` CUSUM still-ongoing branch spreads `buildPossibleEndToActiveReset({ reopenReason: 'CUSUM_STILL_ONGOING' })` |
| R5 unit test `trip-end-validation-r5.spec.ts` “2/10 — CUSUM ongoing reopen…” | **Expects** `endValidationAttempts: 0` after ongoing reopen |

**Writers incrementing counter:**

| Location | Trigger |
|----------|---------|
| `processEndValidation()` inconclusive / confirmed paths | `endValidationAttempts: completedAttempt` where `completedAttempt = prior + 1` |

**Max-attempt reader:**

| Location | Condition |
|----------|-----------|
| `processPossibleEndCheck()` Step 4 | `if (attempts < TRIP_END_VALIDATION_MAX_ATTEMPTS)` → schedule EV |
| `processPossibleEndCheck()` Step 5 | `else` → `buildMaxAttemptFallbackEvidence` + `scheduleFinalize` |

**Intended meaning (proven from docs + tests, not variable name alone):**

Choice **B** — `endValidationAttempts` counts **completed CUSUM validation cycles for the current physical end candidate** (`docs/audits/trip-fsm/R5_END_VALIDATION_SEMANTICS_IMPLEMENTATION_2026-09-06.md` §R5A.3, §R5A.12; PEC test “14/17 — max completed attempts fallback…” requires `endValidationAttempts: 3` before fallback).

**Contradiction:** CUSUM still-ongoing is documented as a “completed cycle; counter reset” (`processEndValidation` comment @ line 3363), so **ongoing reopen cycles do not accumulate** toward the Step-5 threshold even though tracking logs `completedAttempt: 1` each time.

### Phase D — max-attempt reachability

| Field | Value |
|-------|-------|
| MAX_ATTEMPT_LIMIT_CONFIGURED | YES (`worker.tripEndValidationMaxAttempts`, default **3**) |
| MAX_ATTEMPT_LIMIT_VALUE | **3** |
| MAX_ATTEMPT_FALLBACK_CODE_EXISTS | YES — `processPossibleEndCheck()` Step 5 @ `3093–3171`, `buildMaxAttemptFallbackEvidence()` @ `trip-end-cycle-reset.ts:401` |
| MAX_ATTEMPT_FALLBACK_REACHABLE_AFTER_CUSUM_STILL_ONGOING_REOPEN | **NO** |

**Why unreachable (control-flow proof @ `a8320f2…`):**

1. PEC Step 4 schedules EV when `det.endValidationAttempts < 3`.
2. EV CUSUM ongoing → `buildPossibleEndToActiveReset()` → **`endValidationAttempts: 0`** (lines 3363–3385).
3. Empty-core ACTIVE tick re-enters POSSIBLE_END with boundary preserved (#1617).
4. Next PEC sees `attempts = 0` again → Step 4 forever; Step 5 never executes.

```
UNBOUNDED_RETRY_LOOP_POSSIBLE=YES
PRIMARY_ORCHESTRATION_DEFECT_CLASS=END_VALIDATION_RETRY_BUDGET_RESET_LOOP
```

Hard timeout fallback (`TRIP_END_TIMEOUT_MS`) remains a separate last-resort path; not observed within audit window.

### Phase E — why CUSUM says still ongoing every cycle

**Fetch contract:** `fetchEndValidationWindow(tokenId, centreAt=stopBoundary, lookback=900_000ms, lookahead=300_000ms)` → immutable **27** core points every cycle (`core_points_count=27` for all 17 runs).

**Movement / boundary analysis:**

| Question | Answer |
|----------|--------|
| POST_BOUNDARY_MOVEMENT_IN_CUSUM_WINDOW | **NO credible** — `lastMeaningfulMovementAt` frozen `19:53:02`; no boundary retirement after stop |
| CUSUM_REUSES_PRE_BOUNDARY_MOVEMENT | **YES** — identical 27-point window re-fetched; includes pre-stop driving samples |
| NO_NEW_DATA_CLASSIFIED_AS_ONGOING | **YES** — stale VLS (`vlsObservationAgeMs` > 30 min @ audit) + identical core window → identical verdict every ~150s |
| CUSUM_RESULT_CHANGES_BETWEEN_CYCLES | **NO** |

**Detector path (@ `trip-cusum.ts:104–114` @ `a8320f2…`):** `appearsOngoing: true` when **≥3 of last 5 chronological samples** have `speed > 2 km/h`. With a fixed window anchored before/at stop, tail samples can remain “moving” from **pre-boundary driving** or **stale/contradictory speed** (`stopBoundaryContradictions: engine_load_at_standstill` in live evidence) even without credible post-stop motion.

`TripDecisionEngine.evaluateEndCandidate()` maps `NOT_TRIGGERED + appearsOngoing` → `shouldReopen: true`, reason `"CUSUM indicates trip is still active"` (`trip-decision.engine.ts:191–203`).

**Important:** #1617 fixed boundary strip on reopen; empty-core **does** re-admit POSSIBLE_END via `boundary_backed_provider_silence`. The loop is no longer “no re-entry” (KS MS 661 POST-#1603 class) — it is **unbounded re-entry + reset budget + repeated CUSUM veto**.

### Phase F — boundary / CUSUM semantic contract

| Contract question | Docs/tests | Production runtime |
|-------------------|------------|-------------------|
| TRUSTED_BOUNDARY_IS_END_AUTHORITY | **YES** — R12 empty-core `boundary_backed_provider_silence` when trusted boundary + stale VLS (`TDL-DEC-R12-001`) | **YES** for POSSIBLE_END admission |
| CUSUM_IS_CONFIRMATION_ONLY | **YES** — scheduled only after stability gate; not used for live polling (`trip-cusum.ts` header) | **Partially** — CUSUM veto overrides terminal progression |
| CUSUM_CAN_VETO_TRUSTED_BOUNDARY_INDEFINITELY | **Not documented as intended** — R5A.12 promises max-attempt fallback after 3 completed cycles | ** de facto YES** — reset loop prevents fallback; CUSUM never confirms |

**Contradiction recorded:** Architecture/docs treat trusted provider boundary as end authority for empty-core silence, and R5 promises bounded CUSUM cycles — but **`cusum_still_ongoing` reopen resets the attempt budget**, so CUSUM can veto the same trusted boundary without terminal escalation.

### Phase G — minimal RED test design (NOT IMPLEMENTED)

**File (proposed):** `trip-r12-wob7503-cusum-retry-budget-red.postgres-redis.integration.spec.ts`

**Seed:**

1. ACTIVE trip with trusted `stopBoundaryAt` (provider/event-time, trust=true), `lastMeaningfulMovementAt` before boundary, stale VLS timestamp.
2. Empty-core stream after boundary (no post-boundary movement).
3. Real `ChangePointEndDetector` + `detectTripEndChangePoint` on fixed 27-point fixture where tail satisfies `still_active_at_window_end` (or production-captured fixture).

**Drive orchestration (natural queue, no mocked EV verdict):**

`POSSIBLE_END → PEC → EV → cusum_still_ongoing → ACTIVE (boundary preserved) → ACTIVE tick → POSSIBLE_END → repeat ≥4 times`.

**Assertions:**

```
RED_BOUNDARY_PRESERVED=YES
RED_NO_POST_BOUNDARY_MOVEMENT=YES
RED_CUSUM_ONGOING_REPEATS=YES (≥4)
RED_ATTEMPT_COUNTER_RESETS=YES (endValidationAttempts stays 0)
RED_MAX_ATTEMPT_FALLBACK_REACHED=NO (scheduleFinalize never called)
RED_FINALIZE_REACHED=NO
```

Optional: after N cycles, assert trip still ONGOING / not RESTING — proves unbounded loop on HEAD.

**TEST_GAP:** No integration test asserts that CUSUM ongoing reopen **must** accumulate toward `TRIP_END_VALIDATION_MAX_ATTEMPTS` or trigger Step-5 fallback across reopen loops. Existing R5 tests cover single-episode increment and max fallback only when `endValidationAttempts` is **pre-seeded to 3**.

### Phase H — secondary defect: false start split (separate track)

| Field | Value |
|-------|-------|
| FALSE_SPLIT_TRIP_ID | `802a54ba-139a-4740-87db-6ef619659d5c` |
| Spurious start / end | `19:17:00` → `19:17:46.849` (~46 s) |
| Canonical start | `19:21:10.412` |
| Gap | **203563 ms** (~3 m 24 s) |
| Drift | **169.33 m** (threshold **200 m**) |
| Split forensics run | `2026-09-12T19:21:59.073Z` ACTIVE_TRACKING — `decision=APPLIED`, `triggeredBy=LIVE_FSM` |

**Reconstruction:**

- `19:17:28–19:17:42`: motion on spurious trip waypoints (speed 13–19 km/h).
- `19:18:40–19:20:50`: repeated `no_core_data_keep_open` with `fetchOutcome=SUCCESS_EMPTY`, `innerGateReason=vls_stale_provider_observation`, `core_points_count=0`.
- `findMidTripGap()` (`trip-detection-orchestration.service.ts:4488–4583`) prepends synthetic stationary anchor + detects **≥180 s** silence with stationary-before / motion-after sandwich.
- Drift check passed (`169 m < 200 m`); split applied closing spurious trip and opening `4083e24c…`.

```
FALSE_SPLIT_ROOT_CAUSE_PROVEN=YES
FALSE_SPLIT_ROOT_CAUSE_CLASS=startup_data_hole + stale_provider_timestamps (empty core SUCCESS_EMPTY gap misread as mid-trip stationary split)
```

**Separate RED test design (NOT IMPLEMENTED):** Seed single physical drive: initial motion → **>180 s empty core hole** with stale VLS → resumed motion within 200 m drift; assert **no** `live_mid_trip_gap_split` while driver still on same continuous trip.

### Phase I — failure-class separation

| Era | Class | WOB L 7503 status |
|-----|-------|-------------------|
| PRE-#1600 | PE clock durability / active-job removal | **Not reproduced** |
| POST-#1600 PRE-#1603 | PEC-held lock → silent EV loss | **Not reproduced** (17 EV tracking runs, 0 lock misses) |
| POST-#1603 PRE-#1617 | CUSUM reopen strips boundary → no PE re-entry | **Not reproduced** — boundary preserved all cycles |
| POST-#1617 (this drive) | Boundary survives + EV repeats, **no bounded terminal outcome** | **PROVEN** — new primary class |

### Phase J — root-cause classification (END failure)

```
PRIMARY_END_ROOT_CAUSE_CLASS=RETRY_BUDGET_RESET
PRIMARY_END_ROOT_CAUSE_FILE=backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts
PRIMARY_END_ROOT_CAUSE_FUNCTION=processEndValidation (CUSUM still-ongoing branch) + processPossibleEndCheck (Step 4/5 gate)
PRIMARY_END_ROOT_CAUSE_LINES=3363–3404 (reset on ongoing), 3093–3171 (max fallback never reached when attempts=0)
PRIMARY_END_ROOT_CAUSE_PROVEN=YES

SECONDARY_END_CONTRIBUTOR=CUSUM_DECISION_SEMANTICS — immutable 27-point window + still_active_at_window_end tail rule (trip-cusum.ts:104–114) re-vetoes trusted boundary without new post-stop data

TEST_GAP=No cross-reopen integration test tying CUSUM ongoing resets to max-attempt fallback budget
RED_TEST_DESIGN=See Phase G

READY_FOR_FIX_DESIGN=YES (orchestration budget semantics; optional CUSUM/boundary contract — fix design out of scope for this audit)
```

**Physical acceptance verdict remains FAIL.** #1603 and #1617 targeted fixes remain validated for their scoped defects.


- Did **not** repair trip `4083e24c…` or `802a54ba…` on Production.
- Did **not** deploy, mutate DB/Redis/PM2, enqueue jobs, or manually finalize.

## Related evidence

- KS MS 661 POST-#1603 acceptance: [KS_MS_661_R12_POST_1603_PHYSICAL_ACCEPTANCE_2026-09-12.md](KS_MS_661_R12_POST_1603_PHYSICAL_ACCEPTANCE_2026-09-12.md)
- CUSUM boundary preservation fix: [KS_MS_661_R12_POST_1603_CUSUM_RETRY_FAILURE_2026-09-12.md](KS_MS_661_R12_POST_1603_CUSUM_RETRY_FAILURE_2026-09-12.md)
- Raw audit log: `/opt/cursor/artifacts/wob-l-7503-post-1617-audit-raw.log`

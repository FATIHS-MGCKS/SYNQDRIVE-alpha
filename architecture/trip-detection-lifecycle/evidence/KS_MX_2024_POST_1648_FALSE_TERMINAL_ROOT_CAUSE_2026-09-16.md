# KS MX 2024 — 2026-09-16 false terminalization root-cause audit

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-KS-MX-POST-1648-ROOT-CAUSE-001 |
| **Parent audit** | [KS_MX_2024_POST_1648_PRODUCTION_SHADOW_AUDIT_2026-09-16.md](KS_MX_2024_POST_1648_PRODUCTION_SHADOW_AUDIT_2026-09-16.md) |
| **Mode** | STRICT READ_ONLY |
| **Trip A (live)** | `a1aab26a-b42e-4ea9-9c55-5350f9690152` |
| **Production SHA** | `102b3f917a53e95c374dce0fafc6e34a69d1b9aa` @ `20260916153903_v4994` |

## Correction to prior audit wording (Phase H)

The prior report stated `PAUSE_CAUSED_NEW_TRIP_CREATION=YES` without separating live FSM from reconciliation. **Corrected:**

| Claim | Status |
|-------|--------|
| `LIVE_NEW_TRIP_CREATED_AT_RESUME` | **NO** |
| `RECONCILIATION_CREATED_SYNTHETIC_TRIP_LATER` | **YES** @ `2026-09-17T00:20:27Z` |
| `LIVE_FALSE_TERMINALIZATION_PRECEDED_RECONCILIATION` | **YES** — RESTING @ `20:52:23Z`; repair ~3h58m later |
| Prior `PAUSE_CAUSED_NEW_TRIP_CREATION=YES` | **SUPERSEDED** — conflated reconciliation split with live FSM; live failure is **premature terminalization**, not live trip birth at resume |

Reconciliation trip B (`064dfaf4…`): `trip_source=REPAIRED`, **0 tracking runs**, first waypoint `20:52:22` added during repair — not a live same-day FSM-created trip.

---

## Executive root-cause summary

A ~5-minute mid-trip ignition-off pause was allowed to terminate because:

1. **First broken condition (PROVEN):** `assessActiveContinuity()` admitted **`POSSIBLE_END`** via **`full_inactivity_ignition_off`** at `20:48:24Z` from a **single inactive core point**, skipping `IDLE_WITHIN_TRIP` and any short-pause dwell protection.
2. **CUSUM reopen (CONTRIBUTING, correct #1617 behavior):** EV1 @ `20:50:24Z` returned to `ACTIVE_TRIP` (`cusum_still_ongoing`) and cleared ClickHouse latch fields.
3. **Empty-core ClickHouse re-latch (PROVEN):** @ `20:50:54Z`, `tryApplyClickHouseAssistedEnd()` re-entered `POSSIBLE_END` with **`cusumSegmentEnd=20:48:03Z`** (`clickhouse_end_assist_no_core_stream`) after DIMO core stream went empty.
4. **Resume not consumed before finalize (PROVEN):** PEC @ `20:52:23Z` reported **`NO_RESUME_EVIDENCE`**; operator resume ~`20:52:00Z` / repair waypoint `20:52:22` was **not visible in the consumed DIMO core snapshot** at EV2 time.
5. **Decisive terminalization defect (PROVEN):** EV2 @ `20:52:23Z` took **`clickhouse_end_assist_skip_cusum`**, which **does not re-run post-boundary movement/resume invalidation** before `RESTING`.

**Primary class:** combination — **`FSM STATE-MACHINE POLICY DEFECT`** (first break) + **`CLICKHOUSE_ASSIST_REVALIDATION_DEFECT`** (decisive finalize) + **`EVENT_TIME / INGESTION_RACE`** (resume not visible to PEC/EV2).

---

## Phase A — Exact chronology (`20:45Z`–`20:55Z`)

All times UTC. `WORKER_PROCESSING_AT` = `vehicle_trip_tracking_runs.created_at`.

| EVENT_TIME | OBSERVED/INGESTED | WORKER_PROCESSING_AT | SOURCE | FRESHNESS | FSM_BEFORE → FSM_AFTER | Notes |
|------------|-------------------|----------------------|--------|-----------|------------------------|-------|
| `20:46:53` | waypoint `recorded_at` | (route ingest) | trip waypoints | last live waypoint; speed 12.5 | ACTIVE_TRIP | last credible movement in live Trip A waypoints |
| `20:47:24` | core fetch window end | `20:47:24.760` | ACTIVE_TRACKING | SUCCESS_WITH_DATA; motionCount=2 | ACTIVE → ACTIVE | last motion_detected before pause terminal chain |
| `20:48:03` | ClickHouse segment end (validated later) | — | ClickHouse ignition segment | candidate end (not yet latched) | ACTIVE | becomes `validatedEndTime` at EV2 |
| `20:48:23.554` | `last_activity_at` on trip row | — | trip persistence | — | ACTIVE | last activity timestamp persisted |
| `20:48:24` | 1 inactive core point in window | `20:48:24.033` | ACTIVE_TRACKING | fetch 20:46:54–20:48:23; **core_points=1** | **ACTIVE → POSSIBLE_END** | reason **`full_inactivity_ignition_off`** |
| `20:48:54` | PEC stability | `20:48:54.504` | POSSIBLE_END_CHECK | physicalInactivityMs=130163 | POSSIBLE_END | stability_window_waiting |
| `20:49:24` | PEC stability | `20:49:24.963` | POSSIBLE_END_CHECK | physicalInactivityMs=160638 | POSSIBLE_END | stability_window_waiting |
| `20:50:23` | PEC pre-EV | `20:50:23.888` | POSSIBLE_END_CHECK | resumeCheck=**NO_RESUME_EVIDENCE** | POSSIBLE_END | triggering_cusum_validation |
| `20:50:24` | EV1 | `20:50:24.266` | END_VALIDATION | CUSUM fetch | **POSSIBLE → ACTIVE** | **`cusum_still_ongoing`**; attempts reset |
| `20:50:54` | empty core stream | `20:50:54.799` | ACTIVE_TRACKING | core_points=0 | **ACTIVE → POSSIBLE_END** | **`clickhouse_end_assist_no_core_stream`**; latches CH end |
| `20:52:00` | operator resume (ground truth) | — | operator | — | POSSIBLE_END (latched) | physical resume; not in live core consumption |
| `20:52:22` | repair waypoint (post-hoc) | `2026-09-17` repair | reconciliation | on Trip B only | — | proves movement existed; **not in live Trip A snapshot at EV2** |
| `20:52:23` | PEC pre-EV2 | `20:52:23.755` | POSSIBLE_END_CHECK | resumeCheck=**NO_RESUME_EVIDENCE** | POSSIBLE_END | triggering_cusum_validation |
| `20:52:23` | EV2 | `20:52:23.774` | END_VALIDATION | skip path | **POSSIBLE → RESTING** | **`clickhouse_end_assist_skip_cusum`**, validatedEnd=`20:48:03` |
| `20:52:24` | FINALIZE | `20:52:24.025` | FINALIZATION_CHECK | — | RESTING | finalize chain |
| `20:58:00` | operator final stop | — | operator | — | RESTING | trip already terminal |

### Resume visibility before EV2

**Answer: C — not yet ingested/visible in the authoritative DIMO core snapshot consumed by PEC/EV2**, with **B — present-but-not-consumed at EV2** for the ClickHouse skip path.

Evidence:
- Live Trip A waypoints: **120 total**, `max(recorded_at)=20:46:53` — **zero** post-`20:48:03` waypoints during live FSM.
- PEC @ `20:52:23`: **`resumeCheckOutcome=NO_RESUME_EVIDENCE`** after 90s core fetch.
- Reconciliation repair (next day): first movement waypoint **`20:52:22`** on synthetic Trip B — corroborates physical resume **~1s before EV2**, but **outside live Trip A ingestion path** at decision time.
- EV2 **`clickhouse_end_assist_skip_cusum`** performs **no resume fetch** regardless of provider state.

---

## Phase B — `full_inactivity_ignition_off` authority

| Field | Value |
|-------|-------|
| Admission function | `assessActiveContinuity()` in `trip-evidence.helpers.ts` |
| Rule | §5: `inact.allStopped && inact.allIgnitionOff && inact.noEnergyChange` |
| Thresholds | Uses inactivity window on scoped core points; **1 inactive point sufficient** in this run |
| Stop boundary | **Not set** on this tick (`stopBoundaryAt: null` in tracking summary) |
| Intended pause vs parking | **No distinct short-pause protection** on this path — jumps **`ACTIVE → POSSIBLE_END`**, not `IDLE_WITHIN_TRIP` |
| Resume invalidation | `hasActivityResumed` / `EndContinuityDetector` on PEC only **after** already in `POSSIBLE_END` |
| `FULL_INACTIVITY_CAN_TRIGGER_DURING_SHORT_PAUSE` | **YES** (proven @ 20:48:24, ~91s after last waypoint) |
| `SHORT_PAUSE_PROTECTION_EXISTS_BEFORE_POSSIBLE_END` | **NO** on ignition-off direct POSSIBLE_END path |
| `SHORT_PAUSE_PROTECTION_EXISTS_DURING_POSSIBLE_END` | **Partial** — PEC resume check exists but failed (`NO_RESUME_EVIDENCE`) |
| `RESUME_INVALIDATION_CONTRACT_EXISTS` | **YES** at PEC; **NO** at EV2 CH skip path |

Code: `trip-evidence.helpers.ts` lines **1286–1297**; orchestration switch `case 'POSSIBLE_END'` **2942–2987**.

---

## Phase C — EV1 reopen contract (`cusum_still_ongoing`)

EV1 @ `20:50:24.266Z`: **`buildPossibleEndToActiveReset({ reopenReason: 'CUSUM_STILL_ONGOING' })`**

| Field | After EV1 reopen |
|-------|------------------|
| `stopBoundaryAt` | preserved in evidence if trusted (#1617 continuity) |
| `possibleEndAt` / clock columns | **cleared** via `clearPossibleEndClockFields()` |
| `endDetectionMode` | **null** |
| `cusumSegmentEnd` | **null** |
| `endValidationAttempts` | **0** (reset; CUSUM retry budget not preserved without trusted boundary) |
| ClickHouse candidate | **cleared** — not latched until next tick |

#1617/#1627 behavior on EV1: **correct** — trip reopened to `ACTIVE_TRIP`.

**What would have retired pause boundary before EV2:** post-boundary core motion visible to `checkDimoActivityResumed()` after `20:48:03`, or clearing/rejecting ClickHouse latch on empty-core re-entry when resume imminent.

---

## Phase D — Resume evidence vs EV2

| Field | Value |
|-------|-------|
| `POST_BOUNDARY_MOVEMENT_EXISTED_BEFORE_EV2` | **YES** (physical/reconciliation @ ~20:52:22) / **NO** in live Trip A consumed core |
| `POST_BOUNDARY_MOVEMENT_EVENT_TIME` | **`~20:52:22Z`** (reconciliation waypoint; operator ~20:52:00Z) |
| `POST_BOUNDARY_MOVEMENT_INGESTED_AT` | **UNKNOWN** in live FSM path; repair ingested `2026-09-17` |
| `POST_BOUNDARY_MOVEMENT_CONSUMED_BY_EV2` | **NO** |
| `POST_BOUNDARY_MOVEMENT_SHOULD_INVALIDATE_END` | **YES** |
| `POST_BOUNDARY_MOVEMENT_INVALIDATION_RAN` | **NO** at EV2 (PEC ran check → NO_RESUME; EV2 skip bypass) |

**Why not consumed:** DIMO core stream empty from ~`20:50:54`; resume movement ~`20:52:22` either not yet in core API at `20:52:23` or not fetched into Trip A before EV2. EV2 **`clickhouse_end_assist_skip_cusum`** never attempts invalidation.

---

## Phase E — ClickHouse end assist semantics

| Field | Value |
|-------|-------|
| Latch function | `tryApplyClickHouseAssistedEnd()` — sets `cusumSegmentEnd`, `endDetectionMode=CLICKHOUSE_END_ASSIST`, `lastMeaningfulMovementAt=detectedEndAt` |
| Pre-latch resume check | **YES** @ apply time (`checkDimoActivityResumed`) — passed @ 20:50:54 (empty core) |
| EV2 path | `processEndValidation()` early branch when `CLICKHOUSE_END_ASSIST && cusumSegmentEnd` |
| `CLICKHOUSE_ASSIST_CHECKS_POST_BOUNDARY_MOVEMENT` | **At apply:** yes; **at EV2 skip:** **NO** |
| `CLICKHOUSE_ASSIST_REVALIDATES_CANDIDATE_AT_EV_TIME` | **NO** |
| `CLICKHOUSE_ASSIST_CAN_ACCEPT_STALE_END_AFTER_RESUME_WINDOW` | **YES** (proven) |
| `CLICKHOUSE_ASSIST_CAUSAL_TO_FALSE_TERMINATION` | **YES** — decisive finalize @ 20:52:23 |

Code: apply **`trip-detection-orchestration.service.ts` 4557–4626**; skip finalize **`3430–3469`**.

Missing safety: EV2 must re-run post-boundary movement/resume invalidation (or reject stale CH candidate) before `RESTING`.

---

## Phase F — Processing latency / race ranking

| Class | Status | Evidence |
|-------|--------|----------|
| **A. PAUSE_CLASSIFICATION_DEFECT** | **PROVEN (contributing)** | `full_inactivity_ignition_off` → POSSIBLE_END without IDLE dwell |
| **B. RESUME_INVALIDATION_DEFECT** | **PROVEN (decisive)** | PEC NO_RESUME + EV2 skip without resume gate |
| **C. EVENT_TIME / INGESTION_RACE** | **PROVEN (contributing)** | Resume ~20:52:22; EV2 20:52:23; empty core since 20:50:54 |
| **D. CLICKHOUSE_ASSIST_REVALIDATION_DEFECT** | **PROVEN (decisive)** | `clickhouse_end_assist_skip_cusum` no EV-time revalidation |
| **E. FSM STATE-MACHINE POLICY DEFECT** | **PROVEN (first break)** | ACTIVE→POSSIBLE_END on short stop |
| **F. combination** | **YES** | A + B + C + D + E |

Critical window:
- pause boundary candidate: `20:48:03Z`
- operator resume: `~20:52:00Z` (**~237s later**)
- EV2: `20:52:23Z` (**~23s after resume**)
- last live waypoint: `20:46:53Z` (**~329s before EV2**)

---

## Phase G — #1648 observability gap

| Field | Value |
|-------|-------|
| `PAUSE_SHADOW_MISSED_REAL_FAILURE` | **YES** |
| `CAUSE` | Pause shadow starts on **`IDLE_WITHIN_TRIP`** (`shadow_pause_start_idle_within_trip`) or empty-core pause — this path went **`ACTIVE → POSSIBLE_END`** via `full_inactivity_ignition_off` with **no IDLE episode** |
| `OBSERVABILITY_GAP_SEPARATE_FROM_RUNTIME_DEFECT` | **YES** — shadow gap does not explain terminalization; runtime defect is independent |

#1648 should observe (design gap, no change in this audit): ACTIVE→POSSIBLE_END inactivity admissions, PEC/EV resume outcomes, CH skip finalize around resume.

---

## Phase I — Test coverage gap

**Existing tests (partial coverage):**
- `trip-fsm-motor-off-pause-r10.spec.ts` — post-boundary resume anchor, stale tokens
- `trip-fsm-evidence-state.spec.ts` — post-boundary core motion anchor
- `trip-fsm-r12-stop-boundary-end-liveness.spec.ts` — post-boundary movement policy
- `trip-end-cycle-reset.spec.ts` — CUSUM_STILL_ONGOING reopen preserves trusted boundary
- `reference-capture-exp021-false-physical-end.spec.ts` — 150s stop resume (EXP-021 domain, not Trip FSM EV chain)

**Untested production sequence:**
1. ACTIVE → POSSIBLE_END via **`full_inactivity_ignition_off`** during **3–7 min** mid-trip pause
2. EV1 **`cusum_still_ongoing`** reopen → empty core → **`clickhouse_end_assist_no_core_stream`** re-latch
3. Post-boundary movement arrives **within seconds of next EV** while **`CLICKHOUSE_END_ASSIST`** latched
4. EV2 **`clickhouse_end_assist_skip_cusum`** must **NOT** finalize

### Minimal RED test (design only — not implemented)

**File:** `trip-r12-ch-assist-resume-invalidation.postgres-redis.integration.spec.ts` (proposed)

**Scenario:**
- ICE ACTIVE trip with CH segment end @ T0
- `assessActiveContinuity` → POSSIBLE_END (`full_inactivity_ignition_off`) @ T0+90s
- EV1 CUSUM ongoing → ACTIVE reopen
- Empty-core tick → `tryApplyClickHouseAssistedEnd` latches T0
- Inject post-boundary core motion @ T0+5min (before EV2)
- Run PEC → EV2
- **Assert:** remains ACTIVE or POSSIBLE_END with invalidated CH candidate; **must not** RESTING with end=T0

`TEST_GAP_PROVEN=YES`

---

## Final report block

```
ROOT_CAUSE_PROVEN=YES
PRIMARY_ROOT_CAUSE_CLASS=COMBINATION(FSM_STATE_MACHINE_POLICY_DEFECT + CLICKHOUSE_ASSIST_REVALIDATION_DEFECT + EVENT_TIME_INGESTION_RACE)
PRIMARY_ROOT_CAUSE_FILE=backend/src/modules/vehicle-intelligence/trips/trip-detection-orchestration.service.ts
PRIMARY_ROOT_CAUSE_FUNCTION=processEndValidation (clickhouse_end_assist_skip_cusum) + assessActiveContinuity admission via ACTIVE_TRACKING
PRIMARY_ROOT_CAUSE_LINES=3430-3469 (EV2 skip); 1286-1297 trip-evidence.helpers.ts (first POSSIBLE_END admission)

FULL_INACTIVITY_PAUSE_ADMISSION_CAUSAL=YES
EV1_REOPEN_CAUSAL=CONTRIBUTING (cleared CH latch; empty-core re-latch followed)
RESUME_INVALIDATION_CAUSAL=YES
CLICKHOUSE_END_ASSIST_CAUSAL=YES
TELEMETRY_INGESTION_LATENCY_CAUSAL=CONTRIBUTING

RESUME_EVIDENCE_VISIBLE_BEFORE_EV2=UNKNOWN in live core; YES physically (~20:52:22 repair corroboration)
RESUME_EVIDENCE_CONSUMED_BEFORE_EV2=NO
OLD_END_CANDIDATE_REVALIDATED_AFTER_RESUME=NO

LIVE_NEW_TRIP_CREATED_AT_RESUME=NO
RECONCILIATION_SYNTHETIC_TRIP_CREATED_LATER=YES

PAUSE_SHADOW_MISSED_REAL_FAILURE=YES
PAUSE_SHADOW_GAP_ROOT_CAUSE=Shadow pause episodes only start on IDLE_WITHIN_TRIP/empty-core paths; path went ACTIVE->POSSIBLE_END via full_inactivity_ignition_off

MINIMAL_RED_TEST=trip-r12-ch-assist-resume-invalidation postgres-redis integration (see Phase I)
TEST_GAP_PROVEN=YES

RECOMMENDED_MINIMAL_FIX_DESIGN=Before clickhouse_end_assist_skip_cusum finalize, require checkDimoActivityResumed(resumeAfterAt=cusumSegmentEnd); if resumed, cancelPossibleEndForResumedActivity and clear CH latch
RECOMMENDED_ARCHITECTURAL_FIX_DESIGN=Mid-trip pause policy: ignition-off inactivity during ACTIVE should prefer IDLE_WITHIN_TRIP dwell before POSSIBLE_END; extend #1648 pause observability to ACTIVE->POSSIBLE_END inactivity admissions and EV2 skip path
REGRESSION_RISK=MEDIUM — must preserve legitimate CH end assist for true final stops; gate on post-boundary movement only

PRODUCTION_MUTATED=NO
TRIP_REPAIRED=NO
RUNTIME_CODE_CHANGED=NO
DEPLOYED=NO
MERGED=NO
```

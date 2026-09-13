# WOB L 7503 — POST-#1627 Physical Production Acceptance Audit

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-WOB7503-POST-1627-001 |
| **Source type** | PRODUCTION_OBSERVATION |
| **Audit mode** | STRICT READ-ONLY — no Production mutation |
| **Initial audit timestamp (UTC)** | `2026-09-13T10:44:09Z` |
| **Ground-truth correction (PR #1634)** | `2026-09-13` — operator clarified **two distinct physical drives** (~1 h stationary pause) |
| **Vehicle** | WOB L 7503 (`license_plate`: `WOB L  7503`) |
| **VEHICLE_ID** | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| **DIMO_TOKEN_ID** | `192922` |
| **Deploy release** | `20260913074250_v4994` |
| **Production SHA (both replicas)** | `9a32685d529bcc55e7163a8f0903ebdec358ebaf` (#1627 merge) |
| **PRODUCTION_MUTATED** | **NO** |
| **TRIP_REPAIRED** | **NO** (this audit) |
| **RUNTIME_CODE_CHANGED** | **NO** |

---

## Ground-truth correction (supersedes single-drive assumption)

**Initial audit error:** Treated `08:46Z → 10:23Z` as **one continuous physical drive**. Operator correction (PR #1634) establishes **two distinct physical trips** with approximately **one hour of stationary pause** between them.

| Field | Value |
|-------|-------|
| GROUND_TRUTH_CORRECTED | **YES** |
| FALSE_SPLIT_PREVIOUSLY_CLAIMED | **YES** (initial audit § Phase 1–2) |
| FALSE_SPLIT_ACTUALLY_OCCURRED | **NO** — **withdrawn**; two DB trips align with two real physical drives |

The FSM still executed `live_mid_trip_gap_split` @ `10:06:21Z` as the **mechanism** that closed Trip 1 and opened Trip 2 after a ~70 min gap. Under corrected ground truth this is **inter-trip separation**, not evidence of incorrectly splitting one continuous drive. Separate tracks remain open for **Trip 1 non-natural termination timing** and **Trip 2 end-candidate admission** — not reclassified here as false split.

### Operator physical intervals (correction; not telemetry-inferred)

| Interval | Physical start (UTC) | Physical end (UTC) | Europe/Berlin |
|----------|----------------------|--------------------|---------------|
| **Trip 1** | `2026-09-13T08:46:00Z` | `2026-09-13T08:54:00Z` (approx.; first drive parked) | ~10:46 → ~10:54 |
| **Trip 2** | `2026-09-13T10:05:00Z` (approx.; second drive departed) | `2026-09-13T10:23:00Z` (second drive parked) | ~12:05 → ~12:23 |

Operator mapping to DB rows (explicit in correction):

- **Trip A** `6c88e275…` ≈ `08:47Z–08:54Z` (~10:47–10:54 Berlin)
- **Trip B** `aaedd4a5…` start `10:05:10.641Z` (~12:05:10 Berlin)

| Field | Value |
|-------|-------|
| REAL_PHYSICAL_PAUSE_SECONDS | **~3600** (operator: ~1 h stationary) |
| DETECTED_INTER_TRIP_GAP_SECONDS | **4199** (`08:54:51.540Z` → `10:05:10.641Z`) |

---

## Phase 0 — Deployment identity (unchanged)

| Field | Value |
|-------|-------|
| CURRENT_MAIN_SHA | `df8d9d756d171b24bece564fd705bd570b3d4204` |
| PRODUCTION_SHA_A | `9a32685d529bcc55e7163a8f0903ebdec358ebaf` |
| PRODUCTION_SHA_B | `9a32685d529bcc55e7163a8f0903ebdec358ebaf` |
| SAME_SHA_ALL_REPLICAS | **YES** |
| DEPLOY_RELEASE | `20260913074250_v4994` |
| DEPLOYED_AT | `2026-09-13T07:43:28Z` (release tree); PM2 restart `2026-09-13T07:54:11Z` |
| PR_1627_PRESENT_IN_PRODUCTION | **YES** |
| PR_1617_PRESENT_IN_PRODUCTION | **YES** |
| PR_1603_PRESENT_IN_PRODUCTION | **YES** |

---

## Phase B — Per-trip mapping (corrected)

### Trip 1 — first physical drive

| Field | Value |
|-------|-------|
| TRIP_1_CANONICAL_ID | `6c88e275-ec07-46e5-b0eb-0a203286a200` |
| TRIP_1_PHYSICAL_START | `2026-09-13T08:46:00Z` |
| TRIP_1_PHYSICAL_END | `2026-09-13T08:54:00Z` (approx.) |
| TRIP_1_DETECTED_START | `2026-09-13T08:47:00.000Z` (`DIMO_SEGMENT`) |
| TRIP_1_DETECTED_END | `2026-09-13T08:54:51.540Z` (closed @ gap-split when Trip 2 detected) |
| TRIP_1_START_ERROR_SECONDS | **60** |
| TRIP_1_END_ERROR_SECONDS | **~52** (vs approx. physical end) |
| TRIP_1_START_ACCEPTABLE | **YES** |
| TRIP_1_END_ACCEPTABLE | **PARTIAL** — end timestamp close to physical stop, but closure **mechanism** was deferred gap-split @ `10:06:21Z`, not in-drive natural end cycle |
| TRIP_1_COMPLETED_NATURALLY | **NO** — `COMPLETED` via `live_mid_trip_gap_split` when second drive started; **0×** `END_VALIDATION` / `FINALIZE` on Trip 1 row |
| TRIP_1_FINAL_FSM_STATE | N/A at Trip 1 close — FSM continued on Trip 2 (`ACTIVE_TRIP`) |

Trip 1 tracking runs: **53×** `ACTIVE_TRACKING` only — no end-cycle runs before gap-split closure.

### Trip 2 — second physical drive (POST-#1627 acceptance subject)

| Field | Value |
|-------|-------|
| TRIP_2_CANONICAL_ID | `aaedd4a5-6502-4a8f-b871-5d51fed33c31` |
| TRIP_2_PHYSICAL_START | `2026-09-13T10:05:00Z` (approx.) |
| TRIP_2_PHYSICAL_END | `2026-09-13T10:23:00Z` |
| TRIP_2_DETECTED_START | `2026-09-13T10:05:10.641Z` |
| TRIP_2_STATUS_NOW @ initial audit | **ONGOING** |
| TRIP_2_START_ERROR_SECONDS | **~11** |
| TRIP_2_START_ACCEPTABLE | **YES** |

**Withdrawn initial claims:**

| Prior claim | Corrected status |
|-------------|------------------|
| `FALSE_SPLIT_OBSERVED=YES` | **WITHDRAWN** |
| `LIVE_MID_TRIP_GAP_SPLIT_OCCURRED=YES` (as false split) | **RECLASSIFIED** — FSM event occurred, but maps to **two real drives**, not a false split |
| Canonical trip started ~79 min late | **WITHDRAWN** — Trip 2 start ~11 s after operator second-drive departure |

---

## Phase C — Trip 2 end acceptance (POST-#1627 axis)

Audit window: after **Trip 2 physical stop** `2026-09-13T10:23:00Z` through initial audit `2026-09-13T10:44:09Z`. **Trip 1 stop is excluded** from Trip 2 end evidence.

### Trip 2 end timeline (after `10:23Z` physical stop)

| UTC time | Event | Source |
|----------|-------|--------|
| `10:12:10Z` | Brief trusted stop boundary latched (retired before Trip 2 final stop) | FSM / tracking runs |
| `10:15:00Z` | Boundary retired — post-boundary movement | FSM evidence |
| `10:16Z`–`10:23Z` | ACTIVE_TRACKING motion ticks | tracking runs |
| `10:23:32Z` | Last provider activity | FSM `lastProviderActivityAt` |
| `10:24Z`–`10:42Z` | `no_core_data_keep_open`, `emptyCoreDeferralStreak` 0→13, `vls_stale_provider_observation` | tracking runs |
| `10:44Z` | Audit: FSM `ACTIVE_TRIP`, `end_validation_attempts=0`, no `POSSIBLE_END` | PostgreSQL |

**Absent after Trip 2 physical stop:** `POSSIBLE_END`, `POSSIBLE_END_CHECK`, `END_VALIDATION`, `FINALIZE`, `RESTING`, `activeTripId` clear.

| Field | Value |
|-------|-------|
| TRIP_2_FIRST_TRUSTED_STOP_BOUNDARY_AT | `2026-09-13T10:12:10.623Z` (retired @ `10:15:00.982Z`; not active at final stop) |
| TRIP_2_POSSIBLE_END_REACHED | **NO** |
| TRIP_2_END_VALIDATION_RUN_COUNT | **0** |
| TRIP_2_FINALIZE_REACHED | **NO** |
| TRIP_2_COMPLETED | **NO** |
| TRIP_2_RESTING | **NO** |
| TRIP_2_ACTIVE_TRIP_ID_CLEARED | **NO** |

Trip 2 tracking run types: **ACTIVE_TRACKING** only (no `END_VALIDATION`).

**Classification:** **End-candidate admission / liveness failure** upstream of #1627 — empty-core deferral + stale VLS blocked `POSSIBLE_END` entry after true Trip 2 final stop. **Not** a #1627 retry-budget defect (path never entered).

---

## Phase D — #1627 classification (corrected)

| Field | Value |
|-------|-------|
| PR_1627_RETRY_ACCUMULATION_VALIDATED | **NOT_EXERCISED** |
| PR_1627_MAX_FALLBACK_PHYSICALLY_EXERCISED | **NO** |
| #1627 itself failed? | **NO** — insufficient evidence; retry-budget path never reached |
| ATTEMPT_COUNTER_RESET_LOOP_REPRODUCED | **NO** |

#1603 / #1617 on Trip 2: **NOT_OBSERVED** / **NOT_EXERCISED** (no EV runs). No repair applied to new trips (`PRODUCTION_MUTATED=NO`).

---

## Phase 12 — Corrected acceptance verdict

| Field | Value |
|-------|-------|
| POST_1627_PHYSICAL_ACCEPTANCE_VERDICT | **NOT_EXERCISED** (#1627 retry-budget path not reached) |
| TRIP_2_NATURAL_COMPLETION_VERDICT | **FAIL** (no `POSSIBLE_END` / `FINALIZE` / `RESTING` after Trip 2 physical stop @ audit +21 min) |
| FAILURE_BOUNDARY_IF_ANY | **END_CANDIDATE_ADMISSION_LIVENESS** (upstream of #1627) |
| CONFIDENCE | **HIGH** (for exercised boundaries); **N/A** for #1627 retry semantics |

### Why not PENDING (Trip 2)

Next scheduled event @ audit was empty-core `ACTIVE_TICK` deferral (~`632828ms`), **not** `POSSIBLE_END` or `END_VALIDATION`. Trip 2 physical stop + 21 min elapsed.

---

## Root-cause forensics — END_CANDIDATE admission liveness (PR #1634 addendum)

**Mode:** read-only code + Production tracking-run forensics @ `9a32685d529bcc55e7163a8f0903ebdec358ebaf`. **No runtime changes.**

### Phase A — Both real stops compared

#### Trip 1 (`6c88e275…`) — physical stop ~`08:54Z`

| Phase | First observation | Blocking predicate |
|-------|-------------------|-------------------|
| `08:49Z–08:56Z` | Core motion ticks; `stopBoundaryAt=null` | No provider stationary boundary latched during drive |
| `08:56:51Z` | First empty-core tick | `operational_inactivity_below_threshold` (119s < 120s); VLS **ACTIVE** @ `08:54:53Z` |
| `08:57:18Z`+ | Empty-core streak | **`vls_stale_provider_observation`** + **`stopBoundaryAt=null`** → KEEP_OPEN |
| `08:57Z–10:04Z` | Deferral streak **1→43** | Same branch every ~30s–10min; operational silence **>1h**; still ACTIVE_TRIP |
| `10:06:21Z` | **`live_mid_trip_gap_split`** | Trip 1 closed only when Trip 2 movement detected — **not** POSSIBLE_END |

**TRIP_1_FAILURE_BRANCH:** `processActiveTick` empty-core path → `assessSuccessfulEmptyCoreEndEligibility` → reject @ `vls_stale_provider_observation` with **no trusted stop boundary** → unbounded KEEP_OPEN deferral until accidental gap-split recovery.

#### Trip 2 (`aaedd4a5…`) — physical stop `10:23:00Z`

| Time (UTC) | FSM | Decision | Key forensics |
|------------|-----|----------|---------------|
| `10:12:10Z` | IDLE | boundary latched | `stopBoundaryAt=10:12:10.623Z`, trusted EVENT_TIME |
| `10:15:00Z` | ACTIVE | boundary **retired** | post-boundary movement @ `10:15:21Z` (correct #1617 behavior) |
| `10:16Z–10:23Z` | ACTIVE | `motion_detected` | `stopBoundaryAt=null`; no new boundary |
| `10:24:51Z` | ACTIVE | KEEP_OPEN | `operational_inactivity_below_threshold` (79s); VLS **ACTIVE** @ `10:23:33Z` |
| `10:26:20Z` | ACTIVE | **First indefinite block** | `operationalInactiveMs≥120s` BUT `innerGateReason=vls_stale_provider_observation`, **`stopBoundaryAt=null`**, streak **1** |
| `10:26Z–12:06Z`+ | ACTIVE | KEEP_OPEN repeat | streak **1→63+** @ extended read; still 0× POSSIBLE_END |

**TRIP_2_FAILURE_BRANCH:** Identical gate branch after final stop — stale VLS without a **current** trusted boundary.

| Field | Value |
|-------|-------|
| TRIP_1_FAILURE_BRANCH | `assessSuccessfulEmptyCoreEndEligibility` → `vls_stale_provider_observation` + no trusted boundary |
| TRIP_2_FAILURE_BRANCH | Same (after boundary retirement @ `10:15Z`) |
| SAME_FAILURE_CLASS | **YES** |

Trip 2 stale-VLS anchor after final stop:

| Field | Value |
|-------|-------|
| LAST_FRESH_VLS_AT | `2026-09-13T10:23:33.000Z` |
| LAST_FRESH_VLS_VALUE | persisted row; last sample before age-out (speed ~0, ICE profile) |
| STALE_VLS_AT_FIRST_EMPTY_CORE_AFTER_STOP | `2026-09-13T10:26:20.876Z` (`vlsObservationAgeMs=167617` > 120000) |
| STALE_VLS_VALUE | same frozen row @ `10:23:33Z` — classified UNKNOWN, **not** promoted to INACTIVE |

---

### Phase B — POSSIBLE_END admission contract (code truth table)

All ACTIVE→POSSIBLE_END paths route through `TripDetectionOrchestrationService.processActiveTick` @ `9a32685d…`.

| ADMISSION_PATH | REQUIRED_DATA | FRESHNESS | BOUNDARY | MOVEMENT | CLOCK | EMPTY_CORE | STALE_VLS |
|----------------|---------------|-----------|----------|----------|-------|------------|-----------|
| **A — Empty-core corroborated inactivity** | Fresh VLS **INACTIVE** + no perf/route contradiction | VLS age ≤ 120s | Optional | No post-boundary contradiction | PROVIDER_EVENT_TIME | **Yes** | Must **not** be stale UNKNOWN |
| **B — R12 boundary-backed provider silence** | Trusted boundary + operational silence ≥120s | Stale UNKNOWN (`vls_stale_provider_observation`) allowed | **Trusted boundary required** | No post-boundary movement | EVENT_TIME / PROVIDER | **Yes** | Stale OK **only with** latched trusted boundary |
| **C — Continuity assessment (core present)** | Scoped core points stopped + ignition off / resting freq | Core in window | `resumeAfterStopAt` if boundary exists | No scoped motion | Provider/core | **No** | N/A |
| **D — ClickHouse end assist** | CH segment end + inactivity | CH + VLS rules | CH segment end | Stationary | Mixed | Can run empty | Separate guard |
| **E — Motor-off pause path** | Perf stop → IDLE | Core/perf | May set idle boundary | — | Mixed | Partial | — |
| **F — Recovery / reconciliation** | STALE_ONGOING @ ~2h | — | — | — | — | — | — |

**Trip 1 evaluation:**

| Path | Result |
|------|--------|
| A | **BLOCKED** — VLS goes stale UNKNOWN; never fresh INACTIVE after stop |
| B | **BLOCKED** — `stopBoundaryAt` never latched (no fresh ignition-off stationary VLS during empty-core) |
| C | **BLOCKED** — core stream empty (no continuity points) |
| D | **NOT_OBSERVED** on Production forensics |
| E | **NOT_OBSERVED** — perf IDLE not reached before empty-core dominance |
| F | Not reached before gap-split @ 70 min |

**Trip 2 evaluation (after `10:23Z` stop only):**

| Path | Result |
|------|--------|
| A | **BLOCKED** — only stale sample @ `10:23:33Z`; line 417–418 reject |
| B | **BLOCKED** — prior boundary @ `10:12:10Z` **retired** @ `10:15Z`; no replacement boundary |
| C | **BLOCKED** — empty core after stop |
| D | **NOT_OBSERVED** |
| E | Brief IDLE @ `10:13–10:14` superseded by movement before final stop |
| F | Not reached @ audit (+21 min); would fire @ ~2h ONGOING |

---

### Phase C — Empty-core deferral policy (proven)

Decision site: `trip-detection-orchestration.service.ts` ~1988–2014 + `trip-empty-core-end-gate.ts` `reject()` ~362–418.

| Question | Answer |
|----------|--------|
| Evidence to stop deferring? | Gate `eligible=true` (path A or B above) **or** non-empty-core path (continuity/CH assist) |
| Max streak / time budget? | **No** — streak increments unboundedly on VLS-related rejects |
| Branch after budget exhaustion? | **None** — only capped **delay** (`computeEmptyCoreBackoffMs`, max **600s**) |
| ACTIVE_TRIP open indefinitely? | **YES** — proven Trip 1 streak **43** over **~70 min**; Trip 2 streak **63+** over **~100 min+** |
| Delay increases forever? | **No** — caps at ~600s ± jitter; but **decision** never changes |
| Watchdog for real stop + empty core? | **Only** `STALE_ONGOING` repair (~2h) and `live_mid_trip_gap_split` (new drive) |
| Stale VLS treatment | **UNKNOWN / absent corroboration** — explicit veto on path A; path B requires pre-existing boundary |

| Field | Value |
|-------|-------|
| EMPTY_CORE_DEFERRAL_BOUNDED | **NO** (decision-wise) |
| EMPTY_CORE_MAX_STREAK | **none** |
| EMPTY_CORE_MAX_DURATION | **none** |
| EMPTY_CORE_TERMINAL_FALLBACK_EXISTS | **NO** (within empty-core gate) |
| UNBOUNDED_ACTIVE_KEEP_OPEN_POSSIBLE | **YES** |

---

### Phase D — Stale VLS semantics

Classifier: `classifyEmptyCoreVlsInactivity` (`trip-empty-core-end-gate.ts` **136–142**) — age > `maxObservationAgeMs` (120s) → `UNKNOWN` / `vls_stale_provider_observation`. **Does not coerce to INACTIVE.**

| Field | Value |
|-------|-------|
| STALE_VLS_BLOCKS_POSSIBLE_END | **YES** when `stopBoundaryAt=null` (reject @ **417–418**) |
| STALE_VLS_IS_NEGATIVE_END_EVIDENCE | **NO** — not proof of movement; explicitly non-coercive |
| STALE_VLS_IS_MERELY_ABSENT_EVIDENCE | **YES** — UNKNOWN = insufficient corroboration |

**Why silence still cannot admit end:** R12 path B requires a **trusted boundary that survived** through the silence window. After movement retires the boundary, only path A remains — which requires a **fresh** INACTIVE VLS sample. LTE sleep after stop provides **neither** fresh INACTIVE nor a latched boundary → permanent KEEP_OPEN loop.

---

### Phase E — Stop boundary reconstruction gap

| Field | Value |
|-------|-------|
| NEW_BOUNDARY_AFTER_FINAL_STOP_CREATED | **NO** |
| IF_NO_EXACT_BLOCKING_PREDICATE | `resolveProviderStopBoundaryCandidate` requires **fresh** ignition-off stationary VLS (`maxFreshObservationAgeMs=120s`); after `10:23:33Z` sample ages out, candidate stays `null` — see `trip-fsm-r12-stop-boundary-end-liveness.spec.ts` **“stale stationary VLS does not establish a new active boundary”** |
| POST_MOVEMENT_TELEMETRY_SILENCE_DEAD_ZONE_EXISTS | **YES** |

**Dead zone predicate chain (Trip 2 after final stop):**

1. Credible movement @ `10:15Z` → correctly retires boundary (`retireActiveStopBoundaryAfterMovement`).
2. Final stop @ `10:23Z` → core empty; last provider activity @ `10:23:32Z`.
3. No fresh ignition-off stationary VLS arrives → **no new trusted boundary**.
4. VLS ages past 120s → `vls_stale_provider_observation`.
5. `assessSuccessfulEmptyCoreEndEligibility` @ **417–418** rejects UNKNOWN without boundary-backed escape.
6. Deferral repeats forever (delay capped, **decision not**).

**First broken lifecycle condition (Trip 2, after `10:23Z`):** @ `2026-09-13T10:26:20.876Z` — first tick with `operationalInactiveMs≥120s` **and** `stopBoundaryAt=null` **and** `innerGateReason=vls_stale_provider_observation`.

---

### Phase F — Gap-split as accidental recovery

| Field | Value |
|-------|-------|
| TRIP_1_NATURAL_END_FAILED | **YES** (0× POSSIBLE_END) |
| TRIP_1_GAP_SPLIT_RECOVERED_OPEN_TRIP | **YES** @ `10:06:21Z` |
| TRIP_1_WOULD_REMAIN_OPEN_WITHOUT_NEW_DRIVE | **PROVEN** — deferral streak **43** over **~70 min** with no POSSIBLE_END; only exit paths = gap-split, STALE_ONGOING (~2h), or manual repair |

Gap-split comment @ `trip-detection-orchestration.service.ts` **2041–2049** explicitly describes parked-engine-off restart — acts as **accidental inter-trip recovery**, not end-cycle admission.

---

### Phase G — Historical comparison

| Field | Value |
|-------|-------|
| SAME_CLASS_SEEN_PREVIOUSLY | **YES** |
| EARLIEST_KNOWN_PRODUCTION_EVIDENCE | KS MS 661 @ `684950419…` / `f7eb94cb…` — `vls_stale_provider_observation` + `no_core_data_keep_open` + 0× POSSIBLE_END (TDL-EVID-KS-MS-661-001, TDL-EVID-KS-MS-661-R11-NATURAL-001) |
| MASKED_BY_DOWNSTREAM_DEFECTS | **YES** on WOB POST-#1617 drive — 17× END_VALIDATION loop masked that the **same empty-core admission class** would have blocked re-entry after CUSUM reopen without boundary; POST-#1603 KS MS 661 reached POSSIBLE_END once then lost boundary on CUSUM reopen |

This WOB POST-#1627 case **isolates** the admission defect because #1627 path never ran.

---

### Phase H — Test gap + RED design (not implemented)

| Field | Value |
|-------|-------|
| EXISTING_TEST_COVERS_THIS | **NO** (partial only) |

**Partial coverage:**

- `trip-fsm-r12-stop-boundary-end-liveness.spec.ts` **K5** — stale UNKNOWN, no boundary → KEEP_OPEN (unit).
- `trip-r11-empty-core-completion-chain.postgres-redis.integration.spec.ts` **C** — requires **pre-seeded** trusted boundary.
- **Missing:** integration path = movement → boundary retirement → final stop → stale VLS → prolonged silence → **still ACTIVE_TRIP**.

**RED Postgres+Redis integration test design** (`trip-r12-post-stop-telemetry-silence-dead-zone.postgres-redis.integration.spec.ts` — **design only**):

1. Seed ACTIVE_TRIP with recent movement + `lastProviderActivityAt` at stop.
2. Inject final motion tick; retire any latched boundary via post-boundary movement fixture.
3. Stop core stream (`SUCCESS_EMPTY`); freeze VLS row @ stop timestamp.
4. Advance deterministic clock past 120s inactivity + multiple ACTIVE_TICK cycles with backoff.
5. Assert HEAD @ `9a32685d…` behavior:

```
RED_EMPTY_CORE_KEEP_OPEN_REPEATS=YES
RED_STALE_VLS_PRESENT=YES
RED_NO_POST_STOP_MOVEMENT=YES
RED_POSSIBLE_END_REACHED=NO
RED_ACTIVE_TRIP_REMAINS_OPEN=YES
```

---

### Phase I — Root-cause classification

| Field | Value |
|-------|-------|
| PRIMARY_ROOT_CAUSE_CLASS | **POST_MOVEMENT_TELEMETRY_SILENCE_DEAD_ZONE** |
| PRIMARY_ROOT_CAUSE_FILE | `backend/src/modules/vehicle-intelligence/trips/trip-empty-core-end-gate.ts` |
| PRIMARY_ROOT_CAUSE_FUNCTION | `assessSuccessfulEmptyCoreEndEligibility` |
| PRIMARY_ROOT_CAUSE_LINES | **417–418** (UNKNOWN reject when no trusted boundary); architectural coupling **379–414** (boundary-backed silence requires **pre-existing** trusted boundary — cannot reconstruct after retirement + telemetry silence) |
| PRIMARY_ROOT_CAUSE_PROVEN | **YES** (Production tracking runs + code + unit K5) |
| SECONDARY_CONTRIBUTOR | **EMPTY_CORE_DEFERRAL_UNBOUNDED** — no terminal admission fallback after repeated KEEP_OPEN; **STOP_BOUNDARY_RECONSTRUCTION_GAP** — `resolveProviderStopBoundaryCandidate` cannot latch boundary from stale VLS |

**PR #1627 status:** **NOT_EXERCISED** — not implicated.

---

### Phase J — Fix design options (NOT implemented)

#### 1. MINIMAL FIX — “Final-stop silence latch”

After credible final stop (operational silence ≥120s, empty core, stale VLS, no post-stop movement), allow **one-shot** trusted boundary at **`lastProviderActivityAt`** or **`lastMeaningfulMovementAt`** with `EVENT_TIME` authority **only when** no active boundary exists and VLS is stale-not-ACTIVE.

- **Admission authority:** empty-core gate path B extension — boundary sourced from last known provider activity, not stale VLS sample.
- **Timestamp authority:** last fresh provider event time (not worker clock).
- **False-end risk:** mitigated by movement invalidation + same retirement rules.
- **Stale-as-fresh protection:** stale VLS still not coerced to INACTIVE; boundary uses last **event-time anchor**, not stale speed/ignition reread.
- **Bounded liveness:** operational silence threshold already 120s; add max deferral streak → force POSSIBLE_END with LOW confidence flag.
- **#1617/#1627:** unchanged — retry budget only after POSSIBLE_END reached.
- **Rollback risk:** low — narrow predicate on telemetry-silence dead zone.

#### 2. ARCHITECTURAL FIX — “Provider silence episode FSM”

Introduce explicit sub-state `PROVIDER_SILENCE_EPISODE` between ACTIVE and POSSIBLE_END with bounded timers, CH assist, and structured fallbacks (R11 proposal `KS_MS_661_EMPTY_CORE_SOLUTION_PROPOSAL_2026-09-08.md` aligned).

- **Admission authority:** dedicated episode controller owns POSSIBLE_END candidacy.
- **Timestamp authority:** provider anchor registry (movement, boundary, last observation).
- **False-end risk:** lower long-term; higher implementation surface.
- **Bounded liveness:** first-class episode timeout + observability.
- **#1617/#1627:** preserved behind episode → POSSIBLE_END → END_VALIDATION chain.
- **Rollback risk:** medium — touches orchestration + tests + metrics.

| Field | Value |
|-------|-------|
| PREFERRED_FIX_DESIGN | **MINIMAL FIX** first (silence latch + optional deferral streak cap), then architectural episode FSM if fleet validation requires |
| READY_FOR_FIX_DESIGN | **YES** |

---

## Superseded initial audit chronology (preserved — do not delete)

> **Historical record @ `2026-09-13T10:44:09Z` before operator ground-truth correction.**

The initial audit assumed one continuous drive `08:46Z → 10:23Z` and reported:

- `FALSE_SPLIT_OBSERVED=YES`
- `LIVE_MID_TRIP_GAP_SPLIT_OCCURRED=YES` (classified as false split)
- `PHYSICAL_ACCEPTANCE_VERDICT=FAIL` (combined drive + false-split framing)
- `PR_1627_RETRY_ACCUMULATION_VALIDATED=NO` (interpreted as #1627 failure)

**Supersession reason:** Invalid ground-truth assumption (single continuous drive). Operator correction establishes two physical drives; false-split conclusions **withdrawn**. #1627 classification revised to **NOT_EXERCISED**, not failed. Trip 2 lifecycle failure reframed as **upstream end-candidate admission**.

Full initial phase text (deployment identity, PM2 gap-split log, tracking-run chronology, repair exclusion, old-trip isolation) remains valid as **runtime observation** — only **interpretation** is superseded.

Key runtime facts (still true):

- Deploy `9a32685d…` @ `20260913074250_v4994` on both replicas
- Gap-split PM2 log @ `10:06:20Z`: `firstEnd=08:54:51Z`, `secondStart=10:05:10Z`, `gap=4199s`
- Trip 2 @ audit: `ONGOING`, `ACTIVE_TRIP`, `end_validation_attempts=0`
- Historical trip `4083e24c…` isolation unchanged

---

## Historical failure class matrix (Trip 2 focus)

| Class | Trip 2 @ audit |
|-------|----------------|
| POST-#1617 PRE-#1627 retry budget reset loop | **Not reproduced** (0× EV) |
| POST-#1603 silent EV loss | **Not observed** |
| `live_mid_trip_gap_split` as **false** split | **Withdrawn** under corrected ground truth |
| Empty-core / stale VLS end-path block | **Observed** on Trip 2 after physical stop |
| Trip 1 deferred gap-split closure | **Observed** — separate from false split |

---

## Evidence methods

- Read-only PostgreSQL via VPS SSH (`synqdrive-admin` + sudo `backend.env`)
- PM2 logs: `/root/.pm2/logs/synqdrive-out*.log`, `synqdrive-b-out*.log`
- Operator ground-truth correction via PR #1634 review thread

## Related artifacts

- POST-#1617 failure: [WOB_L_7503_R12_RETRY_BUDGET_FIX_2026-09-12.md](WOB_L_7503_R12_RETRY_BUDGET_FIX_2026-09-12.md)
- #1627 CI proof: Trip FSM run `34743669617` @ `9a32685d…`

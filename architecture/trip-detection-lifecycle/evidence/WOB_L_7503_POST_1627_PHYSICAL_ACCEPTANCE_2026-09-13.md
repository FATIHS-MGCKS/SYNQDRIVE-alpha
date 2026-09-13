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

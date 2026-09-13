# WOB L 7503 — POST-#1627 Physical Production Acceptance Audit

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-WOB7503-POST-1627-001 |
| **Source type** | PRODUCTION_OBSERVATION |
| **Audit mode** | STRICT READ-ONLY — no Production mutation |
| **Audit timestamp (UTC)** | `2026-09-13T10:44:09Z` |
| **Physical ground truth date** | `2026-09-13` (Europe/Berlin) |
| **Physical start** | `2026-09-13T08:46:00Z` (10:46 Europe/Berlin) |
| **Physical stop** | `2026-09-13T10:23:00Z` (12:23 Europe/Berlin) |
| **Vehicle** | WOB L 7503 (`license_plate`: `WOB L  7503`) |
| **VEHICLE_ID** | `19fedd4b-c4e8-4de8-a125-dab293326e7e` |
| **DIMO_TOKEN_ID** | `192922` |
| **Organization** | `faa710c9-6d91-4079-a7d5-91fdccdec14a` |
| **Deploy release** | `20260913074250_v4994` |
| **Production SHA (both replicas)** | `9a32685d529bcc55e7163a8f0903ebdec358ebaf` (#1627 merge) |
| **origin/main at audit** | `df8d9d756d171b24bece564fd705bd570b3d4204` |
| **Prior failure trip (historical)** | `4083e24c-fc8f-4f56-8d95-a27d517169dc` (POST-#1617, 17× EV loop) |
| **Verdict** | **FAIL** |
| **PRODUCTION_MUTATED** | **NO** |
| **TRIP_REPAIRED** | **NO** (this audit) |

## Phase 0 — Deployment identity

| Field | Value |
|-------|-------|
| CURRENT_MAIN_SHA | `df8d9d756d171b24bece564fd705bd570b3d4204` |
| PRODUCTION_SHA_A | `9a32685d529bcc55e7163a8f0903ebdec358ebaf` (PM2 `synqdrive`, pid cluster A) |
| PRODUCTION_SHA_B | `9a32685d529bcc55e7163a8f0903ebdec358ebaf` (PM2 `synqdrive-b`, pid cluster B) |
| SAME_SHA_ALL_REPLICAS | **YES** — shared release `/opt/synqdrive/releases/20260913074250_v4994` |
| DEPLOY_RELEASE | `20260913074250_v4994` |
| DEPLOYED_AT | Release tree mtime `2026-09-13T07:43:28Z`; PM2 restart observed `2026-09-13T07:54:11Z` (replica A config log) |
| PR_1627_MERGE_SHA_PRESENT_IN_PRODUCTION_A | **YES** |
| PR_1627_MERGE_SHA_PRESENT_IN_PRODUCTION_B | **YES** |
| PR_1617_PRESENT_IN_PRODUCTION | **YES** (`b8663ba8a` ancestor of deploy HEAD) |
| PR_1603_PRESENT_IN_PRODUCTION | **YES** (`9e3a5a19c` ancestor of deploy HEAD) |

Deployment eligible for POST-#1627 acceptance audit.

## Phase 1 — Canonical trip identification

Two trip rows observed for the single physical drive — **false mid-gap split**.

| Trip ID | Status @ audit | Start (UTC) | End (UTC) | Role |
|---------|----------------|-------------|-----------|------|
| `6c88e275-ec07-46e5-b0eb-0a203286a200` | COMPLETED | `2026-09-13T08:47:00.000Z` | `2026-09-13T08:54:51.540Z` | First segment — terminated by `live_mid_trip_gap_split` |
| `aaedd4a5-6502-4a8f-b871-5d51fed33c31` | **ONGOING** | `2026-09-13T10:05:10.641Z` | `2026-09-13T10:24:20.627Z` (partial boundary extension only) | Second segment — **active trip @ audit** |

| Field | Value |
|-------|-------|
| CANONICAL_TRIP_ID (end-cycle subject) | `aaedd4a5-6502-4a8f-b871-5d51fed33c31` |
| TRIP_START_AT (canonical segment) | `2026-09-13T10:05:10.641Z` |
| TRIP_STATUS_NOW | **ONGOING** |
| TRIP_END_AT | `2026-09-13T10:24:20.627Z` (reconciliation-proposed extension; trip not COMPLETED) |
| TRIP_COMPLETED_AT | **NULL** |
| OVERLAPPING_TRIP_COUNT | **2** (same physical drive window) |
| FALSE_SPLIT_OBSERVED | **YES** |
| DUPLICATE_TRIP_OBSERVED | **NO** (split pair, not duplicate rows) |

**Gap split evidence (replica B, PM2):**

```
2026-09-13T10:06:20Z TripDecisionEngine Trip SPLIT ON GAP
  firstId=6c88e275… secondId=aaedd4a5…
  firstEnd=2026-09-13T08:54:51.540Z secondStart=2026-09-13T10:05:10.641Z
  gap=4199s trigger=LIVE_FSM reason=live_mid_trip_gap_split
```

Tracking run `2de8f7ec-…` @ `2026-09-13T10:06:21.138Z` records identical split metadata (`gapMs=4199101`, `decision=APPLIED`).

**Prior POST-#1617 trip isolation:** Historical trip `4083e24c…` was `STALE_ONGOING` repaired `2026-09-12T21:21:32Z`. No cross-trip boundary leak or stale end-cycle token acceptance observed on the new drive.

## Phase 2 — Start accuracy

| Field | Value |
|-------|-------|
| PHYSICAL_START_AT | `2026-09-13T08:46:00Z` |
| DETECTED_START_AT | `2026-09-13T08:47:00.000Z` (trip `6c88e275…`, `startSource=DIMO_SEGMENT`) |
| START_ERROR_SECONDS | **60** |
| START_ACCEPTABLE | **YES** (within normal DIMO segment boundary adjustment) |
| Detection source/mode | `IGNITION_PRIMARY` / `DIMO_SEGMENT` / `DIMO_ONLY` / `SnapshotEvidenceEvaluator` |
| START_FALSE_SPLIT_REPRODUCED | **YES** |
| LIVE_MID_TRIP_GAP_SPLIT_OCCURRED | **YES** @ `2026-09-13T10:06:21Z` |

First-segment start is acceptable. The **70-minute telemetry gap** after `08:54:51Z` (empty-core deferral streak on trip `6c88e275…`) triggered `live_mid_trip_gap_split`, creating spurious second trip `aaedd4a5…` at `10:05:10Z` — **separate failure class** from #1627 retry budget, but it prevents a single canonical trip for the physical drive.

## Phase 3 — End timeline (`10:15Z` → audit `10:44Z`)

**No end-cycle progression occurred.** FSM remained `ACTIVE_TRIP` throughout.

| UTC time | Event | Source |
|----------|-------|--------|
| `10:06:21Z` | `live_mid_trip_gap_split` → new trip `aaedd4a5…` | PM2 replica B + tracking run |
| `10:06:52Z`–`10:12:51Z` | ACTIVE_TRACKING: `motion_detected` (ongoing movement) | `vehicle_trip_tracking_runs` |
| `10:13:21Z` | ACTIVE → IDLE_WITHIN_TRIP (`stopped_perf_active`) | tracking run `7fd9d3dd…` |
| `10:14:20Z` | Trusted stop boundary latched `stopBoundaryAt=2026-09-13T10:12:10.623Z` | tracking runs `5b8ebf02…`, `ae676516…` |
| `10:15:00.982Z` | Boundary **retired** — `stopBoundaryRetiredByMovementAt` (post-boundary motion) | FSM `last_evidence_summary` |
| `10:15:21Z` | ACTIVE reopen (`motion_detected`, boundary cleared) | tracking run `f83624fd…` |
| `10:16Z`–`10:23Z` | Continued ACTIVE_TRACKING motion ticks | tracking runs |
| `10:23:32Z` | Last provider activity (`lastProviderActivityAt`) | FSM evidence |
| `10:24:20Z` | Trip `end_time` set via reconciliation boundary extension proposal (SUPPRESSED repair) | `trip_repairs` + trip row |
| `10:24Z`–`10:42Z` | ACTIVE_TRACKING: `no_core_data_keep_open`, `emptyCoreDeferralStreak` 0→13, `vls_stale_provider_observation` | tracking runs |
| `10:44Z` | Audit snapshot: FSM `ACTIVE_TRIP`, `end_validation_attempts=0`, no POSSIBLE_END | PostgreSQL |

**Absent events (zero occurrences):** `POSSIBLE_END`, `POSSIBLE_END_CHECK`, `END_VALIDATION`, `FINALIZE`, `CUSUM`, terminal `RESTING`.

## Phase 4 — Stop boundary

| Field | Value |
|-------|-------|
| PHYSICAL_STOP_AT | `2026-09-13T10:23:00Z` |
| FIRST_TRUSTED_STOP_BOUNDARY_AT | `2026-09-13T10:12:10.623Z` (brief; retired @ `10:15:00.982Z`) |
| STOP_BOUNDARY_ERROR_SECONDS | **649** (vs physical stop, while boundary was latched) |
| STOP_BOUNDARY_SOURCE | `idle_within_trip_last_movement` |
| STOP_BOUNDARY_CLOCK_AUTHORITY | `EVENT_TIME` |
| STOP_BOUNDARY_TRUST | **true** (when latched) |
| WORKER_TIME_FALSE_BOUNDARY_OBSERVED | **NO** |
| CREDIBLE_POST_BOUNDARY_MOVEMENT_OCCURRED | **YES** — motion @ `10:15:21Z` after boundary @ `10:12:10Z` |

Boundary retirement is **correct behavior** per #1617 movement guard — but trip never re-entered end candidacy after final stop @ `10:23Z`.

## Phase 5 — END_VALIDATION attempt sequence (#1627 primary axis)

**Zero END_VALIDATION runs** on `2026-09-13` for this vehicle:

```
run_type counts (2026-09-13 08:00Z+):
  POSSIBLE_START_VALIDATION: 3
  ACTIVE_TRACKING: 97
  END_VALIDATION: 0
  POSSIBLE_END_CHECK: 0
  FINALIZATION_CHECK: 0
```

| Field | Value |
|-------|-------|
| END_VALIDATION_RUN_COUNT | **0** |
| COMPLETED_ATTEMPTS_SEQUENCE | **[]** (empty — not exercised) |
| PERSISTED_ATTEMPTS_SEQUENCE | **[]** (empty — not exercised) |
| ATTEMPT_COUNTER_ACCUMULATES | **NOT_APPLICABLE** |
| ATTEMPT_COUNTER_RESET_LOOP_REPRODUCED | **NO** (no EV runs; #1617 loop class not reproduced, but fix not proven either) |
| CUSUM_STILL_ONGOING_COUNT | **0** |

## Phase 6 — #1627 max-attempt fallback

| Field | Value |
|-------|-------|
| MAX_ATTEMPTS_CONFIGURED | **3** (PM2 config log @ deploy: `validationMaxAttempts=3`) |
| THREE_COMPLETED_CUSUM_ATTEMPTS_REACHED | **NO** |
| MAX_ATTEMPT_FALLBACK_REACHED | **NOT_APPLICABLE** |
| MAX_ATTEMPT_FALLBACK_AT | — |
| MAX_ATTEMPT_FALLBACK_REASON | — |
| EV4_SCHEDULED | **NO** |
| EV4_EXECUTED | **NO** |
| PR_1627_RETRY_ACCUMULATION_VALIDATED | **NO** |
| PR_1627_MAX_FALLBACK_PHYSICALLY_EXERCISED | **NO** |

## Phase 7 — #1617 non-regression

End-cycle never reached CUSUM evaluation on this drive.

| Field | Value |
|-------|-------|
| BOUNDARY_PRESERVED_AFTER_EV1 | **NOT_APPLICABLE** |
| BOUNDARY_PRESERVED_AFTER_EV2 | **NOT_APPLICABLE** |
| BOUNDARY_PRESERVED_AFTER_EV3 | **NOT_APPLICABLE** |
| POSSIBLE_END_REENTRY_AFTER_CUSUM | **NOT_APPLICABLE** |

Brief trusted boundary @ `10:12:10Z` was correctly retired after credible post-boundary movement @ `10:15Z` — not a #1617 regression.

## Phase 8 — #1603 non-regression

| Field | Value |
|-------|-------|
| END_VALIDATION_PROCESSOR_ENTRY_COUNT | **0** |
| END_VALIDATION_TRACKING_RUN_COUNT | **0** |
| END_VALIDATION_LOCK_MISS_COUNT | **0** (2026-09-13 WOB logs) |
| EV_LOCK_MISS_MOVED_TO_DELAYED_COUNT | **0** |
| SILENT_END_AUTHORITY_LOSS_OBSERVED | **NO** |
| PEC_SCHEDULE_WHILE_WORKER_LOCK_HELD | **NO** (no PEC/EV activity) |
| PR_1603_REGRESSION_STATUS | **NOT_OBSERVED** — no end-cycle to regress |

## Phase 9 — Terminal chain

| Field | Value |
|-------|-------|
| FINALIZE_REACHED | **NO** |
| FINALIZE_AT | — |
| FINALIZE_COMPLETED | **NO** |
| TRIP_COMPLETED_NATURALLY | **NO** |
| TRIP_COMPLETED_AT | — |
| FINAL_TRIP_END_AT | — |
| RESTING_REACHED | **NO** |
| RESTING_REACHED_AT | — |
| ACTIVE_TRIP_ID_CLEARED | **NO** (`aaedd4a5…` still active) |
| FINAL_FSM_STATE | **ACTIVE_TRIP** |
| POSSIBLE_END_FIRST_AT | **never** |
| PHYSICAL_STOP_TO_FIRST_POSSIBLE_END_SECONDS | **N/A** (no POSSIBLE_END) |
| PHYSICAL_STOP_TO_FINALIZE_SECONDS | **N/A** |
| PHYSICAL_STOP_TO_COMPLETED_SECONDS | **N/A** |
| PHYSICAL_STOP_TO_RESTING_SECONDS | **N/A** |

Physical stop + **21 minutes** @ audit with no scheduled end-cycle event — not legitimately PENDING.

## Phase 10 — Repair exclusion

| Field | Value |
|-------|-------|
| MANUAL_REPAIR_USED | **NO** |
| STALE_ONGOING_REPAIR_USED | **NO** (on new trips) |
| RECONCILIATION_REPAIR_USED | **NO** (proposals SUPPRESSED only) |
| FORCED_COMPLETION_USED | **NO** |
| NORMAL_END_CYCLE_ONLY | **NO** — end cycle never ran; trip still ONGOING |

Reconciliation audit rows (all **SUPPRESSED**, not applied):

- `PARTIAL_TRIP_BOUNDARY_EXTENSION` @ `09:09:20Z` on trip `6c88e275…`
- `PARTIAL_TRIP_BOUNDARY_EXTENSION` @ `10:39:20Z` on trip `aaedd4a5…`
- `MISSING_TRIP` duplicates suppressed @ `08:54:21Z`, `10:24:20Z`

## Phase 11 — Old WOB failure isolation

| Field | Value |
|-------|-------|
| OLD_TRIP_ID | `4083e24c-fc8f-4f56-8d95-a27d517169dc` |
| OLD_TRIP_REPAIRED | **YES** (historical `STALE_ONGOING` @ `2026-09-12T21:21:32Z`) |
| OLD_END_CYCLE_JOB_AFFECTED_NEW_TRIP | **NO** |
| CROSS_TRIP_BOUNDARY_LEAK | **NO** |
| STALE_END_CYCLE_TOKEN_ACCEPTED | **NO** |

## Phase 12 — Acceptance verdict

| Field | Value |
|-------|-------|
| PHYSICAL_ACCEPTANCE_VERDICT | **FAIL** |
| CONFIDENCE | **HIGH** |
| Primary failure | End-cycle never entered — **0× END_VALIDATION**; trip stuck `ACTIVE_TRIP` with empty-core / stale-VLS deferral after physical stop |
| #1627 status | Deploy present; retry-budget fix **not physically validated** |
| Secondary failure (documented separately) | `live_mid_trip_gap_split` reproduced — two trips for one physical drive |
| Separate open track | `emptyCoreDeferralStreak` + `vls_stale_provider_observation` blocked end candidacy (same class as KS MS 661 R11 Axis E) |

### Why not PENDING

Next scheduled lifecycle event is another `ACTIVE_TICK` empty-core deferral (~`632828ms` delay from `10:42:20Z`), **not** POSSIBLE_END or END_VALIDATION. Physical stop deadline (`10:23Z`) + 21 min elapsed — end-cycle liveness failure, not awaitable acceptance.

## Historical failure class matrix (unchanged)

| Class | Period | This drive |
|-------|--------|------------|
| PRE-#1600 clock durability | — | Not observed |
| POST-#1600 PRE-#1603 PEC lock / silent EV loss | — | Not observed (no EV) |
| POST-#1603 PRE-#1617 CUSUM boundary strip | — | Not observed (no CUSUM) |
| POST-#1617 PRE-#1627 retry budget reset loop | POST-#1617 trip `4083e24c…` | **Not reproduced** (no EV runs) |
| `live_mid_trip_gap_split` false split | Prior WOB drives | **REPRODUCED** |
| Empty-core / stale VLS end-path block | KS MS 661 R11 | **Observed** (blocks end entry) |

## Evidence methods

- Read-only PostgreSQL queries via VPS SSH (`synqdrive-admin` + sudo `backend.env`)
- PM2 logs: `/root/.pm2/logs/synqdrive-out*.log`, `synqdrive-b-out*.log`
- Production release SHA: `/opt/synqdrive/releases/20260913074250_v4994`
- **PRODUCTION_MUTATED=NO**, **TRIP_REPAIRED=NO**

## Related artifacts

- POST-#1617 failure: [WOB_L_7503_R12_RETRY_BUDGET_FIX_2026-09-12.md](WOB_L_7503_R12_RETRY_BUDGET_FIX_2026-09-12.md)
- #1627 CI proof: Trip FSM run `34743669617` @ merge SHA `9a32685d…`
- Deploy: release `20260913074250_v4994`

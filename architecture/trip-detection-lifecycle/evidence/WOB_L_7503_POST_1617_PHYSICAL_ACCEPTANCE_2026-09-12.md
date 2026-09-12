# WOB L 7503 — POST-#1617 physical drive acceptance audit (2026-09-12)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-WOB7503-POST-1617-001 |
| **Source type** | PRODUCTION_OBSERVATION (read-only) |
| **Audited production SHA** | `a8320f2cabccf7dbeb38cab5afdfc6ee00abdea0` (release `20260912194023_v4994`) |
| **PR #1617 merge** | `b8663ba8a0dc7ff2701857514ac897dcc0bd150f` — confirmed ancestor of deployed SHA (repository verification) |
| **Deploy capturedAt (UTC)** | `2026-09-12T19:40:23Z` (release id `20260912194023_v4994`) |
| **Audit observedAt (UTC)** | `2026-09-12T20:30:03Z` (bounded read-only snapshot; no polling loop) |
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
| CREDIBLE_POST_BOUNDARY_MOVEMENT_OCCURCED | **NO** (`lastMeaningfulMovementAt` frozen at 19:53:02; post-stop `speed=16` / ignition ON in evidence carries `vlsObservationAgeMs` > 30 min — stale provider read, not boundary retirement) |
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
3. **New/open defect class:** persistent `cusum_still_ongoing` despite trusted provider stop boundary + repeated empty-core POSSIBLE_END re-entry (root cause **not proven** in this audit; not #1603 lock-order, not #1617 strip regression).

## Explicit non-actions

- Did **not** repair trip `4083e24c…` or `802a54ba…` on Production.
- Did **not** deploy, mutate DB/Redis/PM2, enqueue jobs, or manually finalize.

## Related evidence

- KS MS 661 POST-#1603 acceptance: [KS_MS_661_R12_POST_1603_PHYSICAL_ACCEPTANCE_2026-09-12.md](KS_MS_661_R12_POST_1603_PHYSICAL_ACCEPTANCE_2026-09-12.md)
- CUSUM boundary preservation fix: [KS_MS_661_R12_POST_1603_CUSUM_RETRY_FAILURE_2026-09-12.md](KS_MS_661_R12_POST_1603_CUSUM_RETRY_FAILURE_2026-09-12.md)
- Raw audit log: `/opt/cursor/artifacts/wob-l-7503-post-1617-audit-raw.log`

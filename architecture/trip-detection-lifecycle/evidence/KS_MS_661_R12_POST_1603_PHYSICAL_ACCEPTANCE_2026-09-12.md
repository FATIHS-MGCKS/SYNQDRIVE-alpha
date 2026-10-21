# KS MS 661 — R12 POST-#1603 physical drive acceptance audit (2026-09-12)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-KS661-POST-1603-001 |
| **Source type** | PRODUCTION_OBSERVATION (read-only) |
| **Audited production SHA** | `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50` (release `20260911234818_v4994`) |
| **PR #1603 merge** | `9e3a5a19c` — confirmed ancestor of deployed SHA |
| **Deploy capturedAt (UTC)** | `2026-09-11T23:58:46Z` |
| **Audit observedAt (UTC)** | `2026-09-12T05:17:03Z` (terminal DB snapshot; no polling loop) |
| **Vehicle** | KS MS 661 — Audi A4; `vehicleId` `c10351f8-b6a2-4258-947f-631aeaa6d359`; DIMO `tokenId` **187361** |
| **Canonical tripId** | `a05fa903-9ea7-4f20-8281-5cf185233c1a` |
| **dimo_segment_id** | `dimo-seg-187361-1789187460000` |
| **Classification** | **FAIL_PENDING_FIX** — superseded by [CUSUM retry root-cause audit](KS_MS_661_R12_POST_1603_CUSUM_RETRY_FAILURE_2026-09-12.md); #1603 lock-order class **not reproduced** |

## Operator ground truth (Europe/Berlin CEST = UTC+02:00)

| Label | Local | UTC |
|-------|-------|-----|
| Driver start | ~06:31 | ~04:31 |
| Driver stop | ~07:06 | ~05:06 |

Forensic window: **`2026-09-12T04:15:00Z` → `2026-09-12T05:30:00Z`**

## Phase 0 — deployment eligibility

| Field | Value |
|-------|-------|
| PRODUCTION_SHA_REPLICA_A | `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50` |
| PRODUCTION_SHA_REPLICA_B | `f6f5eaa3a9fd9525d10b5d0b8130e7ed42eeaa50` |
| SAME_SHA_ALL_REPLICAS | YES |
| PR_1603_PRESENT_IN_PRODUCTION_TREE | YES (`9e3a5a19c` ancestor) |
| DEPLOYED_BEFORE_DRIVE | YES (~4h40m before canonical start) |

Deployed bundle markers (read-only grep of `trip-detection-orchestration.service.js`):

- `deferredEndValidation=YES`
- `deferredFinalize=YES`
- `TripTrackingHandoffLockContentionError=YES`
- END_VALIDATION / FINALIZE lock-miss throw paths present

## Phase 1 — canonical trip

| Field | Value |
|-------|-------|
| TRIP_CANDIDATE_COUNT | 1 |
| SINGLE_CANONICAL_TRIP | YES |
| FALSE_SPLIT_OCCURRED | NO |
| DUPLICATE_TRIP_OCCURRED | NO |
| TRIP_START_AT | `2026-09-12T04:31:00.000Z` |
| TRIP_START_VALID | YES |
| TRIP_START_ERROR_SECONDS | 0 (vs driver ~06:31 Berlin) |
| TRIP_STATUS (audit) | ONGOING |
| TRIP_END_AT (column) | `2026-09-12T05:07:33.056Z` (non-terminal write; status still ONGOING) |

Start authority: DIMO segment + ClickHouse assist; `startSource=DIMO_SEGMENT`, `evidencePath=DIMO_PLUS_CLICKHOUSE`, `startRecognizedAt=2026-09-12T04:37:41.633Z`, segment candidate `2026-09-12T04:37:36.000Z`, effective boundary `2026-09-12T04:31:00.000Z` (`startBoundaryAdjustedMs=-396000`).

## Phase 2 — stop boundary

| Field | Value |
|-------|-------|
| PHYSICAL_END_GROUND_TRUTH | ~07:06 Europe/Berlin (~05:06 UTC) |
| LAST_MEANINGFUL_MOVEMENT_AT | `2026-09-12T05:06:52.636Z` |
| STOP_BOUNDARY_AT | `2026-09-12T05:06:59.000Z` (provider VLS observation in evidence) |
| STOP_BOUNDARY_SOURCE | `stationary_ignition_off_qualified` |
| STOP_BOUNDARY_CLOCK_AUTHORITY | `PROVIDER_EVENT_TIME` |
| STOP_BOUNDARY_TRUST | true |
| STOP_BOUNDARY_VALID | YES |
| END_ERROR_VS_DRIVER_SECONDS | ~52 (movement anchor vs ~05:06 operator minute) |

## Phase 3 — POSSIBLE_END + PE clocks

| Field | Value |
|-------|-------|
| POSSIBLE_END_REACHED | YES |
| POSSIBLE_END_FIRST_AT | `2026-09-12T05:09:02.763Z` (PM2 `phase=possible_end_entered`) |
| POSSIBLE_END_AT (log/evidence) | `2026-09-12T05:06:59.000Z` |
| POSSIBLE_END_ENTERED_AT (log/evidence) | `2026-09-12T05:09:02.763Z` |
| PE_CLOCKS_PRESENT_WHILE_POSSIBLE_END | YES (timeline log + evidence JSON at entry) |
| PE_CLOCKS_DURABLE (DB columns at audit) | NO — columns NULL after revert to ACTIVE_TRIP |
| CLOCK_LOSS_OBSERVED_THIS_DRIVE | NO destructive NULL while state remained POSSIBLE_END; columns cleared on intentional ACTIVE revert after CUSUM |
| RECONCILIATION_REPAIR_USED | NO |
| LIFECYCLE_RECOVERY_USED (end) | NO |

## Phase 4 — #1603 PEC → END_VALIDATION (primary test)

| Field | Value |
|-------|-------|
| PEC_RUN_COUNT | 1 |
| CUSUM_TRIGGER_COUNT | 1 |
| END_VALIDATION_SCHEDULE_CALL_COUNT | 1 (PM2 `phase=end_validation_scheduled`) |
| END_VALIDATION_QUEUE_ADD_SUCCESS_COUNT | 1 (inferred; worker pickup succeeded) |
| END_VALIDATION_WORKER_PICKUP_COUNT | 1 |
| END_VALIDATION_PROCESSOR_ENTRY_COUNT | 1 |
| END_VALIDATION_TRACKING_RUN_COUNT | **1** (290 ms) |
| END_VALIDATION_FIRST_AT | `2026-09-12T05:11:03.781Z` |
| END_VALIDATION_COMPLETED | NO |
| SCHEDULE_WHILE_PEC_LOCK_HELD_OBSERVED | **NO** |
| END_VALIDATION_LOCK_ACQUIRED | YES (tracking run persisted) |
| END_VALIDATION_LOCK_MISS_COUNT | 0 |
| LOCK_MISS_MOVED_TO_DELAYED_COUNT | 0 |
| LOCK_MISS_RETRY_COUNT | 0 |
| SILENT_END_AUTHORITY_LOSS_OBSERVED | **NO** |
| ACTIVE_JOB_REMOVE_ATTEMPTED | NO |
| LOCKED_JOB_REMOVE_EXCEPTION | NO |
| MULTI_REPLICA_AUTHORITY_CONFLICT | NO |
| DUPLICATE_END_AUTHORITY | NO |
| ORPHANED_END_CYCLE_AUTHORITY | NO |

**Contrast with pre-#1603 POST-#1600 drive (`fc93f98f…`):** 15/15 EV processor entries, **0** tracking runs, stuck POSSIBLE_END. **Not reproduced.**

## Phase 5 — END_VALIDATION result

| Field | Value |
|-------|-------|
| END_VALIDATION_REACHED | YES |
| END_VALIDATION_STARTED | YES |
| END_VALIDATION_COMPLETED | NO |
| CUSUM_ATTEMPTS_COMPLETED | 1 |
| CUSUM_RESULT | `cusum_still_ongoing` |
| END_VALIDATION_RESULT_STATE | ACTIVE_TRIP (revert) |
| END_VALIDATION_REASON | `CUSUM indicates trip is still active` |

PM2: `CUSUM: trip … still appears ongoing — returning to ACTIVE_TRIP (completedAttempt=1)` @ `2026-09-12T05:11:03Z`.

## Phase 6 — FINALIZE

| Field | Value |
|-------|-------|
| FINALIZE_SCHEDULED | NO |
| FINALIZE_WORKER_PICKUP | 0 |
| FINALIZE_PROCESSOR_ENTRY | 0 |
| FINALIZE_REACHED | NO |
| FINALIZE_COMPLETED | NO |
| PRIMARY_FINALIZE_SILENT_LOSS_OBSERVED | NO |

## Phase 7 — terminal FSM (audit snapshot)

| Field | Value |
|-------|-------|
| CURRENT_FSM_STATE | ACTIVE_TRIP |
| CURRENT_TRIP_STATUS | ONGOING |
| RESTING_REACHED | NO |
| ACTIVE_TRIP_ID_CURRENT | `a05fa903-9ea7-4f20-8281-5cf185233c1a` |
| ACTIVE_TRIP_ID_CLEARED | NO |
| POSSIBLE_END_AT_CURRENT | NULL |
| POSSIBLE_END_ENTERED_AT_CURRENT | NULL |
| PENDING_END_CYCLE_JOBS | not exhaustively enumerated (read-only); no lock-contention signatures in logs |

## Phase 8 — repair exclusion

| Field | Value |
|-------|-------|
| STALE_ONGOING_REPAIR_USED | NO |
| STALE_FINALIZE_REPAIR_USED | NO |
| MANUAL_REPAIR_USED | NO |
| RECONCILIATION_REPAIR_USED | NO |
| LIFECYCLE_RECOVERY_USED | NO (startEpisode metadata only) |
| NORMAL_END_CYCLE_ONLY | YES |

**Context (non-repair):** EXP-021 reference-capture orchestrator held vehicle-scoped lock `04:34:02Z` → `05:07:12Z` (shadow/reference capture). Released **before** `possible_end_entered`. No STALE/reconcile/finalize repair log lines for this trip.

## Phase 9 — timeline (UTC / Berlin)

| Event | UTC | Berlin |
|-------|-----|--------|
| Driver start (operator) | ~04:31 | ~06:31 |
| Canonical start (trip row) | 04:31:00 | 06:31:00 |
| Start recognized | 04:37:41 | 06:37:41 |
| Driver stop (operator) | ~05:06 | ~07:06 |
| Last meaningful movement | 05:06:52 | 07:06:52 |
| Stop boundary (provider) | 05:06:59 | 07:06:59 |
| POSSIBLE_END entered | 05:09:02 | 07:09:02 |
| PEC / CUSUM trigger | 05:11:03 | 07:11:03 |
| END_VALIDATION processor | 05:11:03 | 07:11:03 |
| CUSUM → ACTIVE revert | 05:11:03 | 07:11:03 |
| Audit snapshot | 05:17:03 | 07:17:03 |

Latencies:

| Metric | Seconds |
|--------|---------|
| START_ERROR_SECONDS | 0 |
| STOP_BOUNDARY_ERROR_SECONDS | ~52 |
| STOP_TO_POSSIBLE_END_SECONDS | ~130 |
| POSSIBLE_END_TO_EV_SECONDS | ~121 |
| EV_TO_FINALIZE_SECONDS | n/a |
| STOP_TO_COMPLETED_SECONDS | n/a |

## Phase 10 — verdict

```
R12_PHYSICAL_ACCEPTANCE_VERDICT=FAIL_PENDING_FIX
CONFIDENCE=HIGH (forensic snapshot + follow-up @ 05:31Z; bounded read-only queries)
```

**Verdict (updated after follow-up @ ~05:20–05:31Z):**

- **PASS criteria not met:** trip not COMPLETED, FSM not RESTING, no FINALIZE, no natural terminal chain.
- **#1603 lock-order class not reproduced:** END_VALIDATION **executed** (1 tracking run); no silent lock-miss authority loss.
- **New POST-#1603 defect class confirmed:** CUSUM attempt 1 → `cusum_still_ongoing` → ACTIVE reopen strips `stopBoundaryAt` → empty-core KEEP_OPEN under stale VLS → no POSSIBLE_END re-entry → CUSUM attempts 2–3 never occur. See [KS_MS_661_R12_POST_1603_CUSUM_RETRY_FAILURE_2026-09-12.md](KS_MS_661_R12_POST_1603_CUSUM_RETRY_FAILURE_2026-09-12.md).

**#1603 historical failure classes:** `#1600` PE clock loss on stop, `#1603` PEC-held zero-delay EV silent lock miss — **neither reproduced** on this drive.

## Explicit non-actions

- Did **not** repair trip `a05fa903…` on Production.
- Did **not** deploy, mutate DB/Redis/PM2, enqueue jobs, or manually finalize.

## Related evidence

- Supersedes **OPEN** status of TDL-EVID-R12-KS661-DISPATCH-GAP-001 for the **#1603 lock-order failure class** only (still historical for trip `fc93f98f…`).
- Pre-#1603 acceptance failures preserved: TDL-EVID-R12-KS661-ACCEPT-FAIL-001, DISPATCH-GAP-001.

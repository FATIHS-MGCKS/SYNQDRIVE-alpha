# KS MX 2024 — POST-#1648 Production Shadow Audit (2026-09-16)

| Field | Value |
|-------|-------|
| **Evidence ID** | TDL-EVID-R12-KS-MX-POST-1648-001 |
| **Source type** | PRODUCTION_OBSERVATION (strict read-only) |
| **Audit date (operator TZ)** | 2026-09-16 (Europe/Berlin, CEST) |
| **Vehicle** | KS MX 2024 · `vehicle_id=a60c0749-a7cd-494e-b5b9-dea3c6b97d63` · DIMO token `187336` |
| **Mode** | STRICT READ_ONLY — no Production mutation, repair, deploy, or code change |
| **Related PRs** | #1648 shadow observability (deployed); #1635 provider-silence counterfactual (shadow-only) |

## Executive summary

Two operator-ground-truth drives on 2026-09-16 were audited against Production PostgreSQL tracking runs, trip rows, reconciliation repairs, compiled release artifacts, and persisted shadow payloads.

| Drive | Authoritative lifecycle | #1648 pause shadow | #1648 provider-silence shadow |
|-------|-------------------------|--------------------|------------------------------|
| **Drive 1** (control, no pause) | **PASS** — single trip, natural CLICKHOUSE_END_ASSIST terminal | **NOT_EXERCISED** (0 pause episodes) | **NOT_EXERCISED** (`everEvaluated=false`) |
| **Drive 2** (one trip, ~5 min pause) | **FAIL** — live FSM terminated trip **during** operator pause; reconciliation later split into 2 DB rows | **NOT_EXERCISED** (0 pause episodes persisted) | **PASS** (blocked counterfactual only; no false admission) |

Drive 2 is the critical finding: the authoritative FSM entered `POSSIBLE_END` at `20:48:24Z` (1 min after operator pause start) via `full_inactivity_ignition_off`, reached `RESTING` at `20:52:23Z` **before operator resume** (`20:52:00Z`), with validated end `20:48:03Z`. Reconciliation applied `INTRA_TRIP_GAP_SPLIT` + `PARTIAL_TRIP_BOUNDARY_EXTENSION` on `2026-09-17T00:20:27Z` — **not** natural live FSM birth of a second trip.

---

## Phase A — Production identity / shadow eligibility

### Drive 1 window (~`11:40`–`12:04` UTC)

| Field | Value |
|-------|-------|
| PRODUCTION_RELEASE_DURING_DRIVE | `20260916074617_v4994` |
| PRODUCTION_SHA_DURING_DRIVE | `295635fcfcb84dcaabf24f796a5827c66a0da2f8` |
| Deploy evidence | PM2 pre-deploy dump `20260916075632`; release predates Drive 1 start |
| PR_1648_PRESENT_IN_PRODUCTION | **YES** (ancestor of `295635f`) |
| SHADOW_DIST_ARTIFACTS_PRESENT | **YES** — 6 `trip-fsm-shadow-*.js` modules + audit script in release dist |
| RUN_SHADOW_HOOK_PRESENT_IN_COMPILED_DIST | **YES** — `trip-fsm-shadow-observability.integration.js` present |
| SHADOW_ENV_ENABLED | **YES** — `TRIP_FSM_SHADOW_OBSERVABILITY_ENABLED=true` |
| SHADOW_ALLOWLIST_EFFECTIVE | **YES** — `TRIP_FSM_SHADOW_VEHICLE_IDS=a60c0749-a7cd-494e-b5b9-dea3c6b97d63` |
| KS_MX_2024_SHADOW_ELIGIBLE | **YES** |
| SAME_SHA_ALL_REPLICAS | **YES** (inferred — single release active during drive; current peer build id matches release git) |
| SCHEDULER_LEADER_COUNT | **1** (Redis `synqdrive:scheduler:leader` single holder at audit time) |
| DUPLICATE_SCHEDULER_AUTHORITY | **NO** |

### Drive 2 window (~`20:33`–`20:58` UTC)

| Field | Value |
|-------|-------|
| PRODUCTION_RELEASE_DURING_DRIVE | `20260916153903_v4994` |
| PRODUCTION_SHA_DURING_DRIVE | `102b3f917a53e95c374dce0fafc6e34a69d1b9aa` |
| Deploy evidence | `last-deploy-state.env` CAPTURED_AT=`2026-09-16T15:51:58Z`; PREVIOUS_SHA=`295635f…` |
| PR_1648_PRESENT_IN_PRODUCTION | **YES** (ancestor of `102b3f9`) |
| SHADOW_DIST_ARTIFACTS_PRESENT | **YES** — same 6 shadow modules in release dist |
| RUN_SHADOW_HOOK_PRESENT_IN_COMPILED_DIST | **YES** |
| SHADOW_ENV_ENABLED | **YES** |
| SHADOW_ALLOWLIST_EFFECTIVE | **YES** |
| KS_MX_2024_SHADOW_ELIGIBLE | **YES** |
| SAME_SHA_ALL_REPLICAS | **YES** — `synqdrive` + `synqdrive-b` both on `/opt/synqdrive/current`; `SYNQDRIVE_REPLICA_PEER_BUILD_IDS=102b3f917a53e95c374dce0fafc6e34a69d1b9aa` |
| SCHEDULER_LEADER_COUNT | **1** |
| DUPLICATE_SCHEDULER_AUTHORITY | **NO** |

Both drives ran with compiled #1648 shadow code and env allowlist — unlike the 2026-09-15 Drive 1 deployment-artifact gap (`bd3fd7806` / 0 shadow dist files).

---

## Phase B — Canonical trips

### Drive 1 (`2026-09-16T11:10:00Z` – `12:40:00Z`)

| Field | Value |
|-------|-------|
| DRIVE1_CANONICAL_TRIP_ID | `a6b22163-a47d-42f0-a02d-fb5ef3b28dd0` |
| DRIVE1_TRIP_COUNT | **1** |
| DRIVE1_FALSE_SPLIT_OBSERVED | **NO** |
| DRIVE1_DUPLICATE_TRIP_OBSERVED | **NO** |
| start_time | `2026-09-16T11:42:00Z` |
| end_time | `2026-09-16T12:05:15Z` |
| trip_status | `COMPLETED` |
| endRecognizedAt | `2026-09-16T12:07:10.160Z` |
| endTimeSource | `clickhouse_segment_end` |
| endDetectionMode | `CLICKHOUSE_END_ASSIST` |
| DRIVE1_START_ERROR_SECONDS | **+120** (detected 11:42 vs operator 11:40) |
| DRIVE1_END_ERROR_SECONDS | **+75** (end_time 12:05:15 vs operator 12:04) |

Terminal shadow summary persisted on trip row (`raw_detection_meta.shadowObservability`): `episodeCount=0`, `providerSilence.everEvaluated=false`. Zero tracking runs carried inline shadow payloads.

### Drive 2 (`2026-09-16T20:00:00Z` – `22:00:00Z`)

| Field | Value |
|-------|-------|
| DRIVE2_OPERATOR_INTENDED_TRIP_COUNT | **1** |
| DRIVE2_DB_TRIP_COUNT | **2** |
| DRIVE2_CANONICAL_TRIP_ID (live authoritative) | `a1aab26a-b42e-4ea9-9c55-5350f9690152` |
| DRIVE2_ADDITIONAL_TRIP_IDS | `064dfaf4-1e4a-44e2-a4d9-4989bf90aa46` |
| FALSE_SPLIT_AT_PAUSE | **YES** (live premature terminalization during pause; reconciliation split later) |
| PAUSE_CAUSED_TRIP_COMPLETION | **YES** (live FSM `RESTING` @ `20:52:23Z` during operator pause) |
| PAUSE_CAUSED_NEW_TRIP_CREATION | **SUPERSEDED** — see [root-cause addendum](KS_MX_2024_POST_1648_FALSE_TERMINAL_ROOT_CAUSE_2026-09-16.md): **NO live trip at resume**; reconciliation synthetic Trip B @ `2026-09-17T00:20:27Z` only |

#### Trip A — live FSM (`a1aab26a…`)

| Field | Value |
|-------|-------|
| start_time | `2026-09-16T20:33:00Z` |
| end_time | `2026-09-16T20:48:03Z` |
| trip_source | `V2_LIVE` → later `is_repaired=true` |
| tracking runs | **29** |
| split meta (post-reconciliation) | `splitReason=retroactive_intra_trip_gap_split`, `splitGapMs=259000`, `splitSecondStartAt=20:52:22Z` |

#### Trip B — reconciliation artifact (`064dfaf4…`)

| Field | Value |
|-------|-------|
| start_time | `2026-09-16T20:52:22Z` |
| end_time | `2026-09-16T21:01:00Z` |
| trip_source | `REPAIRED` |
| created_at | `2026-09-17T00:20:27.205Z` |
| tracking runs | **0** |

#### First causal lifecycle boundary (Drive 2)

1. **`20:48:24Z`** — `ACTIVE_TRACKING` transitions `ACTIVE_TRIP` → `POSSIBLE_END` with reason **`full_inactivity_ignition_off`** (first boundary during operator pause; operator pause start `20:47:00Z`).
2. **`20:50:24Z`** — `END_VALIDATION` attempt 1: **`cusum_still_ongoing`** → reverts to `ACTIVE_TRIP` (movement invalidation path not triggered; `resumeCheckOutcome=NO_RESUME_EVIDENCE`).
3. **`20:52:23Z`** — `END_VALIDATION` attempt 2: **`clickhouse_end_assist_skip_cusum`**, `validatedEndTime=2026-09-16T20:48:03.000Z` → **`RESTING`** (trip terminated during pause, before operator resume at `20:52:00Z`).
4. **`2026-09-17T00:20:27Z`** — reconciliation `INTRA_TRIP_GAP_SPLIT` (259s waypoint gap, tier=warm) creates Trip B; not a live same-day FSM split at pause.

---

## Phase C — FSM timeline (Drive 2, `20:33Z` → RESTING)

| UTC | state_at_run | result_state | run_type | Notes |
|-----|--------------|--------------|----------|-------|
| 20:33–20:47 | ACTIVE_TRIP | ACTIVE_TRIP | ACTIVE_TRACKING | Continuous driving |
| 20:48:24 | ACTIVE_TRIP | **POSSIBLE_END** | ACTIVE_TRACKING | **`full_inactivity_ignition_off`** — pause start +60s |
| 20:48:54–20:50:23 | POSSIBLE_END | POSSIBLE_END | POSSIBLE_END_CHECK | Stability window; `physicalInactivityMs` 130k–219k |
| 20:50:24 | POSSIBLE_END | **ACTIVE_TRIP** | **END_VALIDATION** | CUSUM still ongoing — brief reopen |
| 20:50:54 | ACTIVE_TRIP | POSSIBLE_END | ACTIVE_TRACKING | Re-entered possible end |
| 20:52:23 | POSSIBLE_END | **RESTING** | **END_VALIDATION** | **`clickhouse_end_assist_skip_cusum`** |
| 20:52:24 | POSSIBLE_END | RESTING | FINALIZATION_CHECK | Finalize chain |

### Pause-window answers

| Field | Value |
|-------|-------|
| FSM_STATE_AT_PAUSE_START (`20:47Z`) | **ACTIVE_TRIP** (last ACTIVE run `20:47:24Z`) |
| FSM_STATE_DURING_PAUSE | **POSSIBLE_END** (from `20:48:24Z`) |
| POSSIBLE_END_REACHED_DURING_PAUSE | **YES** |
| END_VALIDATION_REACHED_DURING_PAUSE | **YES** (×2) |
| TRIP_COMPLETED_DURING_PAUSE | **YES** (`RESTING` @ `20:52:23Z`) |
| MOVEMENT_RESUME_DETECTED | **NO** (`resumeCheckOutcome=NO_RESUME_EVIDENCE` on both EV runs) |
| FSM_STATE_AFTER_RESUME | N/A — already **RESTING** before operator resume |
| SAME_ACTIVE_TRIP_ID_AFTER_RESUME | **NO** — live trip terminated; reconciliation later created `064dfaf4…` |

**Note:** Zero `IDLE_WITHIN_TRIP` tracking runs on Trip A — pause shadow episode detector had no idle-within-trip signal path during this pause.

---

## Phase D — #1648 pause/resume shadow (Drive 2)

| Field | Value |
|-------|-------|
| PAUSE_EPISODE_COUNT | **0** |
| Persisted pause episodes | **none** (trip row shadow absent; single tracking-run shadow @ `20:42:23Z` has `episodeCount=0`) |
| SAME_TRIP_RESUME_OBSERVED | **NO** |
| PAUSE_CORRELATED_TO_SAME_TRIP | **NO** |
| PAUSE_GENERATION_MATCH_VALID | **N/A** (no episodes) |
| STALE_GENERATION_ACCEPTED | **NO** |
| CROSS_TRIP_PAUSE_CORRELATION | **NO** |
| CROSS_VEHICLE_PAUSE_CORRELATION | **NO** |

Only shadow evaluation: tracking run @ `20:42:23Z` (before pause), providerSilence `OBSERVED_BLOCKED` / `operational_inactivity_below_threshold`. **No shadow persisted during `20:47`–`20:52` pause window.**

---

## Phase E — Provider-silence shadow during pause

| Field | Value |
|-------|-------|
| DID_PROVIDER_SILENCE_BECOME_ELIGIBLE_DURING_5MIN_PAUSE | **NO** |
| SHADOW_PROVIDER_SILENCE_STATUS (sole eval @ 20:42) | `OBSERVED_BLOCKED` |
| SHADOW_BLOCK_REASON | `operational_inactivity_below_threshold` |
| SHADOW_CANDIDATE_TRUST | null |
| REAL_WINNING_END_PATH_AT_THAT_TIME | null (eval pre-terminal) |
| DID_SHADOW_CANDIDATE_SURVIVE_UNTIL_RESUME | **NO** (no candidate created) |
| WAS_SHADOW_CANDIDATE_INVALIDATED_BY_RESUMED_MOVEMENT | **N/A** |
| POST_MOVEMENT_SHADOW_CANDIDATE_SURVIVED | **NO** |

Provider-silence counterfactual did not admit a candidate; authoritative end won via inactivity + ClickHouse assist, not provider silence.

---

## Phase F — Final stop / end accuracy (Drive 2, Trip A live chain)

| Field | Value |
|-------|-------|
| REAL_WINNING_END_PATH | **CLICKHOUSE_END_ASSIST** (`clickhouse_end_assist_skip_cusum`) |
| REAL_END_CANDIDATE_AT | `2026-09-16T20:48:03Z` |
| END_CANDIDATE_SOURCE | ClickHouse segment end (validated in END_VALIDATION) |
| POSSIBLE_END_REACHED | **YES** |
| POSSIBLE_END_FIRST_AT | `2026-09-16T20:48:24Z` |
| END_VALIDATION_TRACKING_RUN_COUNT | **2** |
| COMPLETED_ATTEMPTS_SEQUENCE | attempt 1 CUSUM ongoing → attempt 2 CH assist skip CUSUM |
| CUSUM_STILL_ONGOING_COUNT | **1** |
| MAX_ATTEMPT_FALLBACK_REACHED | **NO** |
| EV4_EXECUTED | **NO** (2 EV runs only) |
| FINALIZE_REACHED | **YES** (`FINALIZATION_CHECK` @ `20:52:24Z`) |
| TRIP_COMPLETED_NATURALLY (live FSM) | **YES** — but **incorrect vs operator ground truth** |
| RESTING_REACHED | **YES** @ `20:52:23Z` |
| ACTIVE_TRIP_ID_CLEARED | **YES** (vehicle state `RESTING`, empty active trip) |
| PHYSICAL_STOP_TO_COMPLETED_SECONDS | Operator stop `20:58` vs RESTING `20:52:23` → completed **337s before** physical final stop |
| Reconciliation repair | **NOT natural** — `trip_repairs` applied ~3h58m later |

---

## Phase G — End-time accuracy

| Drive | Physical final stop | Persisted end_time | Error (seconds) | Classification |
|-------|---------------------|-------------------|-----------------|----------------|
| Drive 1 | `12:04:00Z` | `12:05:15Z` | **+75** | **ACCEPTABLE** |
| Drive 2 (live Trip A) | `20:58:00Z` | `20:48:03Z` | **−597** (end early) | **SUSPICIOUS** |
| Drive 2 (Trip B post-repair) | `20:58:00Z` | `21:01:00Z` | **+180** (end late) | **SUSPICIOUS** |

END_BOUNDARY_ACCURACY: Drive 1 **ACCEPTABLE**; Drive 2 **SUSPICIOUS**.

---

## Phase H — Safety / non-consumption (#1648 observational)

| Field | Value |
|-------|-------|
| SHADOW_CHANGED_FSM_DECISION | **NO** |
| SHADOW_CHANGED_QUEUE_BEHAVIOR | **NO** |
| SHADOW_CHANGED_END_AUTHORITY | **NO** |
| SHADOW_CHANGED_TRIP_SPLIT_POLICY | **NO** |
| EXTRA_PROVIDER_REQUESTS | **0** (shadow-only reads) |
| EXTRA_CLICKHOUSE_REQUESTS | **0** |
| EXTRA_DIMO_REQUESTS | **0** |
| EXTRA_QUEUE_JOBS | **0** |
| CROSS_TRIP_BOUNDARY_LEAK | **NO** |
| STALE_END_CYCLE_TOKEN_ACCEPTED | **NO** |
| PREVIOUS_TRIP_SHADOW_GENERATION_REUSED | **NO** |
| PREVIOUS_TRIP_CANDIDATE_REUSED | **NO** |

---

## Phase I — Verdicts

| Verdict | Result |
|---------|--------|
| DRIVE1_AUTHORITATIVE_LIFECYCLE | **PASS** |
| DRIVE1_SHADOW_AUDITABILITY | **PARTIAL** (terminal trip-row summary only; no tracking-run shadow) |
| DRIVE2_AUTHORITATIVE_LIFECYCLE | **FAIL** |
| DRIVE2_PAUSE_RESUME_BEHAVIOR | **FAIL** |
| PR_1648_PAUSE_SHADOW_STATUS | **NOT_EXERCISED** |
| PR_1648_PROVIDER_SILENCE_SHADOW_STATUS | **PASS** (blocked counterfactual; no false admission) |
| PR_1635_PHYSICAL_PATH_EXERCISED | **NO** (winning path: inactivity + ClickHouse assist, not provider-silence admission) |
| END_TIME_ACCURACY_STATUS | **REVIEW_NEEDED** |

---

## Mandatory final report block

```
AUDIT_DATE=2026-09-16
MODE=STRICT_READ_ONLY

DRIVE1_OPERATOR_START_UTC=2026-09-16T11:40:00Z
DRIVE1_OPERATOR_END_UTC=2026-09-16T12:04:00Z
DRIVE1_CANONICAL_TRIP_ID=a6b22163-a47d-42f0-a02d-fb5ef3b28dd0
DRIVE1_FALSE_SPLIT_OBSERVED=NO
DRIVE1_START_ERROR_SECONDS=120
DRIVE1_FINAL_END_ERROR_SECONDS=75
DRIVE1_AUTHORITATIVE_LIFECYCLE=PASS
DRIVE1_SHADOW_AUDITABILITY=PARTIAL

DRIVE2_OPERATOR_INITIAL_START_UTC=2026-09-16T20:33:00Z
DRIVE2_OPERATOR_PAUSE_START_UTC=2026-09-16T20:47:00Z
DRIVE2_OPERATOR_RESUME_UTC=2026-09-16T20:52:00Z
DRIVE2_OPERATOR_FINAL_END_UTC=2026-09-16T20:58:00Z
DRIVE2_OPERATOR_INTENDED_TRIP_COUNT=1

DRIVE2_DB_TRIP_COUNT=2
DRIVE2_CANONICAL_TRIP_ID=a1aab26a-b42e-4ea9-9c55-5350f9690152
FALSE_SPLIT_AT_PAUSE=YES
PAUSE_CAUSED_TRIP_COMPLETION=YES
PAUSE_CAUSED_NEW_TRIP_CREATION=NO

# CORRECTION (2026-09-16 root-cause addendum): prior YES conflated reconciliation.
# LIVE_NEW_TRIP_CREATED_AT_RESUME=NO
# RECONCILIATION_SYNTHETIC_TRIP_CREATED_LATER=YES @ 2026-09-17T00:20:27Z

PAUSE_EPISODE_COUNT=0
PAUSE_DURATION_SECONDS=300
PAUSE_OUTCOME_CLASSIFICATION=N/A
SAME_TRIP_RESUME_OBSERVED=NO
PAUSE_CORRELATED_TO_SAME_TRIP=NO
STALE_GENERATION_ACCEPTED=NO
CROSS_TRIP_PAUSE_CORRELATION=NO

PROVIDER_SILENCE_ELIGIBLE_DURING_PAUSE=NO
PROVIDER_SILENCE_CANDIDATE_INVALIDATED_ON_RESUME=N/A
POST_MOVEMENT_SHADOW_CANDIDATE_SURVIVED=NO

REAL_WINNING_END_PATH=CLICKHOUSE_END_ASSIST
FINAL_TRIP_END_AT=2026-09-16T20:48:03Z
DRIVE2_FINAL_END_ERROR_SECONDS=597

POSSIBLE_END_REACHED=YES
END_VALIDATION_TRACKING_RUN_COUNT=2
MAX_ATTEMPT_FALLBACK_REACHED=NO
FINALIZE_REACHED=YES
TRIP_COMPLETED_NATURALLY=YES
RESTING_REACHED=YES
ACTIVE_TRIP_ID_CLEARED=YES

PR_1648_PAUSE_SHADOW_STATUS=NOT_EXERCISED
PR_1648_PROVIDER_SILENCE_SHADOW_STATUS=PASS
PR_1635_PHYSICAL_PATH_EXERCISED=NO

SHADOW_CHANGED_FSM_DECISION=NO
SHADOW_CHANGED_QUEUE_BEHAVIOR=NO
SHADOW_CHANGED_END_AUTHORITY=NO
SHADOW_CHANGED_TRIP_SPLIT_POLICY=NO

PRODUCTION_MUTATED=NO
HISTORICAL_TRIPS_REPAIRED=NO

CONFIDENCE=HIGH
```

---

## Methods & limitations

- **Queries:** read-only `psql` against Production PostgreSQL via `/opt/synqdrive/shared/backend.env`; Redis `GET synqdrive:scheduler:leader`; release dist artifact inspection under `/opt/synqdrive/releases/`.
- **Tables:** `vehicle_trips`, `vehicle_trip_tracking_runs`, `vehicle_trip_detection_states`, `trip_repairs`.
- **Limitations:** Trip A `raw_detection_meta` end forensics overwritten by reconciliation split fields; historical FSM state rows not time-travelled (only latest vehicle state observed). BullMQ job archive not inspected.

## trip_repairs (Drive 2, read-only)

| repair_id | type | applied_at | summary |
|-----------|------|------------|---------|
| `75faf719-c26b-6bec-16db-a785300bf3c9` | PARTIAL_TRIP_BOUNDARY_EXTENSION | `2026-09-17T00:20:23Z` | Extend Trip A end toward DIMO segment `20:33`–`21:01` |
| `39089101-ff61-cd01-57a6-6c967c63272a` | INTRA_TRIP_GAP_SPLIT | `2026-09-17T00:20:27Z` | 259s waypoint gap → Trip B @ `20:52:22` |

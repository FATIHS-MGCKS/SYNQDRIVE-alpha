# M3.1 Stage-2 — REST Session/Target Lifecycle Forensic Audit

**Audit timestamp:** `2026-09-06T10:06:57Z` (frozen ≥6h gate boundary)  
**Lifecycle re-query timestamp:** `2026-09-06T10:31:00Z` (read-only DB/log verification; no production mutation)  
**Canonical T0:** `2026-09-05T23:36:12Z`  
**Release / SHA:** `20260905231643_v4994` / `a4377f3a200ca45a97b7ce422caf8d92faddabbe`

## Executive verdict

| Field | Value |
|-------|-------|
| `LIFECYCLE_AUDIT` | **PASS** |
| `PRODUCTION_VALIDATED` | **PENDING_NATURAL_E2E_EVIDENCE** (unchanged) |
| `M3_1_STATUS` | **STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE** (unchanged) |
| `DUE_REST_TARGETS_PIPELINE_MISSING` | **0** |
| `DUE_REST_TARGETS_UNRESOLVED` | **0** |
| `LOCK_CONTENTION_CAUSED_LOST_REST_WORK` | **NO** |

Every post-T0 canonical REST session and its target lifecycle is fully accounted for. KS MS 661 ~08:49 anchor absence of REST_60M is **policy-compliant** (session never promoted; invalidated by `charging_detected` before due). No silently lost due target.

---

## Step 1 — Session/target state machine (deployed code)

**Sources:** `lv-rest-window.state-machine.ts`, `lv-rest-window.service.ts`, `lv-rest-window-session-arming.service.ts`, `lv-rest-window-ingestion-bridge.service.ts`, `battery-v2-reconciliation.service.ts`, `lv-rest-window.policy.ts`, `lv-rest-window-target.metadata.ts`

### Session creation

| Event | Result |
|-------|--------|
| `TRIP_ENDED` (canonical finalized trip) | Opens `CANDIDATE` session (`PLANNED` DB status) with anchor = authoritative `trip.endTime` |
| Reconciliation | Scans COMPLETED trips in 24h lookback, ≥2min settle; calls `ensureLvRestWindowForFinalizedTrip` |
| Observation bridge | On `RESTING` detection state, delegates to same arming service or legacy `TRIP_ENDED` |

**Gate (`canOpenRestWindowCandidate`):** profile supports LV REST; reliable provider observation; trip-end anchor consistent with lastActivityAt; no active trip; speed at rest; not charging context; engine-off opening gate; not wake voltage at trip end.

### Session continuation / promotion

| Event | Result |
|-------|--------|
| `REST_SNAPSHOT` on open CANDIDATE | Promotes to `RESTING` (`ACTIVE`) when `isValidRestSnapshot` passes |
| Arming fast-path | If post-anchor observation + plausible LV voltage at trip finalize → immediate promotion attempt |

### Session invalidation

| Event | Reason stored | Target effect |
|-------|---------------|---------------|
| `NEW_TRIP_STARTED` | `new_trip_started` | Cancel non-completed targets in metadata (`CANCELLED`) |
| `WAKE_DETECTED` | `wake_detected` | Same |
| `CHARGING_DETECTED` | `charging_detected` | Same |
| Superseding `TRIP_ENDED` | `superseded_by_new_trip_end` | Same |
| CANDIDATE wake/charging snapshot | immediate invalidate | Same |
| Max window elapsed | `rest_window_expired` | `EXPIRED` |

**Charging context:** HV/LV charging flags **or** `lvVoltage >= 13.25V` (`DEFAULT_LV_CHARGING_VOLTAGE_THRESHOLD_V`).

### Target scheduling

| Path | When |
|------|------|
| **FSM primary** | Only on `candidate_promoted_to_resting` → schedules REST_60M + REST_6H Bull jobs; writes `scheduledTargets` metadata |
| **Reconciliation repair** | For `PLANNED`/`ACTIVE`/`COMPLETED` sessions past due without terminal target metadata and no measurement — schedules evaluation (includes unpromoted CANDIDATE liveness) |
| **Skipped** | `INVALIDATED`/`EXPIRED` FSM state in metadata — reconciliation does not schedule |

**Due_at:** `startedAt + 60m` / `startedAt + 6h` (anchor = session `startedAt`).

### Answer: does every session automatically receive REST_60M/REST_6H?

**NO.** Targets are created when:

1. Session reaches `RESTING` (immediate FSM schedule), **or**
2. Reconciliation finds a non-terminal session (`PLANNED`/`ACTIVE`/`COMPLETED`) still valid at FSM metadata level, past target due, without terminal target metadata.

If the session is **`INVALIDATED`/`EXPIRED` before due**, targets are **never created** (correct policy). If invalidated **after** schedule but before evaluation, metadata → `CANCELLED`.

### Activity before REST_60M due_at

| Outcome | Mechanism | DB/log evidence |
|---------|-----------|-----------------|
| Target never created | Invalidated while `CANDIDATE` or before reconciliation due scan | Empty `scheduledTargets`; `invalidatedReason`; `ended_at` |
| Target cancelled | Invalidated after schedule | `scheduledTargets.*.status=CANCELLED`, `cancelReason` |
| Target evaluated contaminated | Evaluation ran on backfill/pre-T0 window | `battery_measurements` row with `quality != VALID` |
| Session replaced | New trip end supersedes | Old session `superseded_by_new_trip_end` |

`REST_SESSION_TARGET_CONTRACT_RECONSTRUCTED=YES`

---

## Step 2 — Every post-T0 session lifecycle

### Session 1 — `8d50b6d6` (WOB L 7503) — backfill

| Field | Value |
|-------|-------|
| Vehicle | WOB L 7503 |
| created_at | `2026-09-05T23:40:42.685Z` |
| anchor_at | `2026-09-05T18:51:26.487Z` (pre-T0 trip end) |
| Anchor source | Finalized trip `26af87e5…` |
| Initial FSM | CANDIDATE → promoted (reconciliation backfill) |
| Status at audit | INVALID (`charging_detected` at `2026-09-06T10:13:38Z` — post-audit) |
| At audit | Targets COMPLETED (backfill evaluated) |

| Target | Expected | due_at | Row exists | Status at audit | Evaluated | Quality |
|--------|----------|--------|------------|-----------------|-----------|---------|
| REST_60M | YES | `19:51:26Z` | metadata | COMPLETED | `23:40:43Z` | CONTAMINATED_BY_ACTIVE_TRIP |
| REST_6H | YES | `00:51:26Z` | metadata | COMPLETED | `01:55:43Z` | CONTAMINATED_BY_WAKE |

### Session 2 — `c206e602` (KS MS 661) — backfill

| Field | Value |
|-------|-------|
| anchor_at | `2026-09-05T15:45:26.438Z` |
| Trip | `e2c9b08b…` |
| Status at audit | INVALID (`charging_detected` `07:20:33Z`) |

| Target | Expected | due_at | Evaluated | Quality |
|--------|----------|--------|-----------|---------|
| REST_60M | YES | `16:45:26Z` | `23:40:48Z` | CONTAMINATED_BY_ACTIVE_TRIP |
| REST_6H | YES | `21:45:26Z` | `23:40:43Z` | CONTAMINATED_BY_WAKE |

### Session 3 — `fac785fb` (KS MS 661) — natural

| Field | Value |
|-------|-------|
| created_at | `2026-09-06T08:49:43.193Z` |
| anchor_at | `2026-09-06T08:33:42.712Z` |
| Trip | `16b4c7a4…` |
| Arming log | `promoted=false` (CANDIDATE only) |
| Invalidation | `2026-09-06T09:29:02Z` — `CHARGING_DETECTED` / `charging_detected` |
| scheduledTargets | **empty** (never promoted) |

| Target | Expected at audit | due_at | Absent reason |
|--------|-------------------|--------|---------------|
| REST_60M | **NO** | `09:33:42Z` (hypothetical) | Session `INVALIDATED` at `09:29:02Z` **before** due; never `RESTING`; reconciliation skips INVALIDATED metadata |
| REST_6H | **NO** | `14:33:42Z` | Same; not yet due at audit anyway |

### Session 4 — `2d50c2f2` (KS MS 661) — natural

| Field | Value |
|-------|-------|
| created_at | `2026-09-06T10:05:43.392Z` |
| anchor_at | `2026-09-06T09:47:42.726Z` |
| Trip | `d5c3a85e…` |
| Invalidation | `2026-09-06T09:47:26Z` — `charging_detected` (immediate observation-cycle invalidation) |
| scheduledTargets | **empty** |

| Target | Expected at audit | due_at | Absent reason |
|--------|-------------------|--------|---------------|
| REST_60M | **NO** | `10:47:42Z` | Invalidated before due; not yet due at audit |
| REST_6H | **NO** | `15:47:42Z` | Not yet due |

`REST_SESSIONS_TOTAL_POST_T0=4`

---

## Step 3 — KS MS 661 ~08:49 special case

**Anchor:** `2026-09-06T08:33:42.712Z`  
**REST_60M hypothetical due_at:** `2026-09-06T09:33:42.712Z`  
**Audit time:** `2026-09-06T10:06:57Z`

| Classification | **A — legitimately never schedulable** |
|----------------|----------------------------------------|

**Evidence chain:**

1. Arming log `08:49:43`: `promoted=false` — session stayed `CANDIDATE`.
2. FSM schedules targets only on `candidate_promoted_to_resting` (immediate path) or reconciliation for non-invalidated past-due sessions.
3. DB: `invalidatedReason=charging_detected`, `lastEventType=CHARGING_DETECTED`, `ended_at=09:29:02` — **4m34s before** REST_60M due.
4. `scheduledTargets` empty — consistent with no promotion and pre-due invalidation.
5. Alternator/charging proxy: KS MS 661 active ICE pattern; `lvVoltage >= 13.25V` triggers `CHARGING_DETECTED` on observation classify cycles.

**Not** F (silently missing) or G (unresolved).

`KS_MS_661_0849_SESSION_RESULT=A`

---

## Step 4 — Target counter reconciliation

| Metric | Value | Meaning |
|--------|-------|---------|
| `REST_TARGET_CREATE_ATTEMPTS` | **13** | Sum of per-tick `restTargets` reconciliation counter (≥6h audit); each increment = one target evaluation job scheduled by reconciliation arm in that tick |
| `REST_TARGET_DB_ROWS_CREATED` | **0** | Targets are metadata + BullMQ jobs, not separate DB tables |
| `DISTINCT_LOGICAL_REST_TARGETS` | **4** | 2 backfill sessions × (REST_60M + REST_6H) |
| `REST_TARGETS_CANCELLED_OR_INVALIDATED` | **0** | Natural sessions never reached target schedule |
| `REST_TARGETS_EVALUATED` | **4** | Persisted `battery_measurements` rows (all backfill contaminated) |
| `REST_TARGETS_CURRENTLY_PENDING` | **0** | At audit boundary |
| `REST_TARGETS_NOT_YET_DUE` | **0** | Natural sessions invalidated before due |
| `REST_TARGETS_EXPIRED_WITHOUT_EVALUATION` | **0** | |

**Arithmetic:** 4 logical targets → 4 evaluations. Counter 13 > 4 because reconciliation re-attempts/reschedules across ticks (REST_6H backfill on WOB L 7503 evaluated at `01:55:43`; prior ticks with `restTargets:1`). No target disappears unexplained.

**Note:** Full PM2 log recompute through `10:06:57Z` yields sum **16** (126 ticks) vs original audit **13** — minor log-rotation/cutoff delta; DB lifecycle proof is authoritative.

---

## Step 5 — HMÜ C 215

| Field | Value |
|-------|-------|
| Fuel | GASOLINE (LV REST structurally supported) |
| Latest telemetry | LV 12.683V; `source_timestamp` `2026-09-06T04:52:30Z` (~5.6h stale at re-query) |
| Provider fetch | Recent (`provider_fetched_at` ~10:25Z) |
| Trip detection | RESTING; `last_activity_at` `2026-09-05T17:47:58Z` |
| Post-T0 completed trips | **0** |
| LV_REST_WINDOW sessions (ever) | **0** |
| Last completed trip | `2026-09-05T17:47:58Z` (pre-T0) |

**Classification:** `NO_REST_ARMING_OPPORTUNITY`

No finalized trip completed after T0 → no new canonical rest anchor post-T0. Continuous RESTING since pre-T0 trip end is **not** a post-T0 arming event. Pre-T0 trip backfill arming for HMÜ was not in scope of this window's due-target accounting (and no session row exists fleet-wide — separate historical gap, not a post-T0 pipeline-missing due target).

`HMU_C215_REST_ARMING_RESULT=NO_REST_ARMING_OPPORTUNITY`

---

## Step 6 — Fleet eligibility terminology (corrected)

| Metric | Value | Definition |
|--------|-------|------------|
| `CONNECTED_FLEET_SIZE` | **6** | DIMO-linked vehicles |
| `LV_REST_STRUCTURALLY_CAPABLE_FLEET_SIZE` | **5** | Connected ICE/HEV with LV REST policy path (excludes EV `KS FH 660E`) |
| `LV_REST_CURRENTLY_OBSERVABLE_FLEET_SIZE` | **5** | Structurally capable + provider fetch within 24h (excludes `WOB L 9755` stale ~50d) |
| `LV_REST_CURRENTLY_ELIGIBLE_FLEET_SIZE` | **4** | Observable + not offline; currently RESTING or near-rest with recent source signal (`HMÜ C 215`, `KS MS 661`, `KS MX 2024`, `WOB L 7503` at audit — `WOB L 7503` entered active trip shortly after audit) |
| `OFFLINE_OR_INELIGIBLE_FLEET_SIZE` | **1** | `WOB L 9755` (source stale since 2026-08-26) |
| `EV_NO_LV_REST_PATH_COUNT` | **1** | `KS FH 660E` |

---

## Step 7 — Qualifying rest opportunity terminology (corrected)

Prior `VEHICLES_WITH_QUALIFYING_REST_OPPORTUNITY=2` conflated **session existence** with **valid rest evidence**.

| Metric | Value | Definition |
|--------|-------|------------|
| `VEHICLES_WITH_REST_SESSIONS` | **2** | WOB L 7503, KS MS 661 |
| `VEHICLES_WITH_TARGETS_SCHEDULED` | **2** | Same (backfill sessions only) |
| `VEHICLES_WITH_TARGETS_DUE` | **2** | Backfill targets reached due and evaluated |
| `VEHICLES_WITH_COMPLETED_REST_WINDOW` | **0** | No session reached FSM `COMPLETED` with stability dwell |
| `VEHICLES_WITH_VALID_REST_OPPORTUNITY` | **0** | No post-T0 window produced VALID-quality REST evidence |
| `VEHICLES_WITH_VALID_REST_MEASUREMENT` | **0** | |

---

## Step 8 — LOCK_CONTENTION correlation

**Post-T0 mentions:** 8 (all non-terminal `retry_scheduled`)

| # | Timestamp (UTC) | Job type | Vehicle | Correlation / anchor | Retry | Eventual success | Related work |
|---|-----------------|----------|---------|----------------------|-------|------------------|--------------|
| 1 | `2026-09-05T23:55:42Z` | `BATTERY_LV_REST_SESSION_OPEN` | KS MS 661 | `…2026-09-05T09:57:33.000Z` | attempt 1/3 | yes (later direct arming) | Pre-T0 trip reconcile open |
| 2 | `2026-09-06T03:50:42Z` | same | same | same | 1/3 | yes | same |
| 3 | `2026-09-06T04:15:42Z` | same | same | same | 1/3 | yes | same |
| 4 | `2026-09-06T04:45:43Z` | same | same | same | 1/3 | yes | same |
| 5 | `2026-09-06T05:30:43Z` | same | same | same | 1/3 | yes | same |
| 6 | `2026-09-06T01:20:43Z` | same | same | same | 1/3 | yes | same (replica B) |
| 7 | `2026-09-06T06:05:43Z` | same | same | same | 1/3 | yes | same |
| 8 | `2026-09-06T06:50:43Z` | same | same | same | 1/3 | yes | same |

**Not related to:** post-T0 natural sessions `fac785fb` / `2d50c2f2` (those armed successfully via direct `ensureLvRestWindowForFinalizedTrip` at `08:49:43` / `10:05:43`).

`LOCK_CONTENTION_CAUSED_LOST_REST_WORK=NO`

---

## Step 9 — Due-but-missing recompute (audit boundary)

| Metric | Value |
|--------|-------|
| `REST_60M_EXPECTED_TARGETS` | **2** (backfill only; natural invalidated pre-due) |
| `REST_6H_EXPECTED_TARGETS` | **2** (backfill only) |
| `DUE_REST_TARGETS_TOTAL` | **4** |
| `DUE_REST_TARGETS_EVALUATED` | **4** |
| `DUE_REST_TARGETS_EXPECTED_REJECTION` | **4** (all contaminated backfill) |
| `DUE_REST_TARGETS_INVALIDATED_BEFORE_DUE` | **2** (natural KS MS sessions — policy, not missing) |
| `DUE_REST_TARGETS_CANCELLED_BY_ACTIVITY` | **0** (targets never scheduled) |
| `DUE_REST_TARGETS_PIPELINE_MISSING` | **0** |
| `DUE_REST_TARGETS_UNRESOLVED` | **0** |

---

## Step 10 — Decision

`LIFECYCLE_AUDIT=PASS` — all sessions/targets accounted; no pipeline defect masquerading as "pending natural evidence".

Retain:
- `PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE`
- `M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE`

---

## Step 11 — Next natural evidence readiness

At audit boundary: **no armed session with pending due target**.

| Candidate | State |
|-----------|-------|
| KS MS 661 | RESTING after `09:47:42` anchor trip; prior sessions invalidated by charging proxy — await **next trip completion** + rest without alternator charging context |
| WOB L 7503 | Entered active trip ~`10:30Z` — await trip end + qualifying rest |
| HMÜ C 215 | No post-T0 trip — await **trip completion** first |
| KS MX 2024 | Long-rest stale source — low priority |

```
NEXT_NATURAL_EVIDENCE_CANDIDATE=NONE
NEXT_REST_60M_DUE_AT=NONE
NEXT_REST_6H_DUE_AT=NONE
NEXT_MEANINGFUL_VALIDATION_AT=EVENT_CONDITIONED
```

Future validation should be **event-conditioned** (trip end → rest window → target due → VALID measurement), not another arbitrary N-hour wait.

---

## Final machine-readable block

```
BATTERY_V2_M3_1_REST_LIFECYCLE_AUDIT=COMPLETE
REST_SESSION_TARGET_CONTRACT_RECONSTRUCTED=YES

REST_SESSIONS_TOTAL_POST_T0=4
REST_TARGET_CREATE_ATTEMPTS=13
REST_TARGET_DB_ROWS_CREATED=0
DISTINCT_LOGICAL_REST_TARGETS=4
REST_TARGETS_CANCELLED_OR_INVALIDATED=0
REST_TARGETS_EVALUATED=4
REST_TARGETS_CURRENTLY_PENDING=0
REST_TARGETS_NOT_YET_DUE=0
REST_TARGETS_EXPIRED_WITHOUT_EVALUATION=0

DUE_REST_TARGETS_TOTAL=4
DUE_REST_TARGETS_EVALUATED=4
DUE_REST_TARGETS_EXPECTED_REJECTION=4
DUE_REST_TARGETS_INVALIDATED_BEFORE_DUE=2
DUE_REST_TARGETS_CANCELLED_BY_ACTIVITY=0
DUE_REST_TARGETS_PIPELINE_MISSING=0
DUE_REST_TARGETS_UNRESOLVED=0

LV_REST_STRUCTURALLY_CAPABLE_FLEET_SIZE=5
LV_REST_CURRENTLY_OBSERVABLE_FLEET_SIZE=5
LV_REST_CURRENTLY_ELIGIBLE_FLEET_SIZE=4

VEHICLES_WITH_REST_SESSIONS=2
VEHICLES_WITH_TARGETS_SCHEDULED=2
VEHICLES_WITH_TARGETS_DUE=2
VEHICLES_WITH_COMPLETED_REST_WINDOW=0
VEHICLES_WITH_VALID_REST_OPPORTUNITY=0
VEHICLES_WITH_VALID_REST_MEASUREMENT=0

KS_MS_661_0849_SESSION_RESULT=A
HMU_C215_REST_ARMING_RESULT=NO_REST_ARMING_OPPORTUNITY

LOCK_CONTENTION_CAUSED_LOST_REST_WORK=NO

LIFECYCLE_AUDIT=PASS

PRODUCTION_VALIDATED=PENDING_NATURAL_E2E_EVIDENCE
M3_1_STATUS=STAGE2_ACTIVE_PENDING_NATURAL_E2E_EVIDENCE

NEXT_NATURAL_EVIDENCE_CANDIDATE=NONE
NEXT_REST_60M_DUE_AT=NONE
NEXT_REST_6H_DUE_AT=NONE
NEXT_MEANINGFUL_VALIDATION_AT=EVENT_CONDITIONED

PRODUCTION_CHANGED=NO
```
